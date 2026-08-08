import hashlib
import json
from decimal import Decimal

from django.db import models, transaction

from audit.services import create_audit_record
from inventory.models import (
    StockBalance,
    StockMovement,
    StockOperation,
    StockOperationReversal,
)
from outbox.services import create_outbox_message


class InsufficientStock(Exception):
    pass


class InvalidLotError(Exception):
    pass


class ExpiredLotError(Exception):
    pass


class DuplicateIdempotencyKey(Exception):
    pass


def normalize_quantity(quantity, unit):
    """Validate and normalize a quantity according to its unit precision."""
    value = Decimal(str(quantity))
    precision = int(unit.precision)
    quantum = Decimal(1).scaleb(-precision)
    normalized = value.quantize(quantum)
    if value != normalized:
        raise ValueError(
            f'Quantity for {unit.symbol} supports at most {precision} decimal places.'
        )
    return normalized


def _base_quantity(quantity, factor):
    return (Decimal(str(quantity)) * Decimal(str(factor))).quantize(Decimal('0.000001'))


def _json_default(value):
    if hasattr(value, 'id'):
        return str(value.id)
    if isinstance(value, Decimal):
        return str(value)
    return str(value)


def _payload_hash(payload):
    encoded = json.dumps(payload, sort_keys=True, default=_json_default).encode()
    return hashlib.sha256(encoded).hexdigest()


def _validate_lot_rules(product, lot, *, allow_expired_lot=False):
    if product.requires_lot and lot is None:
        raise InvalidLotError('Product requires a lot.')
    if lot is not None and lot.product_id != product.id:
        raise InvalidLotError('Lot must belong to the same product.')
    if product.requires_expiry and (lot is None or lot.expiry_date is None):
        raise InvalidLotError('Product requires expiry date.')
    if lot is not None and lot.is_expired and not allow_expired_lot:
        raise ExpiredLotError('Expired lot cannot be moved by common operations.')


def _get_balance(tenant, product, location, lot=None, for_update=False):
    queryset = StockBalance.all_objects
    if for_update:
        queryset = queryset.select_for_update()
    filters = {
        'tenant': tenant,
        'product': product,
        'location': location,
        'lot': lot,
    }
    balance, _ = queryset.get_or_create(
        **filters,
        defaults={'quantity': Decimal('0'), 'reserved': Decimal('0')},
    )
    return balance


def _apply_balance_delta(tenant, product, location, quantity, lot=None):
    balance = _get_balance(tenant, product, location, lot, for_update=True)
    next_quantity = balance.quantity + quantity
    if next_quantity < 0:
        from inventory.models import ProductStockPolicy

        allows_negative = ProductStockPolicy.all_objects.filter(
            tenant=tenant,
            product=product,
            location=location,
            is_active=True,
            allow_negative=True,
        ).exists()
        if not allows_negative:
            raise InsufficientStock(
                f'Insufficient stock. Available: {balance.quantity}, required: {abs(quantity)}'
            )
    balance.quantity = next_quantity
    balance.version += 1
    balance.full_clean()
    balance.save(update_fields=['quantity', 'version', 'updated_at'])
    return balance


def get_available_stock(tenant, product, location, lot=None, exclude_reserved=False):
    balance = StockBalance.all_objects.filter(
        tenant=tenant,
        product=product,
        location=location,
        lot=lot,
    ).first()
    if balance is None:
        return Decimal('0')
    if exclude_reserved:
        return max(balance.available, Decimal('0'))
    return balance.quantity


@transaction.atomic
def reserve_stock(tenant, product, location, quantity, lot=None):
    quantity = normalize_quantity(quantity, product.base_unit)
    if quantity <= 0:
        raise ValueError('Reservation quantity must be positive.')
    balance = _get_balance(tenant, product, location, lot, for_update=True)
    if balance.reserved + quantity > balance.quantity:
        raise InsufficientStock(
            f'Cannot reserve {quantity}. Available: {balance.available}'
        )
    balance.reserved += quantity
    balance.version += 1
    balance.full_clean()
    balance.save(update_fields=['reserved', 'version', 'updated_at'])
    return balance


@transaction.atomic
def release_reservation(tenant, product, location, quantity, lot=None):
    quantity = normalize_quantity(quantity, product.base_unit)
    if quantity <= 0:
        raise ValueError('Reservation quantity must be positive.')
    balance = _get_balance(tenant, product, location, lot, for_update=True)
    balance.reserved = max(balance.reserved - quantity, Decimal('0'))
    balance.version += 1
    balance.full_clean()
    balance.save(update_fields=['reserved', 'version', 'updated_at'])
    return balance


def _emit_inventory_event(operation, event_type, actor=None):
    create_audit_record(
        actor=actor,
        action=event_type,
        resource_type='StockOperation',
        resource_id=str(operation.id),
        detail={
            'operation_type': operation.operation_type,
            'status': operation.status,
        },
        correlation_id=operation.idempotency_key,
        tenant_id=operation.tenant_id,
    )
    create_outbox_message(
        event_type=event_type,
        aggregate_type='StockOperation',
        aggregate_id=str(operation.id),
        payload={
            'operation_id': str(operation.id),
            'operation_type': operation.operation_type,
            'status': operation.status,
        },
        correlation_id=operation.idempotency_key,
        tenant_id=operation.tenant_id,
    )


def _find_idempotent_operation(tenant, idempotency_key):
    if not idempotency_key:
        return None
    return StockOperation.all_objects.filter(
        tenant=tenant,
        idempotency_key=idempotency_key,
    ).first()


@transaction.atomic
def create_stock_movement(
    *,
    operation,
    product,
    location,
    direction,
    quantity,
    unit,
    factor=1,
    lot=None,
    unit_cost=None,
    notes='',
    allow_expired_lot=False,
):
    quantity = normalize_quantity(quantity, unit)
    base_quantity = _base_quantity(quantity, factor)
    if base_quantity <= 0:
        raise ValueError('Quantity must be positive')
    _validate_lot_rules(product, lot, allow_expired_lot=allow_expired_lot)

    movement = StockMovement.all_objects.create(
        tenant=operation.tenant,
        operation=operation,
        product=product,
        location=location,
        lot=lot,
        direction=direction,
        quantity=base_quantity,
        unit=unit,
        factor=factor,
        unit_cost=unit_cost,
        notes=notes,
    )
    delta = base_quantity if direction == 'in' else -base_quantity
    _apply_balance_delta(operation.tenant, product, location, delta, lot)
    return movement


@transaction.atomic
def create_operation(
    *,
    tenant,
    operation_type,
    branch=None,
    idempotency_key='',
    actor=None,
    reason='',
    status='confirmed',
    payload=None,
):
    if not idempotency_key:
        raise ValueError('Idempotency-Key is required for stock write operations.')
    fingerprint = _payload_hash(payload or {})
    existing = _find_idempotent_operation(tenant, idempotency_key)
    if existing:
        if existing.payload_hash != fingerprint:
            raise DuplicateIdempotencyKey(
                'Idempotency key already used with a different payload.'
            )
        return existing
    operation = StockOperation.all_objects.create(
        tenant=tenant,
        operation_type=operation_type,
        branch=branch,
        idempotency_key=idempotency_key or '',
        payload_hash=fingerprint,
        actor=actor,
        reason=reason,
        status=status,
    )
    _emit_inventory_event(operation, f'inventory.{operation_type}.created', actor)
    return operation


def create_receipt(
    tenant,
    branch,
    product,
    location,
    quantity,
    unit,
    factor,
    lot=None,
    unit_cost=None,
    idempotency_key=None,
    actor=None,
    reason='',
):
    quantity = normalize_quantity(quantity, unit)
    payload = {
        'operation_type': 'receipt',
        'branch': branch,
        'product': product,
        'location': location,
        'quantity': str(quantity),
        'unit': unit,
        'factor': str(factor),
        'lot': lot,
        'unit_cost': str(unit_cost) if unit_cost is not None else None,
    }
    operation = create_operation(
        tenant=tenant,
        operation_type='receipt',
        branch=branch,
        idempotency_key=idempotency_key or '',
        actor=actor,
        reason=reason,
        payload=payload,
    )
    if not operation.movements.exists():
        create_stock_movement(
            operation=operation,
            product=product,
            location=location,
            direction='in',
            quantity=quantity,
            unit=unit,
            factor=factor,
            lot=lot,
            unit_cost=unit_cost,
        )
    return operation


def create_issue(
    tenant,
    branch,
    product,
    location,
    quantity,
    unit,
    factor,
    idempotency_key=None,
    actor=None,
    reason='',
    unit_cost=None,
    lot=None,
):
    if not product.tracks_inventory:
        return None
    quantity = normalize_quantity(quantity, unit)
    payload = {
        'operation_type': 'issue',
        'branch': branch,
        'product': product,
        'location': location,
        'quantity': str(quantity),
        'unit': unit,
        'factor': str(factor),
        'lot': lot,
        'unit_cost': str(unit_cost) if unit_cost is not None else None,
    }
    operation = create_operation(
        tenant=tenant,
        operation_type='issue',
        branch=branch,
        idempotency_key=idempotency_key or '',
        actor=actor,
        reason=reason,
        payload=payload,
    )
    if not operation.movements.exists():
        create_stock_movement(
            operation=operation,
            product=product,
            location=location,
            direction='out',
            quantity=quantity,
            unit=unit,
            factor=factor,
            lot=lot,
            unit_cost=unit_cost,
        )
    return operation


def create_adjustment(
    tenant,
    branch,
    product,
    location,
    quantity,
    unit,
    factor,
    idempotency_key=None,
    actor=None,
    reason='',
    unit_cost=None,
    lot=None,
    allow_expired_lot=False,
):
    quantity = normalize_quantity(quantity, unit)
    direction = 'in' if quantity > 0 else 'out'
    payload = {
        'operation_type': 'adjustment',
        'branch': branch,
        'product': product,
        'location': location,
        'quantity': str(quantity),
        'unit': unit,
        'factor': str(factor),
        'lot': lot,
        'unit_cost': str(unit_cost) if unit_cost is not None else None,
        'allow_expired_lot': allow_expired_lot,
    }
    operation = create_operation(
        tenant=tenant,
        operation_type='adjustment',
        branch=branch,
        idempotency_key=idempotency_key or '',
        actor=actor,
        reason=reason,
        payload=payload,
    )
    if not operation.movements.exists():
        create_stock_movement(
            operation=operation,
            product=product,
            location=location,
            direction=direction,
            quantity=abs(quantity),
            unit=unit,
            factor=factor,
            lot=lot,
            unit_cost=unit_cost,
            allow_expired_lot=allow_expired_lot,
        )
    return operation


@transaction.atomic
def create_transfer(
    tenant,
    source_branch,
    target_branch,
    product,
    source_location,
    target_location,
    quantity,
    unit,
    factor,
    idempotency_key=None,
    actor=None,
    reason='',
    lot=None,
):
    quantity = normalize_quantity(quantity, unit)
    payload = {
        'operation_type': 'transfer',
        'source_branch': source_branch,
        'target_branch': target_branch,
        'product': product,
        'source_location': source_location,
        'target_location': target_location,
        'quantity': str(quantity),
        'unit': unit,
        'factor': str(factor),
        'lot': lot,
    }
    operation = create_operation(
        tenant=tenant,
        operation_type='transfer',
        branch=source_branch,
        idempotency_key=idempotency_key or '',
        actor=actor,
        reason=reason or f'Transfer to {target_branch}',
        payload=payload,
    )
    if not operation.movements.exists():
        # Deterministically lock both balances before mutating them. The actual
        # delta is still applied by create_stock_movement after locks are held.
        balance_keys = sorted([str(source_location.id), str(target_location.id)])
        list(StockBalance.all_objects.select_for_update().filter(
            tenant=tenant,
            product=product,
            location_id__in=balance_keys,
            lot=lot,
        ).order_by('location_id'))
        create_stock_movement(
            operation=operation,
            product=product,
            location=source_location,
            direction='out',
            quantity=quantity,
            unit=unit,
            factor=factor,
            lot=lot,
        )
        create_stock_movement(
            operation=operation,
            product=product,
            location=target_location,
            direction='in',
            quantity=quantity,
            unit=unit,
            factor=factor,
            lot=lot,
        )
    return operation


@transaction.atomic
def reverse_operation(operation, reason='', idempotency_key='', actor=None):
    if operation.reversals.exists():
        raise ValueError('Operation already reversed.')
    if operation.status != 'confirmed':
        raise ValueError('Only confirmed operations can be reversed.')

    reversal = create_operation(
        tenant=operation.tenant,
        operation_type='reversal',
        branch=operation.branch,
        idempotency_key=idempotency_key,
        actor=actor,
        reason=reason,
        payload={
            'operation_type': 'reversal',
            'original_operation': operation,
            'reason': reason,
        },
    )
    for movement in operation.movements.all():
        original_quantity = movement.quantity / movement.factor
        create_stock_movement(
            operation=reversal,
            product=movement.product,
            location=movement.location,
            lot=movement.lot,
            direction='out' if movement.direction == 'in' else 'in',
            quantity=original_quantity,
            unit=movement.unit,
            factor=movement.factor,
            unit_cost=movement.unit_cost,
            notes=f'Reversal of {operation.id}',
            allow_expired_lot=True,
        )
    StockOperationReversal.all_objects.create(
        tenant=operation.tenant,
        original_operation=operation,
        reversal_operation=reversal,
        reason=reason,
    )
    operation.status = 'reversed'
    operation.version += 1
    operation.save(update_fields=['status', 'version', 'updated_at'])
    return reversal


def process_operation(operation):
    _emit_inventory_event(operation, 'inventory.operation.confirmed', operation.actor)
    return operation


def get_stock_balance(tenant, product, location, lot=None):
    balance = StockBalance.all_objects.filter(
        tenant=tenant,
        product=product,
        location=location,
        lot=lot,
    ).first()
    return balance.quantity if balance else Decimal('0')


def reconcile_stock_balances(tenant):
    movement_rows = (
        StockMovement.all_objects.filter(tenant=tenant)
        .values('product_id', 'location_id', 'lot_id')
        .annotate(
            inbound=models.Sum(
                'quantity',
                filter=models.Q(direction='in'),
                default=Decimal('0'),
            ),
            outbound=models.Sum(
                'quantity',
                filter=models.Q(direction='out'),
                default=Decimal('0'),
            ),
        )
    )
    movement_totals = {
        (row['product_id'], row['location_id'], row['lot_id']):
        row['inbound'] - row['outbound']
        for row in movement_rows
    }
    balance_rows = StockBalance.all_objects.filter(tenant=tenant)
    keys = set(movement_totals)
    keys.update(
        balance_rows.values_list('product_id', 'location_id', 'lot_id')
    )
    balances = {
        (balance.product_id, balance.location_id, balance.lot_id): balance
        for balance in balance_rows
    }
    divergences = []
    for product_id, location_id, lot_id in sorted(keys, key=lambda item: tuple(map(str, item))):
        projected = balances.get((product_id, location_id, lot_id))
        projected_quantity = projected.quantity if projected else Decimal('0')
        movement_quantity = movement_totals.get(
            (product_id, location_id, lot_id),
            Decimal('0'),
        )
        if projected_quantity != movement_quantity:
            divergences.append(
                {
                    'tenant_id': tenant.id,
                    'product_id': product_id,
                    'location_id': location_id,
                    'lot_id': lot_id,
                    'projected_quantity': projected_quantity,
                    'movement_quantity': movement_quantity,
                    'difference': projected_quantity - movement_quantity,
                }
            )
    return divergences
