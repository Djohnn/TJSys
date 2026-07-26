import hashlib
import json
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from audit.services import create_audit_record
from outbox.services import create_outbox_message


def _payload_hash(payload):
    serialized = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(serialized.encode()).hexdigest()


def _child_key(prefix, parent_key):
    if not parent_key:
        return ''
    digest = hashlib.sha256(parent_key.encode()).hexdigest()
    return f'{prefix}:{digest}'


class DuplicateIdempotencyKey(ValueError):
    def __init__(self, existing):
        self.existing = existing
        super().__init__(
            f'Idempotency key "{existing.idempotency_key}" already used with a different payload.'
        )


class OverSettlementError(ValueError):
    pass


def _build_payload(*, supplier_name, description, amount, due_date):
    return {
        'supplier_name': supplier_name,
        'description': description,
        'amount': str(amount),
        'due_date': str(due_date) if due_date else None,
    }


@transaction.atomic
def create_payable(
    *,
    tenant,
    supplier_name,
    description,
    amount,
    due_date=None,
    idempotency_key='',
    actor=None,
):
    from financial.models import Payable

    fingerprint = _payload_hash(
        _build_payload(
            supplier_name=supplier_name,
            description=description,
            amount=amount,
            due_date=due_date,
        )
    )

    if idempotency_key:
        existing = Payable.all_objects.filter(
            tenant=tenant,
            idempotency_key=idempotency_key,
        ).first()
        if existing:
            if existing.payload_hash != fingerprint:
                raise DuplicateIdempotencyKey(existing)
            return existing

    payable = Payable.all_objects.create(
        tenant=tenant,
        supplier_name=supplier_name,
        description=description,
        amount=amount,
        due_date=due_date,
        idempotency_key=idempotency_key,
        payload_hash=fingerprint,
    )

    create_audit_record(
        action='financial.payable.created',
        resource_type='payable',
        resource_id=payable.id,
        detail={
            'supplier_name': supplier_name,
            'amount': str(amount),
        },
        actor=actor,
        correlation_id=idempotency_key,
        tenant_id=str(tenant.id),
    )
    create_outbox_message(
        event_type='financial.payable.created',
        aggregate_type='payable',
        aggregate_id=payable.id,
        payload={'supplier_name': supplier_name, 'amount': str(amount)},
        correlation_id=idempotency_key,
        tenant_id=str(tenant.id),
    )

    return payable


def _settled_total(obligation):
    from financial.models import Settlement

    target = {obligation._meta.model_name: obligation}
    return Settlement.all_objects.filter(
        tenant=obligation.tenant,
        **target,
    ).aggregate(total=Sum('amount'))['total'] or Decimal('0')


def _emit_financial_event(*, event_type, instance, amount, actor=None, correlation_id=''):
    detail = {'amount': str(amount), 'status': instance.status}
    create_audit_record(
        action=event_type,
        resource_type=instance._meta.model_name,
        resource_id=instance.id,
        detail=detail,
        actor=actor,
        correlation_id=correlation_id,
        tenant_id=str(instance.tenant_id),
    )
    create_outbox_message(
        event_type=event_type,
        aggregate_type=instance._meta.model_name,
        aggregate_id=instance.id,
        payload=detail,
        correlation_id=correlation_id,
        tenant_id=str(instance.tenant_id),
    )


def _settle_obligation(
    *,
    tenant,
    obligation,
    amount,
    settled_on,
    idempotency_key,
    actor=None,
    account=None,
):
    from financial.models import CashflowEntry, Settlement

    if obligation.tenant_id != tenant.id:
        raise ValueError('Financial obligation belongs to another tenant.')
    amount = Decimal(str(amount))
    if amount <= 0:
        raise ValueError('Settlement amount must be positive.')
    existing = Settlement.all_objects.filter(
        tenant=tenant,
        idempotency_key=idempotency_key,
    ).first()
    if existing:
        return existing

    paid = _settled_total(obligation)
    remaining = obligation.amount - paid
    if amount > remaining:
        raise OverSettlementError('Settlement amount exceeds the remaining balance.')

    target = (
        {'payable': obligation}
        if obligation._meta.model_name == 'payable'
        else {
            'receivable': obligation,
        }
    )
    settlement = Settlement.all_objects.create(
        tenant=tenant,
        account=account,
        amount=amount,
        settled_on=settled_on,
        idempotency_key=idempotency_key,
        **target,
    )
    obligation.status = 'settled' if amount == remaining else 'partially_settled'
    obligation.version += 1
    obligation.save(update_fields=['status', 'version', 'updated_at'])

    direction = 'outflow' if obligation._meta.model_name == 'payable' else 'inflow'
    CashflowEntry.all_objects.create(
        tenant=tenant,
        branch=obligation.branch,
        account=account,
        direction=direction,
        status='realized',
        amount=amount,
        effective_date=settled_on,
        description=obligation.description,
        source_type=obligation._meta.model_name,
        source_id=obligation.id,
        idempotency_key=_child_key('cashflow', idempotency_key),
    )
    _emit_financial_event(
        event_type=f'financial.{obligation._meta.model_name}.settled',
        instance=obligation,
        amount=amount,
        actor=actor,
        correlation_id=idempotency_key,
    )
    return settlement


@transaction.atomic
def settle_payable(**kwargs):
    return _settle_obligation(obligation=kwargs.pop('payable'), **kwargs)


@transaction.atomic
def settle_receivable(**kwargs):
    return _settle_obligation(obligation=kwargs.pop('receivable'), **kwargs)


@transaction.atomic
def record_payment_reconciliation_effect(*, item):
    """Record immutable fee cashflow once a payment settlement is confirmed."""
    from financial.models import CashflowEntry

    sale = item.transaction.intent.sale if item.transaction_id else None
    branch = sale.branch if sale else None
    if item.fee_amount <= 0:
        return None
    key = f'payment-reconciliation:{item.id}:fee'
    entry, _ = CashflowEntry.all_objects.get_or_create(
        tenant=item.tenant,
        idempotency_key=key,
        defaults={
            'branch': branch,
            'direction': 'outflow',
            'status': 'realized',
            'amount': item.fee_amount,
            'effective_date': timezone.localdate(),
            'description': f'Taxa de pagamento {item.provider_reference}',
            'source_type': 'payment_fee',
            'source_id': item.id,
        },
    )
    return entry


@transaction.atomic
def record_sale_financial_effects(*, tenant, sale, actor=None):
    from financial.models import CashflowEntry, Receivable
    from sales.models import SalePayment

    if sale.tenant_id != tenant.id:
        raise ValueError('Sale belongs to another tenant.')
    created = []
    for payment in SalePayment.all_objects.filter(tenant=tenant, sale=sale):
        key = f'sale:{sale.id}:payment:{payment.id}'
        receivable, was_created = Receivable.all_objects.get_or_create(
            tenant=tenant,
            idempotency_key=key,
            defaults={
                'branch': sale.branch,
                'description': f'Venda {sale.id} - {payment.method}',
                'amount': payment.amount,
                'due_date': timezone.localdate()
                if payment.method in {'cash', 'pix'}
                else timezone.localdate() + timedelta(days=30),
                'source_type': 'sale_payment',
                'source_id': payment.id,
            },
        )
        if was_created:
            if payment.method in {'cash', 'pix'}:
                settle_receivable(
                    tenant=tenant,
                    receivable=receivable,
                    amount=payment.amount,
                    settled_on=timezone.localdate(),
                    idempotency_key=f'{key}:settlement',
                    actor=actor,
                )
            else:
                CashflowEntry.all_objects.create(
                    tenant=tenant,
                    branch=sale.branch,
                    direction='inflow',
                    status='forecast',
                    amount=payment.amount,
                    effective_date=receivable.due_date,
                    description=receivable.description,
                    source_type='receivable',
                    source_id=receivable.id,
                    idempotency_key=f'{key}:forecast',
                )
            _emit_financial_event(
                event_type='financial.receivable.created',
                instance=receivable,
                amount=payment.amount,
                actor=actor,
                correlation_id=key,
            )
        created.append(receivable)
    return created


def cashflow_projection(*, tenant, date_from, date_to, branch=None):
    from financial.models import CashflowEntry

    queryset = CashflowEntry.all_objects.filter(
        tenant=tenant,
        effective_date__range=(date_from, date_to),
    )
    if branch is not None:
        if branch.tenant_id != tenant.id:
            raise ValueError('Branch belongs to another tenant.')
        queryset = queryset.filter(branch=branch)

    totals = {
        'realized_inflow': Decimal('0.00'),
        'realized_outflow': Decimal('0.00'),
        'forecast_inflow': Decimal('0.00'),
        'forecast_outflow': Decimal('0.00'),
    }
    entries = []
    for entry in queryset.order_by('effective_date', 'created_at'):
        totals[f'{entry.status}_{entry.direction}'] += entry.amount
        entries.append(
            {
                'id': str(entry.id),
                'date': entry.effective_date,
                'direction': entry.direction,
                'status': entry.status,
                'amount': entry.amount,
                'description': entry.description,
            }
        )
    totals['realized_balance'] = totals['realized_inflow'] - totals['realized_outflow']
    totals['forecast_balance'] = totals['forecast_inflow'] - totals['forecast_outflow']
    totals['entries'] = entries
    return totals
