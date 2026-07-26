"""Sprint 13 API scenarios (Given/When/Then)."""

import json

import pytest


def _h(tenant):
    return {'HTTP_X_TENANT_ID': str(tenant.id)}


@pytest.mark.django_db
def test_intent_creation_and_transaction_listing_api(client, sale_context):
    """Given a sale, when intent is created, then API returns its stable schema."""
    from payments.models import PaymentProviderConfig

    ctx = sale_context
    client.force_login(ctx['user'])
    config = PaymentProviderConfig.all_objects.create(
        tenant=ctx['tenant'], provider='fake', secret='api-secret'
    )
    response = client.post(
        '/api/v1/payments/intents/',
        {
            'sale': str(ctx['sale'].id),
            'provider_config': str(config.id),
            'idempotency_key': 'api-intent-1',
        },
        content_type='application/json',
        **_h(ctx['tenant']),
    )

    assert response.status_code == 201, response.content
    body = response.json()
    assert {'id', 'amount', 'currency', 'status', 'provider_reference'} <= body.keys()
    listed = client.get('/api/v1/payments/transactions/', **_h(ctx['tenant']))
    assert listed.status_code == 200
    assert listed.json()['results'] == []


@pytest.mark.django_db
def test_webhook_api_validates_signature_and_replay(client, sale_context):
    """Given a signed webhook, when replayed, then both calls resolve one event."""
    from payments.models import PaymentProviderConfig, PaymentWebhookEvent
    from payments.providers.fake import FakePaymentProvider

    ctx = sale_context
    client.force_login(ctx['user'])
    config = PaymentProviderConfig.all_objects.create(
        tenant=ctx['tenant'], provider='fake', secret='api-secret'
    )
    payload = json.dumps({'id': 'api-event-1', 'status': 'captured'}).encode()
    signature = FakePaymentProvider(secret=config.secret).sign(payload)
    responses = [
        client.post(
            '/api/v1/payments/webhooks/fake/',
            payload,
            content_type='application/json',
            HTTP_X_PAYMENT_SIGNATURE=signature,
            **_h(ctx['tenant']),
        )
        for _ in range(2)
    ]

    assert [response.status_code for response in responses] == [200, 200]
    assert responses[0].json()['id'] == responses[1].json()['id']
    assert PaymentWebhookEvent.all_objects.filter(tenant=ctx['tenant']).count() == 1


@pytest.mark.django_db
def test_reconciliation_confirmation_and_cross_tenant_isolation(
    client,
    sale_context,
    tenant_beta,
    user_beta,
):
    """Given a tenant batch, when another tenant accesses it, then it is hidden."""
    from payments.services import import_reconciliation_batch

    ctx = sale_context
    batch = import_reconciliation_batch(
        tenant=ctx['tenant'],
        provider='fake',
        rows=[
            {
                'provider_reference': 'manual-provider-ref',
                'gross_amount': '10.00',
                'fee_amount': '1.00',
                'settled_amount': '9.00',
            }
        ],
    )
    client.force_login(user_beta)
    hidden = client.post(
        f'/api/v1/payments/reconciliation-batches/{batch.id}/confirm/',
        {},
        content_type='application/json',
        **_h(tenant_beta),
    )
    assert hidden.status_code == 404

    client.force_login(ctx['user'])
    confirmed = client.post(
        f'/api/v1/payments/reconciliation-batches/{batch.id}/confirm/',
        {},
        content_type='application/json',
        **_h(ctx['tenant']),
    )
    assert confirmed.status_code == 200
    assert confirmed.json()['status'] == 'confirmed'
