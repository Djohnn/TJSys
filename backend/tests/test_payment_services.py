"""Sprint 13 payment service scenarios (Given/When/Then)."""

import json

import pytest


@pytest.mark.django_db
def test_create_intent_from_sale_and_capture(sale_context):
    """Given a confirmed sale, when integrated payment is captured, then states advance."""
    from payments.models import PaymentProviderConfig, PaymentTransaction
    from payments.services import capture_payment, create_payment_intent

    ctx = sale_context
    config = PaymentProviderConfig.all_objects.create(
        tenant=ctx['tenant'], provider='fake', secret='restricted-secret'
    )
    intent = create_payment_intent(
        tenant=ctx['tenant'],
        sale=ctx['sale'],
        provider_config=config,
        idempotency_key='sale-payment-1',
        actor=ctx['user'],
    )
    transaction = capture_payment(intent=intent, actor=ctx['user'])

    intent.refresh_from_db()
    assert intent.amount == ctx['sale'].net_total
    assert intent.status == 'captured'
    assert transaction.transaction_type == 'capture'
    assert PaymentTransaction.all_objects.filter(intent=intent).count() == 1


@pytest.mark.django_db
def test_duplicate_webhook_is_idempotent_and_events_hide_secret(sale_context):
    """Given a signed webhook, when replayed, then only one event is persisted."""
    from outbox.models import OutboxMessage
    from payments.models import PaymentProviderConfig, PaymentWebhookEvent
    from payments.providers.fake import FakePaymentProvider
    from payments.services import process_webhook

    ctx = sale_context
    config = PaymentProviderConfig.all_objects.create(
        tenant=ctx['tenant'], provider='fake', secret='restricted-secret'
    )
    payload = json.dumps({'id': 'evt-1', 'status': 'captured'}).encode()
    signature = FakePaymentProvider(secret=config.secret).sign(payload)

    first = process_webhook(
        tenant=ctx['tenant'], provider='fake', payload=payload, signature=signature
    )
    second = process_webhook(
        tenant=ctx['tenant'], provider='fake', payload=payload, signature=signature
    )

    assert first.id == second.id
    assert PaymentWebhookEvent.all_objects.filter(tenant=ctx['tenant']).count() == 1
    assert 'restricted-secret' not in str(
        list(OutboxMessage.objects.values_list('payload', flat=True))
    )


@pytest.mark.django_db
def test_webhook_rejects_invalid_signature(sale_context):
    """Given an invalid signature, when processed, then no webhook is stored."""
    from payments.models import PaymentProviderConfig, PaymentWebhookEvent
    from payments.services import InvalidWebhookSignature, process_webhook

    ctx = sale_context
    PaymentProviderConfig.all_objects.create(
        tenant=ctx['tenant'], provider='fake', secret='restricted-secret'
    )
    with pytest.raises(InvalidWebhookSignature):
        process_webhook(
            tenant=ctx['tenant'],
            provider='fake',
            payload=b'{"id":"evt-2"}',
            signature='invalid',
        )
    assert not PaymentWebhookEvent.all_objects.filter(tenant=ctx['tenant']).exists()
