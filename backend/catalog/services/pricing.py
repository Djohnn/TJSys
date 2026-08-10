import hashlib
import json
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from uuid import UUID

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_datetime


def _effective_candidates(queryset, *, at):
    period = Q(valid_from__lte=at) & (Q(valid_to__isnull=True) | Q(valid_to__gt=at))
    return list(queryset.filter(is_active=True).filter(period)[:2])


def _unique_effective_price(queryset, *, at):
    """Return the sole effective price, or ``None`` when absent/ambiguous."""
    matches = _effective_candidates(queryset, at=at)
    return matches[0] if len(matches) == 1 else None


class PriceNotAvailable(Exception):
    def __init__(self, product_id, branch_id):
        self.product_id = product_id
        self.branch_id = branch_id
        super().__init__(f'No active price for product {product_id} at branch {branch_id}.')


def resolve_effective_price(*, product, branch, at=None):
    if at is None:
        at = timezone.now()
    from catalog.models import BranchPrice, ProductPrice

    branch_candidates = _effective_candidates(
        BranchPrice.objects.filter(product=product, branch=branch), at=at,
    )
    if len(branch_candidates) > 1:
        raise PriceNotAvailable(product.id, branch.id)
    branch_price = branch_candidates[0] if branch_candidates else None
    if branch_price is not None:
        return branch_price
    tenant_candidates = _effective_candidates(ProductPrice.objects.filter(product=product), at=at)
    tenant_price = tenant_candidates[0] if len(tenant_candidates) == 1 else None
    if tenant_price is not None:
        return tenant_price
    raise PriceNotAvailable(product.id, branch.id)


@dataclass(frozen=True)
class SprintR4Command:
    tenant_id: UUID
    command_id: UUID
    payload: dict[str, object]


class R4CommandConflict(ValueError):
    """A command id was already used for a different payload."""


def latest_confirmed_cost(*, product):
    """Return the unit cost from the most recent confirmed purchase receipt."""
    from purchasing.models import PurchaseReceiptItem

    item = (
        PurchaseReceiptItem.all_objects
        .filter(
            tenant_id=product.tenant_id,
            purchase_order_item__tenant_id=product.tenant_id,
            purchase_order_item__product_id=product.id,
            receipt__tenant_id=product.tenant_id,
            receipt__status='confirmed',
        )
        .select_related('receipt')
        .order_by('-receipt__created_at', '-created_at')
        .first()
    )
    return item.unit_cost if item is not None else None


def _margin_percent(*, amount, cost):
    if amount is None or cost is None or amount <= 0:
        return None
    return ((amount - cost) / amount * Decimal('100')).quantize(
        Decimal('0.01'), rounding=ROUND_HALF_UP,
    )


def pricing_snapshot(*, product, at=None):
    """Build the API pricing snapshot without persisting derived margins."""
    if at is None:
        at = timezone.now()
    from catalog.models import ProductPrice, ProductPriceTier

    price = _unique_effective_price(
        ProductPrice.all_objects.filter(
            tenant_id=product.tenant_id,
            product_id=product.id,
        ),
        at=at,
    )
    if price is None:
        return None

    cost = latest_confirmed_cost(product=product)
    tiers = ProductPriceTier.all_objects.filter(
        tenant_id=product.tenant_id,
        product_id=product.id,
        price_id=price.id,
        is_active=True,
    ).order_by('min_quantity')
    return {
        'id': str(price.id),
        'product': str(product.id),
        'amount': f'{price.amount:.2f}',
        'cost': f'{cost:.2f}' if cost is not None else None,
        'currency': 'BRL',
        'retail_margin': (
            f'{_margin_percent(amount=price.amount, cost=cost):.2f}'
            if cost is not None else None
        ),
        'tiers': [
            {
                'id': str(tier.id),
                'min_quantity': f'{tier.min_quantity:.6f}',
                'amount': f'{tier.amount:.2f}',
                'margin': (
                    f'{_margin_percent(amount=tier.amount, cost=cost):.2f}'
                    if cost is not None else None
                ),
            }
            for tier in tiers
        ],
        'valid_from': price.valid_from.isoformat() if price.valid_from else None,
        'valid_to': price.valid_to.isoformat() if price.valid_to else None,
        'version': price.version,
    }


def _command_hash(payload):
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(',', ':'), default=str).encode()
    ).hexdigest()


@transaction.atomic
def execute_r4_command(command: SprintR4Command) -> dict[str, object]:
    """Persist a retail price and optional wholesale tiers atomically."""
    if not command.payload:
        raise ValueError('payload must not be empty')
    if not command.payload.get('product_id') or command.payload.get('amount') is None:
        raise ValueError('product_id and amount are required')

    from catalog.models import Product, ProductApplyCommand, ProductPrice, ProductPriceTier
    from tenancy.models import Tenant

    tenant = Tenant.objects.get(id=command.tenant_id)
    payload_hash = _command_hash(command.payload)
    receipt = (
        ProductApplyCommand.all_objects.select_for_update()
        .filter(tenant_id=tenant.id, command_id=str(command.command_id))
        .first()
    )
    if receipt is not None:
        if receipt.payload_hash != payload_hash:
            raise R4CommandConflict('The command id was already used with a different payload.')
        return receipt.response_json

    product = Product.all_objects.select_for_update().get(
        id=command.payload['product_id'], tenant_id=tenant.id,
    )
    try:
        amount = Decimal(str(command.payload['amount']))
    except (InvalidOperation, TypeError) as exc:
        raise ValueError('amount must be a valid decimal') from exc
    if amount < 0:
        raise ValueError('amount must not be negative')

    valid_from = command.payload.get('valid_from')
    if valid_from:
        valid_from = parse_datetime(str(valid_from))
        if valid_from is None:
            raise ValueError('valid_from must be a valid datetime')
    else:
        valid_from = timezone.now()
    ProductPrice.all_objects.filter(
        tenant_id=tenant.id,
        product_id=product.id,
        is_active=True,
        valid_from__lt=valid_from,
        valid_to__isnull=True,
    ).update(valid_to=valid_from)
    price = ProductPrice(
        tenant=tenant,
        product=product,
        amount=amount,
        valid_from=valid_from,
    )
    price.full_clean()
    price.save()
    for tier_data in command.payload.get('tiers', []):
        tier = ProductPriceTier(
            tenant=tenant,
            product=product,
            price=price,
            min_quantity=Decimal(str(tier_data['min_quantity'])),
            amount=Decimal(str(tier_data['amount'])),
        )
        tier.full_clean()
        tier.save()

    response = {
        'command_id': str(command.command_id),
        'status': 'applied',
        'product_id': str(product.id),
        'price_id': str(price.id),
    }
    ProductApplyCommand.all_objects.create(
        tenant=tenant,
        command_id=str(command.command_id),
        payload_hash=payload_hash,
        response_json=response,
        correlation_id=command.command_id,
    )
    return response
