import json

from django.db import transaction
from django.utils import timezone

from audit.services import create_audit_record
from outbox.services import create_outbox_message

from .models import (
    PaymentIntent,
    PaymentProviderConfig,
    PaymentReconciliationBatch,
    PaymentReconciliationItem,
    PaymentTransaction,
    PaymentWebhookEvent,
)
from .providers.fake import FakePaymentProvider


class InvalidWebhookSignature(ValueError):
    pass


class ReconciliationDivergence(ValueError):
    pass


def _provider(config):
    if config.provider != 'fake':
        raise ValueError(f'Unsupported payment provider: {config.provider}')
    return FakePaymentProvider(secret=config.secret)


def _emit(*, obj, event_type, actor=None):
    payload = {
        'payment_id': str(obj.id),
        'status': obj.status,
    }
    create_audit_record(
        action=event_type,
        resource_type=obj.__class__.__name__,
        resource_id=obj.id,
        detail=payload,
        actor=actor,
        tenant_id=obj.tenant_id,
    )
    create_outbox_message(
        event_type=event_type,
        aggregate_type=obj.__class__.__name__,
        aggregate_id=obj.id,
        payload=payload,
        tenant_id=str(obj.tenant_id),
    )


@transaction.atomic
def create_payment_intent(
    *,
    tenant,
    sale,
    provider_config,
    idempotency_key,
    actor=None,
):
    existing = PaymentIntent.all_objects.filter(
        tenant=tenant,
        idempotency_key=idempotency_key,
    ).first()
    if existing:
        return existing
    if sale.tenant_id != tenant.id or provider_config.tenant_id != tenant.id:
        raise ValueError('Sale and provider config must belong to the tenant.')
    result = _provider(provider_config).create_intent(
        amount=sale.net_total,
        idempotency_key=idempotency_key,
    )
    intent = PaymentIntent.all_objects.create(
        tenant=tenant,
        sale=sale,
        provider_config=provider_config,
        amount=sale.net_total,
        status=result.status,
        idempotency_key=idempotency_key,
        provider_reference=result.reference,
    )
    _emit(obj=intent, event_type='payments.intent.created', actor=actor)
    return intent


@transaction.atomic
def capture_payment(*, intent, actor=None):
    existing = PaymentTransaction.all_objects.filter(
        intent=intent,
        transaction_type='capture',
        status='succeeded',
    ).first()
    if existing:
        return existing
    result = _provider(intent.provider_config).capture(
        intent.provider_reference,
        intent.amount,
    )
    payment = PaymentTransaction.all_objects.create(
        tenant=intent.tenant,
        intent=intent,
        transaction_type='capture',
        status=result.status,
        gross_amount=result.amount,
        fee_amount=result.fee,
        provider_reference=result.reference,
    )
    if result.status == 'succeeded':
        intent.status = 'captured'
        intent.save(update_fields=['status', 'updated_at'])
    _emit(obj=payment, event_type='payments.transaction.captured', actor=actor)
    return payment


@transaction.atomic
def process_webhook(*, tenant, provider, payload, signature):
    config = PaymentProviderConfig.all_objects.get(
        tenant=tenant,
        provider=provider,
        is_active=True,
    )
    adapter = _provider(config)
    if not adapter.verify_signature(payload, signature):
        raise InvalidWebhookSignature('Invalid webhook signature.')
    data = json.loads(payload.decode())
    external_id = str(data['id'])
    existing = PaymentWebhookEvent.all_objects.filter(
        tenant=tenant,
        provider=provider,
        external_id=external_id,
    ).first()
    if existing:
        return existing
    event = PaymentWebhookEvent.all_objects.create(
        tenant=tenant,
        provider=provider,
        external_id=external_id,
        payload=data,
        processed_at=timezone.now(),
    )
    safe_payload = {'webhook_id': str(event.id), 'provider': provider}
    create_outbox_message(
        event_type='payments.webhook.processed',
        aggregate_type='PaymentWebhookEvent',
        aggregate_id=event.id,
        payload=safe_payload,
        tenant_id=str(tenant.id),
    )
    return event


@transaction.atomic
def import_reconciliation_batch(*, tenant, provider, rows):
    from decimal import Decimal

    batch = PaymentReconciliationBatch.all_objects.create(
        tenant=tenant,
        provider=provider,
    )
    for row in rows:
        transaction_obj = PaymentTransaction.all_objects.filter(
            tenant=tenant,
            provider_reference=row['provider_reference'],
        ).first()
        gross = Decimal(str(row['gross_amount']))
        fee = Decimal(str(row.get('fee_amount', 0)))
        settled = Decimal(str(row['settled_amount']))
        status = 'matched' if settled == gross - fee else 'divergent'
        PaymentReconciliationItem.all_objects.create(
            tenant=tenant,
            batch=batch,
            transaction=transaction_obj,
            provider_reference=row['provider_reference'],
            gross_amount=gross,
            fee_amount=fee,
            settled_amount=settled,
            status=status,
        )
    return batch


@transaction.atomic
def confirm_reconciliation(*, batch, actor=None):
    from financial.services import record_payment_reconciliation_effect

    items = PaymentReconciliationItem.all_objects.filter(batch=batch)
    if items.filter(status='divergent').exists():
        raise ReconciliationDivergence('Batch contains divergent items requiring review.')
    if batch.status == 'confirmed':
        return batch
    for item in items:
        record_payment_reconciliation_effect(item=item)
    batch.status = 'confirmed'
    batch.confirmed_at = timezone.now()
    batch.save(update_fields=['status', 'confirmed_at', 'updated_at'])
    _emit(obj=batch, event_type='payments.reconciliation.confirmed', actor=actor)
    return batch
