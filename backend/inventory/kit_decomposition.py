from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from catalog.models import Product
from catalog.services.product_extensions import resolve_composition
from inventory.models import StockBalance, StockLocation, StockMovement, StockOperation


class InsufficientComponentStock(Exception):
    def __init__(self, shortages):
        self.shortages = shortages
        super().__init__(f'Insufficient stock for kit components: {shortages}')


@transaction.atomic
def decompose_kit_sale(*, tenant, sale, kit_product, kit_quantity, sale_event_id, location=None):
    idempotency_key = f'kit-decomp:{sale_event_id}'

    if StockOperation.all_objects.filter(
        tenant=tenant, idempotency_key=idempotency_key,
    ).exists():
        return []

    components = resolve_composition(tenant=tenant, kit_product_id=kit_product.id)
    if not components:
        raise ValidationError(f'Kit product {kit_product.sku} has no active composition.')

    if location is None:
        location = StockLocation.all_objects.filter(
            tenant=tenant, branch=sale.branch, is_primary=True,
        ).first()
        if location is None:
            raise ValidationError('No primary stock location found for branch.')

    comp_ids = [comp_id for comp_id, _, _ in components]
    comp_products = {
        p.id: p for p in Product.all_objects.filter(tenant=tenant, id__in=comp_ids)
    }

    shortages = []
    for comp_id, comp_sku, comp_qty in components:
        needed = Decimal(str(comp_qty)) * Decimal(str(kit_quantity))
        balance = StockBalance.all_objects.filter(
            tenant=tenant, product_id=comp_id, location=location,
        ).first()
        available = balance.quantity if balance else Decimal('0')
        if available < needed:
            shortages.append((comp_sku, str(available), str(needed)))

    if shortages:
        raise InsufficientComponentStock(shortages)

    operation = StockOperation.all_objects.create(
        tenant=tenant,
        operation_type='issue',
        status='confirmed',
        branch=sale.branch,
        idempotency_key=idempotency_key,
        reason=f'Kit decomposition for sale {sale.id}',
    )

    movements = []
    for comp_id, comp_sku, comp_qty in components:
        needed = Decimal(str(comp_qty)) * Decimal(str(kit_quantity))
        comp = comp_products[comp_id]

        movement = StockMovement.all_objects.create(
            tenant=tenant,
            operation=operation,
            product=comp,
            location=location,
            direction='out',
            quantity=needed,
            unit=comp.base_unit,
            factor=Decimal('1'),
            notes=f'Kit decomposition: {kit_product.sku} x {kit_quantity} -> component {comp_sku}',
        )

        balance = StockBalance.all_objects.filter(
            tenant=tenant, product_id=comp_id, location=location,
        ).first()
        if balance is not None:
            StockBalance.all_objects.filter(pk=balance.pk).update(
                quantity=F('quantity') - needed,
                version=F('version') + 1,
                updated_at=timezone.now(),
            )

        movements.append(movement)

    return movements
