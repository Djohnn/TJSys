import hashlib
import json
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from audit.services import create_audit_record
from catalog.services.pricing import resolve_effective_price
from inventory.models import StockLocation, StockMovement
from inventory.services import create_issue, create_receipt
from outbox.services import create_outbox_message
from sales.models import (
    CashMovement,
    CashSession,
    Sale,
    SaleCancellation,
    SaleItem,
    SalePayment,
    SaleRefund,
    SaleReturn,
    SaleReturnItem,
)


class DuplicateIdempotencyKey(Exception):
    pass


class CashSessionRequired(Exception):
    pass


class OpenCashSessionExists(Exception):
    pass


class PaymentMismatch(Exception):
    pass


class EmptySale(Exception):
    pass


class InsufficientReturnableQuantity(Exception):
    pass


class SaleNotCompensable(Exception):
    pass


class SaleAlreadyCancelled(Exception):
    pass


class RefundAmountExceeded(Exception):
    pass


def _money(value):
    return Decimal(str(value)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def _json_default(value):
    if hasattr(value, 'id'):
        return str(value.id)
    if isinstance(value, Decimal):
        return str(value)
    return str(value)


def _payload_hash(payload):
    encoded = json.dumps(payload, sort_keys=True, default=_json_default).encode()
    return hashlib.sha256(encoded).hexdigest()


def _emit_sales_event(*, sale, event_type, actor=None):
    create_audit_record(
        actor=actor,
        action=event_type,
        resource_type='Sale',
        resource_id=str(sale.id),
        detail={
            'status': sale.status,
            'gross_total': str(sale.gross_total),
            'net_total': str(sale.net_total),
        },
        correlation_id=sale.idempotency_key,
        tenant_id=sale.tenant_id,
    )
    create_outbox_message(
        event_type=event_type,
        aggregate_type='Sale',
        aggregate_id=str(sale.id),
        payload={
            'sale_id': str(sale.id),
            'status': sale.status,
            'gross_total': str(sale.gross_total),
            'net_total': str(sale.net_total),
        },
        correlation_id=sale.idempotency_key,
        tenant_id=sale.tenant_id,
    )


def _open_cash_session_for(tenant, branch, operator):
    return CashSession.all_objects.filter(
        tenant=tenant,
        branch=branch,
        operator=operator,
        status='open',
    ).first()


@transaction.atomic
def open_cash_session(*, tenant, branch, operator, opening_amount, idempotency_key):
    if not idempotency_key:
        raise ValueError('Idempotency-Key is required.')
    payload = {
        'branch': branch,
        'operator': operator,
        'opening_amount': str(opening_amount),
    }
    fingerprint = _payload_hash(payload)
    existing = CashSession.all_objects.filter(
        tenant=tenant,
        idempotency_key=idempotency_key,
    ).first()
    if existing:
        if existing.payload_hash != fingerprint:
            raise DuplicateIdempotencyKey('Idempotency key already used with a different payload.')
        return existing
    if _open_cash_session_for(tenant, branch, operator):
        raise OpenCashSessionExists('There is already an open cash session.')

    amount = _money(opening_amount)
    session = CashSession.all_objects.create(
        tenant=tenant,
        branch=branch,
        operator=operator,
        opening_amount=amount,
        expected_amount=amount,
        idempotency_key=idempotency_key,
        payload_hash=fingerprint,
    )
    CashMovement.all_objects.create(
        tenant=tenant,
        cash_session=session,
        movement_type='opening',
        amount=amount,
        notes='Opening balance',
    )
    return session


@transaction.atomic
def close_cash_session(*, cash_session, closing_amount, idempotency_key):
    if not idempotency_key:
        raise ValueError('Idempotency-Key is required.')
    if cash_session.status == 'closed':
        return cash_session

    sales_total = Sale.all_objects.filter(
        cash_session=cash_session,
        status='confirmed',
    ).aggregate(total=Sum('net_total'))['total'] or Decimal('0')

    cash_ins_total = CashMovement.all_objects.filter(
        cash_session=cash_session,
        movement_type='cash_in',
    ).aggregate(total=Sum('amount'))['total'] or Decimal('0')

    cash_outs_total = CashMovement.all_objects.filter(
        cash_session=cash_session,
        movement_type='cash_out',
    ).aggregate(total=Sum('amount'))['total'] or Decimal('0')

    expenses_total = CashMovement.all_objects.filter(
        cash_session=cash_session,
        movement_type='expense',
    ).aggregate(total=Sum('amount'))['total'] or Decimal('0')

    other_in_total = CashMovement.all_objects.filter(
        cash_session=cash_session,
        movement_type='other_in',
    ).aggregate(total=Sum('amount'))['total'] or Decimal('0')

    other_out_total = CashMovement.all_objects.filter(
        cash_session=cash_session,
        movement_type='other_out',
    ).aggregate(total=Sum('amount'))['total'] or Decimal('0')

    computed_expected = _money(
        cash_session.opening_amount
        + sales_total
        + cash_ins_total
        + other_in_total
        - cash_outs_total
        - expenses_total
        - other_out_total
    )

    cash_session.expected_amount = computed_expected
    closing = _money(closing_amount)
    difference = _money(computed_expected - closing)
    cash_session.status = 'closed'
    cash_session.closing_amount = closing
    cash_session.closed_at = timezone.now()
    cash_session.version += 1
    cash_session.save(
        update_fields=[
            'status',
            'closing_amount',
            'expected_amount',
            'closed_at',
            'version',
            'updated_at',
        ]
    )
    if difference != 0:
        notes = (
            f'Diferença de R$ {difference} no fechamento '
            f'(esperado R$ {computed_expected}, '
            f'declarado R$ {closing})'
        )
        CashMovement.all_objects.create(
            tenant=cash_session.tenant,
            cash_session=cash_session,
            movement_type='closing_adjustment',
            amount=abs(difference),
            notes=notes,
        )
    return cash_session


def _normalize_item(item):
    return {
        'product': item['product'],
        'unit': item['unit'],
        'quantity': Decimal(str(item['quantity'])),
        'factor': Decimal(str(item.get('factor', 1))),
        'discount_amount': _money(item.get('discount_amount', 0)),
    }


def _normalize_payment(payment):
    return {
        'method': payment['method'],
        'amount': _money(payment['amount']),
        'reference': payment.get('reference', ''),
    }


@transaction.atomic
def create_counter_sale(
    *,
    tenant,
    branch,
    operator,
    stock_location,
    items,
    payments,
    idempotency_key,
    customer=None,
):
    if not idempotency_key:
        raise ValueError('Idempotency-Key is required.')
    if not items:
        raise EmptySale('Sale must have at least one item.')
    if not payments:
        raise PaymentMismatch('Sale must have at least one payment.')

    normalized_items = [_normalize_item(item) for item in items]
    normalized_payments = [_normalize_payment(payment) for payment in payments]
    payload = {
        'branch': branch,
        'operator': operator,
        'stock_location': stock_location,
        'items': normalized_items,
        'payments': normalized_payments,
        'customer': customer,
    }
    fingerprint = _payload_hash(payload)
    existing = Sale.all_objects.filter(
        tenant=tenant,
        idempotency_key=idempotency_key,
    ).first()
    if existing:
        if existing.payload_hash != fingerprint:
            raise DuplicateIdempotencyKey('Idempotency key already used with a different payload.')
        return existing

    cash_session = _open_cash_session_for(tenant, branch, operator)
    if cash_session is None:
        raise CashSessionRequired('An open cash session is required.')

    lines = []
    gross_total = Decimal('0.00')
    discount_total = Decimal('0.00')
    for item in normalized_items:
        price = resolve_effective_price(
            product=item['product'],
            branch=branch,
        )
        unit_price = Decimal(str(price.amount))
        line_gross = _money(item['quantity'] * unit_price)
        line_total = _money(line_gross - item['discount_amount'])
        if line_total < 0:
            raise ValueError('Line total cannot be negative.')
        gross_total += line_gross
        discount_total += item['discount_amount']
        lines.append({**item, 'unit_price': unit_price, 'line_total': line_total})

    gross_total = _money(gross_total)
    discount_total = _money(discount_total)
    net_total = _money(gross_total - discount_total)
    payment_total = _money(sum(payment['amount'] for payment in normalized_payments))
    if payment_total != net_total:
        raise PaymentMismatch('Payment total must match sale net total.')

    sale = Sale.all_objects.create(
        tenant=tenant,
        branch=branch,
        cash_session=cash_session,
        operator=operator,
        customer=customer,
        gross_total=gross_total,
        discount_total=discount_total,
        net_total=net_total,
        idempotency_key=idempotency_key,
        payload_hash=fingerprint,
    )
    for index, line in enumerate(lines, start=1):
        stock_operation = create_issue(
            tenant,
            branch,
            line['product'],
            stock_location,
            line['quantity'],
            line['unit'],
            line['factor'],
            idempotency_key=f'{idempotency_key}:stock:{index}',
            actor=operator,
            reason=f'Sale {sale.id}',
        )
        SaleItem.all_objects.create(
            tenant=tenant,
            sale=sale,
            product=line['product'],
            unit=line['unit'],
            stock_operation=stock_operation,
            quantity=line['quantity'],
            factor=line['factor'],
            unit_price=line['unit_price'],
            discount_amount=line['discount_amount'],
            line_total=line['line_total'],
        )
    for payment in normalized_payments:
        SalePayment.all_objects.create(
            tenant=tenant,
            sale=sale,
            method=payment['method'],
            amount=payment['amount'],
            reference=payment['reference'],
        )
        CashMovement.all_objects.create(
            tenant=tenant,
            cash_session=cash_session,
            movement_type='sale_payment',
            amount=payment['amount'],
            payment_method=payment['method'],
            reference=str(sale.id),
            notes='Sale payment',
        )
    cash_session.expected_amount = _money(cash_session.expected_amount + net_total)
    cash_session.version += 1
    cash_session.save(update_fields=['expected_amount', 'version', 'updated_at'])
    from financial.services import record_sale_financial_effects

    record_sale_financial_effects(tenant=tenant, sale=sale, actor=operator)
    _emit_sales_event(sale=sale, event_type='sales.sale.confirmed', actor=operator)
    return sale


def _emit_return_event(*, sale_return, event_type, actor=None):
    create_audit_record(
        actor=actor,
        action=event_type,
        resource_type='SaleReturn',
        resource_id=str(sale_return.id),
        detail={
            'sale_id': str(sale_return.sale_id),
            'status': sale_return.status,
            'reason': sale_return.reason,
        },
        correlation_id=sale_return.idempotency_key or str(sale_return.id),
        tenant_id=sale_return.tenant_id,
    )
    create_outbox_message(
        event_type=event_type,
        aggregate_type='SaleReturn',
        aggregate_id=str(sale_return.id),
        payload={
            'sale_return_id': str(sale_return.id),
            'sale_id': str(sale_return.sale_id),
            'status': sale_return.status,
            'reason': sale_return.reason,
        },
        correlation_id=sale_return.idempotency_key or str(sale_return.id),
        tenant_id=sale_return.tenant_id,
    )


def _already_returned_quantity(sale_item):
    from django.db.models import Sum as ModelSum

    from sales.models import SaleReturnItem

    agg = SaleReturnItem.all_objects.filter(
        sale_item=sale_item,
        sale_return__status__in=['draft', 'completed'],
    ).aggregate(total=ModelSum('quantity'))
    return agg['total'] or Decimal('0')


def _lock_compensable_sale(tenant, sale):
    locked_sale = Sale.all_objects.select_for_update().get(
        tenant=tenant,
        pk=sale.pk,
    )
    if locked_sale.status != 'confirmed':
        raise SaleNotCompensable('Only confirmed sales can be returned.')
    return locked_sale


def _canonical_decimal(value):
    decimal_value = Decimal(str(value))
    if decimal_value == 0:
        return '0'
    return format(decimal_value.normalize(), 'f')


@transaction.atomic
def create_sale_return(
    *,
    tenant,
    sale,
    items,
    reason,
    idempotency_key,
    actor=None,
):
    if not idempotency_key:
        raise ValueError('Idempotency-Key is required.')
    items = list(items)
    if not items:
        raise ValueError('Return must have at least one item.')
    if not reason:
        raise ValueError('Reason is required.')

    locked_sale = _lock_compensable_sale(tenant, sale)
    legacy_items = [
        {
            'sale_item_id': str(item['sale_item_id']),
            'quantity': str(item['quantity']),
        }
        for item in items
    ]
    legacy_payload = {
        'sale_id': str(locked_sale.id),
        'items': legacy_items,
        'reason': reason,
    }
    legacy_fingerprint = _payload_hash(legacy_payload)
    requested_items = []
    for item in items:
        quantity = Decimal(str(item['quantity']))
        if quantity <= 0:
            raise InsufficientReturnableQuantity('Return quantity must be positive.')
        requested_items.append(
            {
                'sale_item_id': str(item['sale_item_id']),
                'quantity': quantity,
            }
        )
    existing = SaleReturn.all_objects.filter(
        tenant=tenant,
        idempotency_key=idempotency_key,
    ).first()
    if existing and existing.payload_hash == legacy_fingerprint:
        return existing

    compatibility_payload = {
        'sale_id': str(locked_sale.id),
        'items': [
            {
                'sale_item_id': item['sale_item_id'],
                'quantity': _canonical_decimal(item['quantity']),
            }
            for item in requested_items
        ],
        'reason': reason,
    }
    compatibility_fingerprint = _payload_hash(compatibility_payload)

    aggregated_quantities = {}
    for item in requested_items:
        sale_item_id = item['sale_item_id']
        aggregated_quantities[sale_item_id] = (
            aggregated_quantities.get(sale_item_id, Decimal('0')) + item['quantity']
        )
    aggregated_items = [
        {
            'sale_item_id': sale_item_id,
            'quantity': quantity,
        }
        for sale_item_id, quantity in sorted(aggregated_quantities.items())
    ]
    canonical_payload = {
        'sale_id': str(locked_sale.id),
        'items': [
            {
                'sale_item_id': item['sale_item_id'],
                'quantity': _canonical_decimal(item['quantity']),
            }
            for item in aggregated_items
        ],
        'reason': reason,
    }
    fingerprint = _payload_hash(canonical_payload)
    if existing:
        if existing.payload_hash in {fingerprint, compatibility_fingerprint}:
            return existing
        persisted_quantities = {
            str(item['sale_item_id']): item['total_quantity']
            for item in SaleReturnItem.all_objects.filter(
                tenant=tenant,
                sale_return=existing,
            )
            .values('sale_item_id')
            .annotate(total_quantity=Sum('quantity'))
        }
        if (
            existing.sale_id == locked_sale.id
            and existing.reason == reason
            and persisted_quantities == aggregated_quantities
        ):
            return existing
        raise DuplicateIdempotencyKey('Idempotency key already used with a different payload.')

    normalized_items = []
    for item in aggregated_items:
        sale_item_id = item['sale_item_id']
        quantity = item['quantity']

        sale_item = (
            SaleItem.all_objects.filter(
                tenant=tenant,
                id=sale_item_id,
                sale=locked_sale,
            )
            .select_related('product', 'unit')
            .first()
        )
        if sale_item is None:
            raise ValueError(f'SaleItem {sale_item_id} not found in sale.')

        already_returned = _already_returned_quantity(sale_item)
        remaining = sale_item.quantity - already_returned
        if quantity > remaining:
            raise InsufficientReturnableQuantity(
                f'Cannot return {quantity} of item {sale_item_id}. Only {remaining} returnable.'
            )
        normalized_items.append(
            {
                'sale_item': sale_item,
                'product': sale_item.product,
                'unit': sale_item.unit,
                'quantity': quantity,
                'factor': sale_item.factor,
            }
        )

    for item in normalized_items:
        location = None
        stock_op = item['sale_item'].stock_operation
        if stock_op:
            movement = StockMovement.all_objects.filter(operation=stock_op).first()
            if movement:
                location = movement.location
        if location is None:
            location = StockLocation.all_objects.filter(
                tenant=tenant,
                branch=locked_sale.branch,
                is_primary=True,
            ).first()
        item['location'] = location
    normalized_items.sort(
        key=lambda item: (
            str(item['location'].id),
            str(item['product'].id),
            str(item['sale_item'].id),
        )
    )

    sale_return = SaleReturn.all_objects.create(
        tenant=tenant,
        sale=locked_sale,
        reason=reason,
        status='completed',
        idempotency_key=idempotency_key,
        payload_hash=fingerprint,
    )
    for index, item in enumerate(normalized_items, start=1):
        create_receipt(
            tenant,
            locked_sale.branch,
            item['product'],
            item['location'],
            item['quantity'],
            item['unit'],
            item['factor'],
            idempotency_key=f'{idempotency_key}:stock:{index}',
            actor=actor,
            reason=f'Return {sale_return.id} for Sale {locked_sale.id}',
        )
        SaleReturnItem.all_objects.create(
            tenant=tenant,
            sale_return=sale_return,
            sale_item=item['sale_item'],
            quantity=item['quantity'],
            factor=item['factor'],
        )
    _emit_return_event(
        sale_return=sale_return,
        event_type='sales.return.created',
        actor=actor,
    )
    return sale_return


@transaction.atomic
def create_sale_refund(
    *,
    tenant,
    sale,
    method,
    amount,
    reason,
    idempotency_key,
    sale_return=None,
    actor=None,
):
    if not idempotency_key:
        raise ValueError('Idempotency-Key is required.')
    amount = _money(Decimal(str(amount)))
    if amount <= 0:
        raise ValueError('Refund amount must be positive.')
    if method not in dict(SaleRefund.METHOD_CHOICES):
        raise ValueError('Refund method is invalid.')
    if not reason or not reason.strip():
        raise ValueError('Reason is required.')

    locked_sale = _lock_compensable_sale(tenant, sale)

    payload = {
        'sale_id': str(locked_sale.id),
        'method': method,
        'amount': str(amount),
        'reason': reason,
        'sale_return_id': str(sale_return.id) if sale_return else None,
    }
    fingerprint = _payload_hash(payload)
    existing = SaleRefund.all_objects.filter(
        tenant=tenant,
        idempotency_key=idempotency_key,
    ).first()
    if existing:
        if existing.payload_hash == fingerprint:
            return existing
        is_semantically_matching_legacy_refund = (
            not existing.reason
            and existing.sale_id == locked_sale.id
            and existing.method == method
            and existing.amount == amount
            and existing.sale_return_id == (sale_return.id if sale_return else None)
        )
        if is_semantically_matching_legacy_refund:
            return existing
        raise DuplicateIdempotencyKey('Idempotency key already used with a different payload.')

    if sale_return:
        if sale_return.tenant_id != tenant.id:
            raise ValueError('Sale return must belong to the same tenant.')
        if sale_return.sale_id != locked_sale.id:
            raise ValueError('Sale return must belong to the refunded sale.')
        if sale_return.status != 'completed':
            raise ValueError('Sale return must be completed.')

    cash_session = None
    if method == 'cash':
        cash_session = CashSession.all_objects.select_for_update().filter(
            tenant=tenant,
            pk=locked_sale.cash_session_id,
            branch=locked_sale.branch,
            operator=locked_sale.operator,
            status='open',
        ).first()
        if cash_session is None:
            raise CashSessionRequired(
                'The sale original cash session must be open for cash refunds.'
            )

    refunded_total = SaleRefund.all_objects.filter(
        tenant=tenant,
        sale=locked_sale,
        status='completed',
    ).aggregate(total=Sum('amount'))['total'] or Decimal('0')
    refundable_balance = _money(locked_sale.net_total - refunded_total)
    if refundable_balance <= 0 or amount > refundable_balance:
        raise RefundAmountExceeded('Refund amount exceeds the sale refundable balance.')

    refund = SaleRefund.all_objects.create(
        tenant=tenant,
        sale=locked_sale,
        sale_return=sale_return,
        method=method,
        amount=amount,
        reason=reason,
        status='completed',
        idempotency_key=idempotency_key,
        payload_hash=fingerprint,
    )

    if method == 'cash':
        CashMovement.all_objects.create(
            tenant=tenant,
            cash_session=cash_session,
            movement_type='cash_out',
            amount=amount,
            payment_method='cash',
            reference=str(locked_sale.id),
            notes=f'Refund {refund.id}',
        )
        cash_session.expected_amount = _money(cash_session.expected_amount - amount)
        cash_session.version += 1
        cash_session.save(update_fields=['expected_amount', 'version', 'updated_at'])

    create_audit_record(
        actor=actor,
        action='sales.refund.created',
        resource_type='SaleRefund',
        resource_id=str(refund.id),
        detail={
            'sale_id': str(locked_sale.id),
            'method': method,
            'amount': str(amount),
            'reason': reason,
        },
        correlation_id=idempotency_key,
        tenant_id=tenant.id,
    )
    create_outbox_message(
        event_type='sales.refund.created',
        aggregate_type='SaleRefund',
        aggregate_id=str(refund.id),
        payload={
            'sale_refund_id': str(refund.id),
            'sale_id': str(locked_sale.id),
            'method': method,
            'amount': str(amount),
            'reason': reason,
        },
        correlation_id=idempotency_key,
        tenant_id=tenant.id,
    )
    return refund


@transaction.atomic
def cancel_sale(
    *,
    tenant,
    sale,
    reason,
    idempotency_key,
    actor=None,
):
    if not idempotency_key:
        raise ValueError('Idempotency-Key is required.')
    if not reason:
        raise ValueError('Reason is required.')

    payload = {
        'sale_id': str(sale.id),
        'reason': reason,
    }
    fingerprint = _payload_hash(payload)
    existing = SaleCancellation.all_objects.filter(
        tenant=tenant,
        idempotency_key=idempotency_key,
    ).first()
    if existing:
        if existing.payload_hash != fingerprint:
            raise DuplicateIdempotencyKey('Idempotency key already used with a different payload.')
        return existing

    if sale.status == 'cancelled':
        raise SaleAlreadyCancelled('Sale is already cancelled.')

    cancellation = SaleCancellation.all_objects.create(
        tenant=tenant,
        sale=sale,
        reason=reason,
        status='completed',
        idempotency_key=idempotency_key,
        payload_hash=fingerprint,
    )

    for index, sale_item in enumerate(
        SaleItem.all_objects.filter(sale=sale).select_related('product', 'unit'),
        start=1,
    ):
        location = None
        if sale_item.stock_operation_id:
            movement = StockMovement.all_objects.filter(
                operation_id=sale_item.stock_operation_id,
            ).first()
            if movement:
                location = movement.location
        if location is None:
            location = StockLocation.all_objects.filter(
                tenant=tenant,
                branch=sale.branch,
                is_primary=True,
            ).first()
        create_receipt(
            tenant,
            sale.branch,
            sale_item.product,
            location,
            sale_item.quantity,
            sale_item.unit,
            sale_item.factor,
            idempotency_key=f'{idempotency_key}:stock:{index}',
            actor=actor,
            reason=f'Cancellation {cancellation.id} of Sale {sale.id}',
        )

    cash_session = sale.cash_session
    for payment in SalePayment.all_objects.filter(sale=sale):
        if payment.method == 'cash':
            SaleRefund.all_objects.create(
                tenant=tenant,
                sale=sale,
                sale_return=None,
                method='cash',
                amount=payment.amount,
                reason=reason,
                status='completed',
                idempotency_key=f'{idempotency_key}:refund:{payment.id}',
            )
            if cash_session and cash_session.status == 'open':
                CashMovement.all_objects.create(
                    tenant=tenant,
                    cash_session=cash_session,
                    movement_type='cash_out',
                    amount=payment.amount,
                    payment_method='cash',
                    reference=str(sale.id),
                    notes=f'Auto refund for cancellation {cancellation.id}',
                )
                cash_session.expected_amount = _money(cash_session.expected_amount - payment.amount)
                cash_session.version += 1
                cash_session.save(update_fields=['expected_amount', 'version', 'updated_at'])
        else:
            SaleRefund.all_objects.create(
                tenant=tenant,
                sale=sale,
                sale_return=None,
                method=payment.method,
                amount=payment.amount,
                reason=reason,
                status='completed',
                idempotency_key=f'{idempotency_key}:refund:{payment.id}',
            )

    sale.status = 'cancelled'
    sale.version += 1
    sale.save(update_fields=['status', 'version', 'updated_at'])

    create_audit_record(
        actor=actor,
        action='sales.sale.cancelled',
        resource_type='Sale',
        resource_id=str(sale.id),
        detail={
            'cancellation_id': str(cancellation.id),
            'reason': reason,
        },
        correlation_id=idempotency_key,
        tenant_id=tenant.id,
    )
    create_outbox_message(
        event_type='sales.sale.cancelled',
        aggregate_type='Sale',
        aggregate_id=str(sale.id),
        payload={
            'sale_id': str(sale.id),
            'cancellation_id': str(cancellation.id),
            'reason': reason,
        },
        correlation_id=idempotency_key,
        tenant_id=tenant.id,
    )
    return cancellation
