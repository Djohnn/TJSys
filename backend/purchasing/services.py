import hashlib
import json

from django.db import models, transaction

from audit.services import create_audit_record
from outbox.services import create_outbox_message


def _payload_hash(payload):
    serialized = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(serialized.encode()).hexdigest()


class DuplicateIdempotencyKey(ValueError):
    def __init__(self, existing):
        self.existing = existing
        super().__init__(
            f'Idempotency key "{existing.idempotency_key}" already used with a different payload.'
        )


class InvalidPurchaseOrderStatus(ValueError):
    pass


class OverReceiptError(ValueError):
    pass


class ReceiptWithoutApprovedOrder(ValueError):
    pass


def _build_approve_payload(purchase_order):
    return {
        'supplier_id': str(purchase_order.supplier_id),
        'branch_id': str(purchase_order.branch_id),
        'notes': purchase_order.notes,
        'status': 'approved',
    }


@transaction.atomic
def approve_purchase_order(
    *,
    tenant,
    purchase_order,
    idempotency_key='',
    actor=None,
):
    from purchasing.models import PurchaseOrder, PurchaseOrderItem

    if purchase_order.tenant_id != tenant.id:
        raise ValueError('Purchase order does not belong to this tenant.')

    if idempotency_key and purchase_order.idempotency_key == idempotency_key:
        if purchase_order.status == 'approved':
            return purchase_order
        raise InvalidPurchaseOrderStatus(
            f'Cannot approve purchase order with status "{purchase_order.status}".'
        )

    if purchase_order.status != 'draft':
        raise InvalidPurchaseOrderStatus(
            f'Cannot approve purchase order with status "{purchase_order.status}".'
        )

    if not PurchaseOrderItem.all_objects.filter(purchase_order=purchase_order).exists():
        raise InvalidPurchaseOrderStatus('Cannot approve a purchase order with no items.')

    fingerprint = _payload_hash(_build_approve_payload(purchase_order))

    if idempotency_key:
        existing = (
            PurchaseOrder.all_objects.filter(
                tenant=tenant,
                idempotency_key=idempotency_key,
            )
            .exclude(pk=purchase_order.pk)
            .first()
        )
        if existing:
            if existing.payload_hash != fingerprint:
                raise DuplicateIdempotencyKey(existing)
            return existing

    purchase_order.status = 'approved'
    purchase_order.idempotency_key = idempotency_key
    purchase_order.payload_hash = fingerprint
    purchase_order.save()

    create_audit_record(
        action='purchasing.order.approved',
        resource_type='purchase_order',
        resource_id=purchase_order.id,
        detail={
            'supplier': str(purchase_order.supplier_id),
            'items_count': PurchaseOrderItem.all_objects.filter(
                purchase_order=purchase_order,
            ).count(),
        },
        actor=actor,
        correlation_id=idempotency_key,
        tenant_id=str(tenant.id),
    )
    create_outbox_message(
        event_type='purchasing.order.approved',
        aggregate_type='purchase_order',
        aggregate_id=purchase_order.id,
        payload={'supplier_id': str(purchase_order.supplier_id)},
        correlation_id=idempotency_key,
        tenant_id=str(tenant.id),
    )

    return purchase_order


def _compute_pending_quantities(purchase_order):
    from purchasing.models import PurchaseOrderItem, PurchaseReceiptItem

    po_items = PurchaseOrderItem.all_objects.filter(purchase_order=purchase_order)
    pending = {}
    for item in po_items:
        received_qty = (
            PurchaseReceiptItem.all_objects.filter(
                purchase_order_item=item,
                receipt__status='confirmed',
            ).aggregate(total=models.Sum('quantity_received'))['total']
            or 0
        )
        pending[item.id] = item.quantity - received_qty
    return pending


@transaction.atomic
def receive_purchase_order(
    *,
    tenant,
    purchase_order,
    items,
    notes='',
    idempotency_key='',
    actor=None,
):
    from django.db.models import Sum

    from inventory.models import StockLocation
    from inventory.services import create_receipt as inventory_create_receipt
    from purchasing.models import (
        PurchaseOrderItem,
        PurchaseReceipt,
        PurchaseReceiptItem,
    )

    if purchase_order.tenant_id != tenant.id:
        raise ValueError('Purchase order does not belong to this tenant.')

    if idempotency_key:
        existing = PurchaseReceipt.all_objects.filter(
            tenant=tenant,
            idempotency_key=idempotency_key,
        ).first()
        if existing:
            return existing

    if purchase_order.status not in {'approved', 'partially_received'}:
        raise ReceiptWithoutApprovedOrder(
            f'Cannot receive purchase order with status "{purchase_order.status}".'
            ' Must be "approved" or "partially_received".'
        )

    location = StockLocation.all_objects.filter(
        tenant=tenant,
        branch=purchase_order.branch,
        is_primary=True,
    ).first()
    if not location:
        raise ValueError(f'No primary stock location found for branch {purchase_order.branch_id}.')

    pending = _compute_pending_quantities(purchase_order)
    receipt_items_data = []
    for entry in items:
        po_item_id = entry['purchase_order_item_id']
        qty = entry['quantity_received']
        unit_cost = entry.get('unit_cost')

        po_item = PurchaseOrderItem.all_objects.filter(
            pk=po_item_id,
            purchase_order=purchase_order,
        ).first()
        if not po_item:
            raise ValueError(f'PurchaseOrderItem {po_item_id} not found in order.')

        pending_qty = pending.get(po_item.id, 0)
        if qty > pending_qty:
            raise OverReceiptError(
                f'Cannot receive {qty} of item {po_item_id}. Only {pending_qty} pending.'
            )

        effective_cost = unit_cost if unit_cost is not None else po_item.unit_cost
        receipt_items_data.append(
            {
                'purchase_order_item': po_item,
                'quantity_received': qty,
                'unit_cost': effective_cost,
            }
        )

    payload = {
        'purchase_order_id': str(purchase_order.id),
        'items': [
            {
                'purchase_order_item_id': str(d['purchase_order_item'].id),
                'quantity_received': str(d['quantity_received']),
                'unit_cost': str(d['unit_cost']),
            }
            for d in receipt_items_data
        ],
    }
    fingerprint = _payload_hash(payload)

    if idempotency_key:
        existing = PurchaseReceipt.all_objects.filter(
            tenant=tenant,
            idempotency_key=idempotency_key,
        ).first()
        if existing:
            if existing.payload_hash != fingerprint:
                raise DuplicateIdempotencyKey(existing)
            return existing

    receipt = PurchaseReceipt.all_objects.create(
        tenant=tenant,
        purchase_order=purchase_order,
        status='confirmed',
        notes=notes,
        idempotency_key=idempotency_key,
        payload_hash=fingerprint,
    )

    for d in receipt_items_data:
        po_item = d['purchase_order_item']
        qty = d['quantity_received']
        unit_cost = d['unit_cost']

        PurchaseReceiptItem.all_objects.create(
            tenant=tenant,
            receipt=receipt,
            purchase_order_item=po_item,
            quantity_received=qty,
            unit_cost=unit_cost,
        )

        inventory_create_receipt(
            tenant=tenant,
            branch=purchase_order.branch,
            product=po_item.product,
            location=location,
            quantity=qty,
            unit=po_item.unit,
            factor=po_item.factor,
            unit_cost=unit_cost,
            idempotency_key=f'{idempotency_key}:inv:{po_item.id}',
            actor=actor,
            reason=f'Purchase receipt {receipt.id}',
        )

    all_po_items = PurchaseOrderItem.all_objects.filter(purchase_order=purchase_order)
    total_received = {}
    for po_item in all_po_items:
        received = (
            PurchaseReceiptItem.all_objects.filter(
                purchase_order_item=po_item,
                receipt__status='confirmed',
            ).aggregate(total=Sum('quantity_received'))['total']
            or 0
        )
        total_received[po_item.id] = received

    all_fully_received = all(total_received[item.id] >= item.quantity for item in all_po_items)
    purchase_order.status = 'received' if all_fully_received else 'partially_received'
    purchase_order.save()

    total_amount = sum(d['quantity_received'] * d['unit_cost'] for d in receipt_items_data)
    from financial.services import create_payable

    create_payable(
        tenant=tenant,
        supplier_name=purchase_order.supplier.name,
        description=f'Recebimento PO {purchase_order.id}: {notes or purchase_order.notes or ""}',
        amount=total_amount,
        idempotency_key=f'{idempotency_key}:payable' if idempotency_key else '',
        actor=actor,
    )

    create_audit_record(
        action='purchasing.order.received',
        resource_type='purchase_receipt',
        resource_id=receipt.id,
        detail={
            'purchase_order_id': str(purchase_order.id),
            'items_count': len(receipt_items_data),
        },
        actor=actor,
        correlation_id=idempotency_key,
        tenant_id=str(tenant.id),
    )
    create_outbox_message(
        event_type='purchasing.order.received',
        aggregate_type='purchase_receipt',
        aggregate_id=receipt.id,
        payload={
            'purchase_order_id': str(purchase_order.id),
            'items_count': len(receipt_items_data),
        },
        correlation_id=idempotency_key,
        tenant_id=str(tenant.id),
    )

    return receipt


class CannotCancelPurchaseOrder(ValueError):
    pass


class AlreadyCancelled(ValueError):
    pass


class DuplicateCancellationIdempotencyKey(ValueError):
    pass


@transaction.atomic
def cancel_purchase_order(
    *,
    tenant,
    purchase_order,
    reason,
    idempotency_key='',
    actor=None,
):
    from purchasing.models import PurchaseOrderCancellation

    if purchase_order.tenant_id != tenant.id:
        raise ValueError('Purchase order does not belong to this tenant.')

    if idempotency_key:
        existing = PurchaseOrderCancellation.all_objects.filter(
            tenant=tenant,
            idempotency_key=idempotency_key,
        ).first()
        if existing:
            return existing

    if purchase_order.status == 'cancelled':
        raise AlreadyCancelled('Purchase order is already cancelled.')

    if purchase_order.status not in {'draft', 'approved', 'partially_received'}:
        raise CannotCancelPurchaseOrder(
            f'Cannot cancel purchase order with status "{purchase_order.status}".'
        )

    payload = {'purchase_order_id': str(purchase_order.id), 'reason': reason}
    fingerprint = _payload_hash(payload)

    cancellation = PurchaseOrderCancellation.all_objects.create(
        tenant=tenant,
        purchase_order=purchase_order,
        reason=reason,
        idempotency_key=idempotency_key,
        payload_hash=fingerprint,
    )

    from financial.models import Payable

    payables = Payable.all_objects.filter(
        tenant=tenant,
        status='pending',
        supplier_name=purchase_order.supplier.name,
    )
    for payable in payables:
        payable.status = 'cancelled'
        payable.version += 1
        payable.save(update_fields=['status', 'version', 'updated_at'])

    purchase_order.status = 'cancelled'
    purchase_order.version += 1
    purchase_order.save(update_fields=['status', 'version', 'updated_at'])

    create_audit_record(
        action='purchasing.order.cancelled',
        resource_type='purchase_order',
        resource_id=purchase_order.id,
        detail={'reason': reason},
        actor=actor,
        correlation_id=idempotency_key,
        tenant_id=str(tenant.id),
    )
    create_outbox_message(
        event_type='purchasing.order.cancelled',
        aggregate_type='purchase_order',
        aggregate_id=purchase_order.id,
        payload={'reason': reason},
        correlation_id=idempotency_key,
        tenant_id=str(tenant.id),
    )

    return cancellation


@transaction.atomic
def cancel_receipt(
    *,
    tenant,
    receipt,
    reason,
    idempotency_key='',
    actor=None,
):
    from inventory.models import StockLocation
    from inventory.services import create_issue
    from purchasing.models import (
        PurchaseOrderItem,
        PurchaseReceiptCancellation,
        PurchaseReceiptItem,
    )

    if receipt.tenant_id != tenant.id:
        raise ValueError('Receipt does not belong to this tenant.')

    if idempotency_key:
        existing = PurchaseReceiptCancellation.all_objects.filter(
            tenant=tenant,
            idempotency_key=idempotency_key,
        ).first()
        if existing:
            return existing

    if receipt.status == 'cancelled':
        raise AlreadyCancelled('Receipt is already cancelled.')

    if receipt.status != 'confirmed':
        raise CannotCancelPurchaseOrder(f'Cannot cancel receipt with status "{receipt.status}".')

    if receipt.cancellations.exists():
        raise AlreadyCancelled('Receipt already has a cancellation.')

    payload = {'receipt_id': str(receipt.id), 'reason': reason}
    fingerprint = _payload_hash(payload)

    cancellation = PurchaseReceiptCancellation.all_objects.create(
        tenant=tenant,
        receipt=receipt,
        reason=reason,
        idempotency_key=idempotency_key,
        payload_hash=fingerprint,
    )

    location = StockLocation.all_objects.filter(
        tenant=tenant,
        branch=receipt.purchase_order.branch,
        is_primary=True,
    ).first()
    if not location:
        raise ValueError(
            f'No primary stock location found for branch {receipt.purchase_order.branch_id}.'
        )

    rct_items = PurchaseReceiptItem.all_objects.filter(receipt=receipt)
    for idx, rct_item in enumerate(rct_items):
        po_item = rct_item.purchase_order_item
        create_issue(
            tenant,
            receipt.purchase_order.branch,
            po_item.product,
            location,
            rct_item.quantity_received,
            po_item.unit,
            po_item.factor,
            idempotency_key=f'{idempotency_key}:iss:{idx}',
            actor=actor,
            reason=f'Receipt cancellation {cancellation.id}: {reason}',
        )

    from financial.models import Payable

    suffix = f'{receipt.idempotency_key}:payable'
    payable = Payable.all_objects.filter(
        tenant=tenant,
        idempotency_key=suffix,
        status='pending',
    ).first()
    if payable:
        payable.status = 'cancelled'
        payable.version += 1
        payable.save(update_fields=['status', 'version', 'updated_at'])

    receipt.status = 'cancelled'
    receipt.version += 1
    receipt.save(update_fields=['status', 'version', 'updated_at'])

    from django.db.models import Sum

    po_items = PurchaseOrderItem.all_objects.filter(purchase_order=receipt.purchase_order)
    all_received = {}
    for po_item in po_items:
        received = (
            PurchaseReceiptItem.all_objects.filter(
                purchase_order_item=po_item,
                receipt__status='confirmed',
            ).aggregate(total=Sum('quantity_received'))['total']
            or 0
        )
        all_received[po_item.id] = received

    total_received_anywhere = sum(all_received.values())
    if total_received_anywhere <= 0:
        receipt.purchase_order.status = 'approved'
    elif all(all_received[item.id] >= item.quantity for item in po_items):
        receipt.purchase_order.status = 'received'
    else:
        receipt.purchase_order.status = 'partially_received'
    receipt.purchase_order.version += 1
    receipt.purchase_order.save(update_fields=['status', 'version', 'updated_at'])

    create_audit_record(
        action='purchasing.receipt.cancelled',
        resource_type='purchase_receipt',
        resource_id=receipt.id,
        detail={
            'reason': reason,
            'purchase_order_id': str(receipt.purchase_order_id),
        },
        actor=actor,
        correlation_id=idempotency_key,
        tenant_id=str(tenant.id),
    )
    create_outbox_message(
        event_type='purchasing.receipt.cancelled',
        aggregate_type='purchase_receipt',
        aggregate_id=receipt.id,
        payload={'reason': reason},
        correlation_id=idempotency_key,
        tenant_id=str(tenant.id),
    )

    return cancellation


def _build_supplier_return_payload(receipt, items_data, reason):
    return {
        'receipt_id': str(receipt.id),
        'reason': reason,
        'items': [
            {'purchase_order_item_id': str(d['po_item'].id), 'quantity': str(d['quantity'])}
            for d in items_data
        ],
    }


@transaction.atomic
def create_supplier_return(
    *,
    tenant,
    receipt,
    items,
    reason,
    idempotency_key='',
    actor=None,
):
    from inventory.models import StockLocation
    from inventory.services import create_issue
    from purchasing.models import PurchaseReceiptItem, SupplierReturn, SupplierReturnItem

    if receipt.tenant_id != tenant.id:
        raise ValueError('Receipt does not belong to this tenant.')

    if idempotency_key:
        existing = SupplierReturn.all_objects.filter(
            tenant=tenant,
            idempotency_key=idempotency_key,
        ).first()
        if existing:
            return existing

    if receipt.status != 'confirmed':
        raise CannotCancelPurchaseOrder(
            f'Cannot return from receipt with status "{receipt.status}".'
        )

    items_data = []
    for entry in items:
        po_item_id = entry['purchase_order_item_id']
        qty = entry['quantity']

        rct_item = PurchaseReceiptItem.all_objects.filter(
            purchase_order_item_id=po_item_id,
            receipt=receipt,
        ).first()
        if not rct_item:
            raise ValueError(f'Receipt item for PO item {po_item_id} not found in receipt.')

        already_returned = (
            SupplierReturnItem.all_objects.filter(
                purchase_order_item_id=po_item_id,
                supplier_return__receipt=receipt,
                supplier_return__status='completed',
            ).aggregate(total=models.Sum('quantity'))['total']
            or 0
        )
        returnable = rct_item.quantity_received - already_returned
        if qty > returnable:
            raise OverReceiptError(
                f'Cannot return {qty} of item {po_item_id}. Only {returnable} returnable.'
            )

        items_data.append(
            {
                'po_item': rct_item.purchase_order_item,
                'quantity': qty,
                'unit_cost': rct_item.unit_cost,
            }
        )

    payload = _build_supplier_return_payload(receipt, items_data, reason)
    fingerprint = _payload_hash(payload)

    supplier_return = SupplierReturn.all_objects.create(
        tenant=tenant,
        receipt=receipt,
        reason=reason,
        idempotency_key=idempotency_key,
        payload_hash=fingerprint,
    )

    location = StockLocation.all_objects.filter(
        tenant=tenant,
        branch=receipt.purchase_order.branch,
        is_primary=True,
    ).first()
    if not location:
        raise ValueError(
            f'No primary stock location found for branch {receipt.purchase_order.branch_id}.'
        )

    total_credit = 0
    for idx, d in enumerate(items_data):
        po_item = d['po_item']
        qty = d['quantity']
        unit_cost = d['unit_cost']

        SupplierReturnItem.all_objects.create(
            tenant=tenant,
            supplier_return=supplier_return,
            purchase_order_item=po_item,
            quantity=qty,
            unit_cost=unit_cost,
        )

        create_issue(
            tenant,
            receipt.purchase_order.branch,
            po_item.product,
            location,
            qty,
            po_item.unit,
            po_item.factor,
            idempotency_key=f'{idempotency_key}:iss:{idx}',
            actor=actor,
            reason=f'Supplier return {supplier_return.id} of receipt {receipt.id}',
        )

        total_credit += qty * unit_cost

    from financial.models import Payable

    suffix = f'{receipt.idempotency_key}:payable'
    payable = Payable.all_objects.filter(
        tenant=tenant,
        idempotency_key=suffix,
        status='pending',
    ).first()
    if payable:
        remaining = payable.amount - total_credit
        if remaining > 0:
            payable.amount = remaining
            payable.version += 1
            payable.save(update_fields=['amount', 'version', 'updated_at'])
        else:
            payable.status = 'cancelled'
            payable.version += 1
            payable.save(update_fields=['status', 'version', 'updated_at'])

    create_audit_record(
        action='purchasing.supplier_return.created',
        resource_type='supplier_return',
        resource_id=supplier_return.id,
        detail={
            'receipt_id': str(receipt.id),
            'items_count': len(items_data),
            'total_credit': str(total_credit),
        },
        actor=actor,
        correlation_id=idempotency_key,
        tenant_id=str(tenant.id),
    )
    create_outbox_message(
        event_type='purchasing.supplier_return.created',
        aggregate_type='supplier_return',
        aggregate_id=supplier_return.id,
        payload={'receipt_id': str(receipt.id), 'total_credit': str(total_credit)},
        correlation_id=idempotency_key,
        tenant_id=str(tenant.id),
    )

    return supplier_return


def purchasing_summary(*, tenant):
    from django.db.models import Count, Sum

    from financial.models import Payable
    from purchasing.models import PurchaseOrder, PurchaseReceipt

    po_counts = (
        PurchaseOrder.all_objects.filter(tenant=tenant)
        .values('status')
        .annotate(
            count=Count('id'),
        )
    )
    receipt_counts = (
        PurchaseReceipt.all_objects.filter(
            tenant=tenant,
        )
        .values('status')
        .annotate(count=Count('id'))
    )
    payable_info = Payable.all_objects.filter(tenant=tenant).aggregate(
        total_pending=Sum('amount', filter=models.Q(status='pending')) or 0,
        total_paid=Sum('amount', filter=models.Q(status='paid')) or 0,
    )

    return {
        'purchase_orders': {row['status']: row['count'] for row in po_counts},
        'receipts': {row['status']: row['count'] for row in receipt_counts},
        'payables': {
            'total_pending': payable_info['total_pending'],
            'total_paid': payable_info['total_paid'],
        },
    }


# ── Sprint 13 — Automation ─────────────────────────────────────


def generate_po_from_template(template, tenant, idempotency_key_prefix=''):
    from purchasing.models import PurchaseOrder, PurchaseOrderItem, RecurringTemplateItem

    if template.tenant_id != tenant.id:
        raise ValueError('Template does not belong to this tenant.')

    po = PurchaseOrder.all_objects.create(
        tenant=tenant,
        supplier=template.supplier,
        branch=template.branch,
        notes=template.notes,
    )

    total = 0
    for tpl_item in RecurringTemplateItem.all_objects.filter(template=template):
        PurchaseOrderItem.all_objects.create(
            tenant=tenant,
            purchase_order=po,
            product=tpl_item.product,
            unit=tpl_item.unit,
            quantity=tpl_item.quantity,
            unit_cost=tpl_item.unit_cost,
            factor=tpl_item.factor,
        )
        total += tpl_item.line_total()

    po.items_total = total
    po.save(update_fields=['items_total'])

    return po


def advance_recurring_template_schedule(template):
    from datetime import date, timedelta

    from dateutil.relativedelta import relativedelta

    from purchasing.models import RecurringPurchaseOrderTemplate

    next_run = template.next_run
    if isinstance(next_run, str):
        next_run = date.fromisoformat(next_run)
    if not next_run:
        return

    freq_map = {
        RecurringPurchaseOrderTemplate.FREQ_DAILY: timedelta(days=1),
        RecurringPurchaseOrderTemplate.FREQ_WEEKLY: timedelta(weeks=1),
        RecurringPurchaseOrderTemplate.FREQ_BIWEEKLY: timedelta(weeks=2),
        RecurringPurchaseOrderTemplate.FREQ_MONTHLY: relativedelta(months=1),
        RecurringPurchaseOrderTemplate.FREQ_QUARTERLY: relativedelta(months=3),
    }
    delta = freq_map.get(template.frequency)
    if delta:
        template.next_run = next_run + delta
        template.save(update_fields=['next_run'])


def auto_onboard_supplier(*, tenant, cnpj, name=''):
    from purchasing.models import Supplier

    existing = Supplier.all_objects.filter(tenant=tenant, cnpj=cnpj).first()
    if existing:
        return existing

    display_name = name or f'Fornecedor {cnpj[:8]}'
    return Supplier.all_objects.create(
        tenant=tenant,
        name=display_name,
        cnpj=cnpj,
    )
