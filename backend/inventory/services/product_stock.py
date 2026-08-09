import hashlib
import json
import uuid
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from uuid import UUID

from django.db import transaction

from audit.services import create_audit_record
from inventory.models import (
    ProductStockControlCommand,
    ProductStockPolicy,
    StockBalance,
    StockMovement,
)
from outbox.services import create_outbox_message


@dataclass
class ProductStockResult:
    policy: ProductStockPolicy
    balance: StockBalance | None = None
    operation: object | None = None


class ProductStockControlError(Exception):
    def __init__(self, message: str, code: str, status_code: int = 400, errors: dict | None = None):
        super().__init__(message)
        self.code = code
        self.status_code = status_code
        self.errors = errors or {}


@dataclass
class ProductStockControlResult:
    action: str
    policy_updated: int
    correlation_id: str


def _generate_payload_hash(payload: dict) -> str:
    encoded = json.dumps(payload, sort_keys=True, default=str).encode()
    return hashlib.sha256(encoded).hexdigest()


def _emit_stock_control_event(
    *,
    correlation_id: str,
    tenant_id: str,
    action: str,
    product_id=None,
    branch_id=None,
    location_id=None,
    policy_count=0,
    actor=None,
):
    action_map = {
        'deactivate': 'inventory.stock_control.deactivated',
        'reactivate': 'inventory.stock_control.reactivated',
    }
    event_type = action_map.get(action, f'inventory.stock_control.{action}')
    detail = {
        'action': action,
        'product_id': str(product_id) if product_id else None,
        'branch_id': str(branch_id) if branch_id else None,
        'location_id': str(location_id) if location_id else None,
        'policies_affected': policy_count,
    }
    create_audit_record(
        actor=actor,
        action=event_type,
        resource_type='ProductStockControlCommand',
        resource_id='',
        detail=detail,
        correlation_id=correlation_id,
        tenant_id=str(tenant_id),
    )
    create_outbox_message(
        event_type=event_type,
        aggregate_type='ProductStockControlCommand',
        aggregate_id='',
        payload=detail,
        correlation_id=correlation_id,
        tenant_id=str(tenant_id),
    )


def compute_stock_status(*, available, reorder_point):
    if available < 0:
        return 'negative'
    if available == 0:
        return 'zero'
    if available <= reorder_point:
        return 'low'
    return 'normal'


def _format_quantity(value):
    return format(Decimal(str(value)).normalize(), 'f')


def build_product_stock_summary(*, product, policy, balance):
    quantity = balance.quantity if balance else Decimal('0')
    reserved = balance.reserved if balance else Decimal('0')
    available = quantity - reserved
    return {
        'product': str(product.id),
        'branch': str(policy.branch_id),
        'branch_name': policy.branch.name,
        'location': str(policy.location_id),
        'location_name': policy.location.name,
        'unit_name': product.base_unit.name,
        'unit_symbol': product.base_unit.symbol,
        'unit_precision': product.base_unit.precision,
        'quantity': _format_quantity(quantity),
        'reserved': _format_quantity(reserved),
        'available': _format_quantity(available),
        'status': compute_stock_status(
            available=available,
            reorder_point=policy.reorder_point,
        ),
        'minimum_quantity': _format_quantity(policy.minimum_quantity),
        'maximum_quantity': (
            _format_quantity(policy.maximum_quantity)
            if policy.maximum_quantity is not None
            else None
        ),
        'reorder_point': _format_quantity(policy.reorder_point),
    }


@transaction.atomic
def apply_initial_product_stock(
    *,
    tenant,
    product,
    actor,
    command_id,
    data,
    correlation_id=None,
):
    from inventory.models import StockLocation
    from inventory.services.operations import create_receipt
    from tenancy.models import Branch

    branch = Branch.all_objects.get(tenant=tenant, id=data['branch'])
    location = StockLocation.all_objects.get(
        tenant=tenant,
        branch=branch,
        id=data['location'],
    )

    policy, _created = ProductStockPolicy.all_objects.update_or_create(
        tenant=tenant,
        product=product,
        branch=branch,
        location=location,
        defaults={
            'minimum_quantity': Decimal(str(data.get('minimum_quantity', 0))),
            'maximum_quantity': (
                Decimal(str(data['maximum_quantity']))
                if data.get('maximum_quantity') is not None
                else None
            ),
            'reorder_point': Decimal(str(data.get('reorder_point', 0))),
            'allow_negative': data.get('allow_negative', False),
            'is_active': True,
        },
    )
    policy.full_clean()

    initial_quantity = Decimal(str(data.get('initial_quantity', 0)))
    operation = None

    if initial_quantity > 0:
        unit = product.base_unit
        factor = Decimal(str(data.get('factor', 1)))
        # Use correlation_id as idempotency_key to maintain traceability
        idempotency_key = correlation_id if correlation_id else f'product-stock:{command_id}'
        operation = create_receipt(
            tenant=tenant,
            branch=branch,
            product=product,
            location=location,
            quantity=initial_quantity,
            unit=unit,
            factor=factor,
            idempotency_key=idempotency_key,
            actor=actor,
            reason=f'Initial stock for {product.sku}',
        )

    balance = StockBalance.all_objects.filter(
        tenant=tenant,
        product=product,
        location=location,
    ).first()

    return ProductStockResult(
        policy=policy,
        balance=balance,
        operation=operation,
    )


@transaction.atomic
def deactivate_product_stock_control(
    *,
    tenant,
    product,
    actor,
    command_id: str,
    correlation_id: str | None = None,
):
    if not command_id:
        raise ProductStockControlError(
            'command_id é obrigatório.',
            code='MISSING_COMMAND_ID',
            status_code=400,
        )

    if not correlation_id:
        correlation_id = str(uuid.uuid4())

    payload = {
        'product_id': str(product.id),
        'action': 'deactivate',
    }
    payload_hash = _generate_payload_hash(payload)

    existing = ProductStockControlCommand.all_objects.select_for_update().filter(
        tenant=tenant,
        command_id=command_id,
    ).first()

    if existing:
        if existing.payload_hash != payload_hash:
            raise ProductStockControlError(
                'Command ID já foi utilizado com payload diferente.',
                code='COMMAND_PAYLOAD_MISMATCH',
                status_code=409,
            )
        return ProductStockControlResult(
            action='deactivate',
            policy_updated=existing.response_json.get('policy_updated', 0),
            correlation_id=str(existing.correlation_id),
        )

    policies = ProductStockPolicy.all_objects.select_for_update().filter(
        tenant=tenant,
        product=product,
        is_active=True,
    )

    location_ids = list(policies.values_list('location_id', flat=True))
    balances = StockBalance.all_objects.select_for_update().filter(
        tenant=tenant,
        product=product,
        location_id__in=location_ids,
    )

    has_reservations = balances.filter(reserved__gt=0).exists()
    if has_reservations:
        raise ProductStockControlError(
            'Desativação rejeitada: existem reservas ativas.',
            code='STOCK_CONTROL_HAS_RESERVATIONS',
            status_code=409,
        )

    has_nonzero_qty = balances.exclude(quantity=0).exists()
    if has_nonzero_qty:
        raise ProductStockControlError(
            'Desativação rejeitada: existem saldos não-zero.',
            code='STOCK_CONTROL_HAS_NONZERO_BALANCE',
            status_code=409,
        )

    policy_count = policies.count()
    first_policy = policies.first()

    policies.update(is_active=False)

    command = ProductStockControlCommand.all_objects.create(
        tenant=tenant,
        command_id=command_id,
        action='deactivate',
        payload_hash=payload_hash,
        response_json={'policy_updated': policy_count},
        correlation_id=correlation_id,
    )

    _emit_stock_control_event(
        correlation_id=str(command.correlation_id),
        tenant_id=str(tenant.id),
        action='deactivate',
        product_id=str(product.id),
        branch_id=str(first_policy.branch_id) if first_policy else None,
        location_id=str(first_policy.location_id) if first_policy else None,
        policy_count=policy_count,
        actor=actor,
    )

    return ProductStockControlResult(
        action='deactivate',
        policy_updated=policy_count,
        correlation_id=str(command.correlation_id),
    )


@transaction.atomic
def reactivate_product_stock_control(
    *,
    tenant,
    product,
    actor,
    command_id: str,
    correlation_id: str | None = None,
    initial_stocks: list | None = None,
):
    if not command_id:
        raise ProductStockControlError(
            'command_id é obrigatório.',
            code='MISSING_COMMAND_ID',
            status_code=400,
        )

    if not correlation_id:
        correlation_id = str(uuid.uuid4())

    if initial_stocks is None:
        initial_stocks = []

    validated_stocks = []
    for index, stock_entry in enumerate(initial_stocks):
        if not isinstance(stock_entry, dict):
            raise ProductStockControlError(
                f'Estoque inicial inválido na posição {index}.',
                code='INVALID_INITIAL_STOCK',
                status_code=400,
            )
        try:
            location_id = UUID(str(stock_entry.get('location_id', '')))
        except (TypeError, ValueError, AttributeError):
            raise ProductStockControlError(
                f'Localização inválida na posição {index}.',
                code='INVALID_INITIAL_STOCK',
                status_code=400,
            ) from None
        try:
            quantity = Decimal(str(stock_entry.get('quantity', '')))
        except (InvalidOperation, ValueError, TypeError):
            raise ProductStockControlError(
                f'Quantidade inválida na posição {index}.',
                code='INVALID_INITIAL_STOCK',
                status_code=400,
            ) from None
        if not quantity.is_finite() or quantity <= 0:
            raise ProductStockControlError(
                f'Quantidade deve ser positiva na posição {index}.',
                code='INVALID_INITIAL_STOCK',
                status_code=400,
            )
        validated_stocks.append({'location_id': location_id, 'quantity': quantity})

    payload = {
        'product_id': str(product.id),
        'action': 'reactivate',
        'initial_stocks': sorted(
            [
                {
                    'location_id': str(s['location_id']),
                    'quantity': str(s['quantity']),
                }
                for s in validated_stocks
            ],
            key=lambda x: x['location_id'],
        ),
    }
    payload_hash = _generate_payload_hash(payload)

    existing = ProductStockControlCommand.all_objects.select_for_update().filter(
        tenant=tenant,
        command_id=command_id,
    ).first()

    if existing:
        if existing.payload_hash != payload_hash:
            raise ProductStockControlError(
                'Command ID já foi utilizado com payload diferente.',
                code='COMMAND_PAYLOAD_MISMATCH',
                status_code=409,
            )
        return ProductStockControlResult(
            action='reactivate',
            policy_updated=existing.response_json.get('policy_updated', 0),
            correlation_id=str(existing.correlation_id),
        )

    policies = ProductStockPolicy.all_objects.select_for_update().filter(
        tenant=tenant,
        product=product,
    )

    if not policies.exists():
        raise ProductStockControlError(
            'Nenhuma política de estoque encontrada para reativar.',
            code='STOCK_CONTROL_REACTIVATION_NOT_ALLOWED',
            status_code=400,
        )

    for index, stock_entry in enumerate(validated_stocks):
        if not policies.filter(location_id=stock_entry['location_id']).exists():
            raise ProductStockControlError(
                f'Localização não pertence às políticas do produto na posição {index}.',
                code='INVALID_INITIAL_STOCK',
                status_code=400,
            )

    if validated_stocks:
        locations_with_history = []
        for stock_entry in validated_stocks:
            location_id = stock_entry['location_id']
            has_movements = StockMovement.all_objects.filter(
                tenant=tenant, product=product, location_id=location_id,
            ).exists()
            has_nonzero_balance = StockBalance.all_objects.filter(
                tenant=tenant, product=product, location_id=location_id,
            ).exclude(quantity=0, reserved=0).exists()
            if has_movements or has_nonzero_balance:
                locations_with_history.append(str(location_id))
        if locations_with_history:
            raise ProductStockControlError(
                'Estoque inicial não permitido para localizações com histórico.',
                code='INITIAL_STOCK_ALREADY_HAS_HISTORY',
                status_code=409,
            )

    policies.update(is_active=True)
    policy_count = policies.count()
    first_policy = policies.first()

    operations_created = 0
    if validated_stocks:
        from inventory.services.operations import create_receipt
        for stock_entry in validated_stocks:
            location_id = stock_entry['location_id']
            quantity = stock_entry['quantity']
            policy = policies.filter(location_id=location_id).first()
            if not policy:
                continue
            idempotency_key = f'product-stock-reactivate:{command_id}:{location_id}'
            create_receipt(
                tenant=tenant,
                branch=policy.branch,
                product=product,
                location=policy.location,
                quantity=quantity,
                unit=product.base_unit,
                factor=Decimal('1'),
                idempotency_key=idempotency_key,
                actor=actor,
                reason=f'Estoque inicial na reativação de {product.sku}',
            )
            operations_created += 1

    command = ProductStockControlCommand.all_objects.create(
        tenant=tenant,
        command_id=command_id,
        action='reactivate',
        payload_hash=payload_hash,
        response_json={
            'policy_updated': policy_count,
            'operations_created': operations_created,
        },
        correlation_id=correlation_id,
    )

    _emit_stock_control_event(
        correlation_id=str(command.correlation_id),
        tenant_id=str(tenant.id),
        action='reactivate',
        product_id=str(product.id),
        branch_id=str(first_policy.branch_id) if first_policy else None,
        location_id=str(first_policy.location_id) if first_policy else None,
        policy_count=policy_count,
        actor=actor,
    )

    return ProductStockControlResult(
        action='reactivate',
        policy_updated=policy_count,
        correlation_id=str(command.correlation_id),
    )
