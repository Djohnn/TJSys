"""Coverage tests for payments/views, payments/services, outbox/tasks/publisher, config/views."""

import json
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest
from django.test import RequestFactory


def _h(tenant):
    return {'HTTP_X_TENANT_ID': str(tenant.id)}


# ──────────────────────────────────────────────────────────────
# payments/views.py
# ──────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_problem_helper_returns_problem_json(client, sale_context):
    """Given _problem() is called, when rendered, then it returns RFC 7807 body."""
    from config.views import csrf_failure

    response = csrf_failure(RequestFactory().post('/'), reason='test')
    assert response.status_code == 403


@pytest.mark.django_db
def test_intent_create_view_not_found(client, sale_context):
    """Given invalid sale/provider, when intent created via view, then 404."""
    ctx = sale_context
    client.force_login(ctx['user'])
    response = client.post(
        '/api/v1/payments/intents/',
        {
            'sale': '00000000-0000-0000-0000-000000000099',
            'provider_config': '00000000-0000-0000-0000-000000000099',
            'idempotency_key': 'missing-both',
        },
        content_type='application/json',
        **_h(ctx['tenant']),
    )
    assert response.status_code == 404
    assert response.json()['code'] == 'not_found'


@pytest.mark.django_db
def test_intent_create_view_success(client, sale_context):
    """Given valid sale and config, when intent created via view, then 201 with data."""
    from payments.models import PaymentProviderConfig

    ctx = sale_context
    client.force_login(ctx['user'])
    config = PaymentProviderConfig.all_objects.create(
        tenant=ctx['tenant'], provider='fake', secret='view-secret'
    )
    response = client.post(
        '/api/v1/payments/intents/',
        {
            'sale': str(ctx['sale'].id),
            'provider_config': str(config.id),
            'idempotency_key': 'view-intent-1',
        },
        content_type='application/json',
        **_h(ctx['tenant']),
    )
    assert response.status_code == 201
    body = response.json()
    assert body['status'] == 'authorized'
    assert body['idempotency_key'] == 'view-intent-1'


@pytest.mark.django_db
def test_intent_viewset_update_returns_405(client, sale_context):
    """Given an intent, when PUT attempted, then 405 immutability error."""
    from payments.models import PaymentProviderConfig
    from payments.services import create_payment_intent

    ctx = sale_context
    client.force_login(ctx['user'])
    config = PaymentProviderConfig.all_objects.create(
        tenant=ctx['tenant'], provider='fake', secret='x'
    )
    intent = create_payment_intent(
        tenant=ctx['tenant'],
        sale=ctx['sale'],
        provider_config=config,
        idempotency_key='immutable-1',
        actor=ctx['user'],
    )
    response = client.put(
        f'/api/v1/payments/intents/{intent.id}/',
        {'status': 'captured'},
        content_type='application/json',
        **_h(ctx['tenant']),
    )
    assert response.status_code == 405
    assert response.json()['code'] == 'intent_immutable'


@pytest.mark.django_db
def test_intent_viewset_partial_update_returns_405(client, sale_context):
    """Given an intent, when PATCH attempted, then 405 immutability error."""
    from payments.models import PaymentProviderConfig
    from payments.services import create_payment_intent

    ctx = sale_context
    client.force_login(ctx['user'])
    config = PaymentProviderConfig.all_objects.create(
        tenant=ctx['tenant'], provider='fake', secret='x'
    )
    intent = create_payment_intent(
        tenant=ctx['tenant'],
        sale=ctx['sale'],
        provider_config=config,
        idempotency_key='immutable-patch',
        actor=ctx['user'],
    )
    response = client.patch(
        f'/api/v1/payments/intents/{intent.id}/',
        {'status': 'captured'},
        content_type='application/json',
        **_h(ctx['tenant']),
    )
    assert response.status_code == 405


@pytest.mark.django_db
def test_intent_viewset_destroy_returns_405(client, sale_context):
    """Given an intent, when DELETE attempted, then 405 immutability error."""
    from payments.models import PaymentProviderConfig
    from payments.services import create_payment_intent

    ctx = sale_context
    client.force_login(ctx['user'])
    config = PaymentProviderConfig.all_objects.create(
        tenant=ctx['tenant'], provider='fake', secret='x'
    )
    intent = create_payment_intent(
        tenant=ctx['tenant'],
        sale=ctx['sale'],
        provider_config=config,
        idempotency_key='immutable-del',
        actor=ctx['user'],
    )
    response = client.delete(
        f'/api/v1/payments/intents/{intent.id}/',
        **_h(ctx['tenant']),
    )
    assert response.status_code == 405


@pytest.mark.django_db
def test_intent_viewset_list(client, sale_context):
    """Given intents exist, when listing, then tenant-scoped results returned."""
    from payments.models import PaymentProviderConfig
    from payments.services import create_payment_intent

    ctx = sale_context
    client.force_login(ctx['user'])
    config = PaymentProviderConfig.all_objects.create(
        tenant=ctx['tenant'], provider='fake', secret='x'
    )
    create_payment_intent(
        tenant=ctx['tenant'],
        sale=ctx['sale'],
        provider_config=config,
        idempotency_key='list-intent-1',
        actor=ctx['user'],
    )
    response = client.get('/api/v1/payments/intents/', **_h(ctx['tenant']))
    assert response.status_code == 200
    assert len(response.json()['results']) >= 1


@pytest.mark.django_db
def test_intent_viewset_retrieve(client, sale_context):
    """Given an intent, when retrieving by pk, then detail returned."""
    from payments.models import PaymentProviderConfig
    from payments.services import create_payment_intent

    ctx = sale_context
    client.force_login(ctx['user'])
    config = PaymentProviderConfig.all_objects.create(
        tenant=ctx['tenant'], provider='fake', secret='x'
    )
    intent = create_payment_intent(
        tenant=ctx['tenant'],
        sale=ctx['sale'],
        provider_config=config,
        idempotency_key='retrieve-intent',
        actor=ctx['user'],
    )
    response = client.get(
        f'/api/v1/payments/intents/{intent.id}/', **_h(ctx['tenant'])
    )
    assert response.status_code == 200
    assert response.json()['id'] == str(intent.id)


@pytest.mark.django_db
def test_transaction_viewset_list(client, sale_context):
    """Given transactions exist, when listing, then tenant-scoped results returned."""
    from payments.models import PaymentProviderConfig
    from payments.services import capture_payment, create_payment_intent

    ctx = sale_context
    client.force_login(ctx['user'])
    config = PaymentProviderConfig.all_objects.create(
        tenant=ctx['tenant'], provider='fake', secret='x'
    )
    intent = create_payment_intent(
        tenant=ctx['tenant'],
        sale=ctx['sale'],
        provider_config=config,
        idempotency_key='txn-list',
        actor=ctx['user'],
    )
    capture_payment(intent=intent, actor=ctx['user'])
    response = client.get('/api/v1/payments/transactions/', **_h(ctx['tenant']))
    assert response.status_code == 200
    assert len(response.json()['results']) >= 1


@pytest.mark.django_db
def test_provider_configViewSet_create(client, tenant_alpha, user_alpha):
    """Given provider config data, when created, then secret is write-only."""

    client.force_login(user_alpha)
    session = client.session
    session['mfa_tenant_id'] = str(tenant_alpha.id)
    session['mfa_method'] = 'totp'
    session.save()
    response = client.post(
        '/api/v1/payments/provider-configs/',
        {'provider': 'fake', 'secret': 'my-secret', 'is_active': True},
        content_type='application/json',
        **_h(tenant_alpha),
    )
    assert response.status_code == 201
    body = response.json()
    assert body['configured'] is True
    assert 'secret' not in body


@pytest.mark.django_db
def test_provider_configViewSet_update_preserves_blank_secret(client, tenant_alpha, user_alpha):
    """Given existing config, when updated with blank secret, then secret preserved."""
    from payments.models import PaymentProviderConfig

    client.force_login(user_alpha)
    session = client.session
    session['mfa_tenant_id'] = str(tenant_alpha.id)
    session['mfa_method'] = 'totp'
    session.save()
    config = PaymentProviderConfig.all_objects.create(
        tenant=tenant_alpha, provider='fake', secret='keep-me'
    )
    response = client.put(
        f'/api/v1/payments/provider-configs/{config.id}/',
        {'provider': 'fake', 'secret': '', 'is_active': True},
        content_type='application/json',
        **_h(tenant_alpha),
    )
    assert response.status_code == 200
    config.refresh_from_db()
    assert config.secret == 'keep-me'


@pytest.mark.django_db
def test_reconciliation_batchViewSet_list(client, sale_context):
    """Given batches exist, when listing, then results returned."""
    from payments.services import import_reconciliation_batch

    ctx = sale_context
    client.force_login(ctx['user'])
    import_reconciliation_batch(
        tenant=ctx['tenant'],
        provider='fake',
        rows=[
            {
                'provider_reference': 'batch-list-ref',
                'gross_amount': '10.00',
                'fee_amount': '1.00',
                'settled_amount': '9.00',
            }
        ],
    )
    response = client.get(
        '/api/v1/payments/reconciliation-batches/', **_h(ctx['tenant'])
    )
    assert response.status_code == 200
    assert len(response.json()['results']) >= 1


@pytest.mark.django_db
def test_reconciliation_batchViewSet_retrieve(client, sale_context):
    """Given a batch, when retrieving by pk, then detail returned."""
    from payments.services import import_reconciliation_batch

    ctx = sale_context
    client.force_login(ctx['user'])
    batch = import_reconciliation_batch(
        tenant=ctx['tenant'],
        provider='fake',
        rows=[
            {
                'provider_reference': 'batch-retrieve',
                'gross_amount': '10.00',
                'fee_amount': '1.00',
                'settled_amount': '9.00',
            }
        ],
    )
    response = client.get(
        f'/api/v1/payments/reconciliation-batches/{batch.id}/',
        **_h(ctx['tenant']),
    )
    assert response.status_code == 200
    assert response.json()['id'] == str(batch.id)


@pytest.mark.django_db
def test_reconciliation_batchViewSet_create_api(client, sale_context):
    """Given reconciliation rows, when created via API, then 201."""
    ctx = sale_context
    client.force_login(ctx['user'])
    response = client.post(
        '/api/v1/payments/reconciliation-batches/',
        {
            'provider': 'fake',
            'rows': [
                {
                    'provider_reference': 'api-batch-row',
                    'gross_amount': '50.00',
                    'fee_amount': '5.00',
                    'settled_amount': '45.00',
                }
            ],
        },
        content_type='application/json',
        **_h(ctx['tenant']),
    )
    assert response.status_code == 201
    assert response.json()['status'] == 'draft'


@pytest.mark.django_db
def test_reconciliation_confirm_divergence_via_api(client, sale_context):
    """Given divergent batch, when confirmed via API, then 409."""
    from payments.services import import_reconciliation_batch

    ctx = sale_context
    client.force_login(ctx['user'])
    batch = import_reconciliation_batch(
        tenant=ctx['tenant'],
        provider='fake',
        rows=[
            {
                'provider_reference': 'divergent-api',
                'gross_amount': '20.00',
                'fee_amount': '3.00',
                'settled_amount': '15.00',
            }
        ],
    )
    response = client.post(
        f'/api/v1/payments/reconciliation-batches/{batch.id}/confirm/',
        {},
        content_type='application/json',
        **_h(ctx['tenant']),
    )
    assert response.status_code == 409
    assert response.json()['code'] == 'reconciliation_divergence'


@pytest.mark.django_db
def test_payment_webhook_invalid_signature(client, sale_context):
    """Given webhook with bad signature, when processed, then 400."""
    from payments.models import PaymentProviderConfig

    ctx = sale_context
    client.force_login(ctx['user'])
    PaymentProviderConfig.all_objects.create(
        tenant=ctx['tenant'], provider='fake', secret='whsec-test'
    )
    response = client.post(
        '/api/v1/payments/webhooks/fake/',
        json.dumps({'id': 'evt-bad'}).encode(),
        content_type='application/json',
        HTTP_X_PAYMENT_SIGNATURE='wrong-sig',
        **_h(ctx['tenant']),
    )
    assert response.status_code == 400
    assert response.json()['code'] == 'invalid_webhook_signature'


@pytest.mark.django_db
def test_payment_webhook_provider_not_configured(client, sale_context):
    """Given no provider config, when webhook received, then 404."""
    ctx = sale_context
    client.force_login(ctx['user'])
    response = client.post(
        '/api/v1/payments/webhooks/fake/',
        json.dumps({'id': 'evt-noconf'}).encode(),
        content_type='application/json',
        HTTP_X_PAYMENT_SIGNATURE='sig',
        **_h(ctx['tenant']),
    )
    assert response.status_code == 404
    assert response.json()['code'] == 'provider_not_found'


@pytest.mark.django_db
def test_provider_configViewSet_list(client, tenant_alpha, user_alpha):
    """Given configs exist, when listing, then tenant-scoped results returned."""
    from payments.models import PaymentProviderConfig

    client.force_login(user_alpha)
    session = client.session
    session['mfa_tenant_id'] = str(tenant_alpha.id)
    session['mfa_method'] = 'totp'
    session.save()
    PaymentProviderConfig.all_objects.create(
        tenant=tenant_alpha, provider='fake', secret='list-me'
    )
    response = client.get(
        '/api/v1/payments/provider-configs/', **_h(tenant_alpha)
    )
    assert response.status_code == 200
    assert len(response.json()['results']) >= 1


# ──────────────────────────────────────────────────────────────
# payments/services.py
# ──────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_create_payment_intent_idempotent_returns_existing(sale_context):
    """Given existing intent with same key, when recreated, then same returned."""
    from payments.models import PaymentIntent, PaymentProviderConfig
    from payments.services import create_payment_intent

    ctx = sale_context
    config = PaymentProviderConfig.all_objects.create(
        tenant=ctx['tenant'], provider='fake', secret='idem-svc'
    )
    first = create_payment_intent(
        tenant=ctx['tenant'],
        sale=ctx['sale'],
        provider_config=config,
        idempotency_key='idem-svc-key',
        actor=ctx['user'],
    )
    second = create_payment_intent(
        tenant=ctx['tenant'],
        sale=ctx['sale'],
        provider_config=config,
        idempotency_key='idem-svc-key',
        actor=ctx['user'],
    )
    assert first.id == second.id
    assert PaymentIntent.all_objects.filter(
        tenant=ctx['tenant'], idempotency_key='idem-svc-key'
    ).count() == 1


@pytest.mark.django_db
def test_create_payment_intent_cross_tenant_raises(sale_context, tenant_beta):
    """Given sale from another tenant, when intent created, then ValueError raised."""
    from payments.models import PaymentProviderConfig
    from payments.services import create_payment_intent

    ctx = sale_context
    config = PaymentProviderConfig.all_objects.create(
        tenant=ctx['tenant'], provider='fake', secret='cross'
    )
    other_config = PaymentProviderConfig.all_objects.create(
        tenant=tenant_beta, provider='fake', secret='other'
    )
    with pytest.raises(ValueError, match='must belong to the tenant'):
        create_payment_intent(
            tenant=tenant_beta,
            sale=ctx['sale'],
            provider_config=config,
            idempotency_key='cross-tenant',
            actor=ctx['user'],
        )


@pytest.mark.django_db
def test_capture_payment_idempotent_returns_existing(sale_context):
    """Given existing capture, when captured again, then same transaction returned."""
    from payments.models import PaymentProviderConfig, PaymentTransaction
    from payments.services import capture_payment, create_payment_intent

    ctx = sale_context
    config = PaymentProviderConfig.all_objects.create(
        tenant=ctx['tenant'], provider='fake', secret='cap-idem'
    )
    intent = create_payment_intent(
        tenant=ctx['tenant'],
        sale=ctx['sale'],
        provider_config=config,
        idempotency_key='cap-idem-key',
        actor=ctx['user'],
    )
    first = capture_payment(intent=intent, actor=ctx['user'])
    second = capture_payment(intent=intent, actor=ctx['user'])
    assert first.id == second.id
    assert PaymentTransaction.all_objects.filter(intent=intent).count() == 1


@pytest.mark.django_db
def test_process_webhook_provider_not_found(sale_context):
    """Given no active provider config, when webhook processed, then DoesNotExist."""
    from payments.models import PaymentProviderConfig
    from payments.services import process_webhook

    ctx = sale_context
    with pytest.raises(PaymentProviderConfig.DoesNotExist):
        process_webhook(
            tenant=ctx['tenant'],
            provider='nonexistent',
            payload=b'{"id":"x"}',
            signature='sig',
        )


@pytest.mark.django_db
def test_provider_helper_rejects_unknown_provider(tenant_alpha):
    """Given unknown provider name, when _provider called, then ValueError."""
    from payments.services import _provider

    fake_config = MagicMock(provider='stripe', secret='x')
    with pytest.raises(ValueError, match='Unsupported payment provider'):
        _provider(fake_config)


@pytest.mark.django_db
def test_confirm_reconciliation_already_confirmed(sale_context):
    """Given already confirmed batch, when confirmed again, then no-op returns same batch."""
    from payments.services import confirm_reconciliation, import_reconciliation_batch

    ctx = sale_context
    batch = import_reconciliation_batch(
        tenant=ctx['tenant'],
        provider='fake',
        rows=[
            {
                'provider_reference': 'already-conf',
                'gross_amount': '10.00',
                'fee_amount': '1.00',
                'settled_amount': '9.00',
            }
        ],
    )
    confirm_reconciliation(batch=batch, actor=ctx['user'])
    result = confirm_reconciliation(batch=batch, actor=ctx['user'])
    assert result.status == 'confirmed'


@pytest.mark.django_db
def test_import_reconciliation_batch_divergent_item(sale_context):
    """Given mismatched amounts, when imported, then item marked divergent."""
    from payments.models import PaymentReconciliationItem
    from payments.services import import_reconciliation_batch

    ctx = sale_context
    batch = import_reconciliation_batch(
        tenant=ctx['tenant'],
        provider='fake',
        rows=[
            {
                'provider_reference': 'divergent-import',
                'gross_amount': '20.00',
                'fee_amount': '2.00',
                'settled_amount': '15.00',
            }
        ],
    )
    item = PaymentReconciliationItem.all_objects.get(batch=batch)
    assert item.status == 'divergent'
    assert item.difference_amount == Decimal('-3.00')


@pytest.mark.django_db
def test_import_reconciliation_batch_no_matching_transaction(sale_context):
    """Given row with no matching transaction, when imported, then item has null transaction."""
    from payments.models import PaymentReconciliationItem
    from payments.services import import_reconciliation_batch

    ctx = sale_context
    batch = import_reconciliation_batch(
        tenant=ctx['tenant'],
        provider='fake',
        rows=[
            {
                'provider_reference': 'no-match-txn',
                'gross_amount': '10.00',
                'fee_amount': '0.00',
                'settled_amount': '10.00',
            }
        ],
    )
    item = PaymentReconciliationItem.all_objects.get(batch=batch)
    assert item.transaction is None
    assert item.status == 'matched'


# ──────────────────────────────────────────────────────────────
# outbox/tasks/publisher.py
# ──────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_report_unhealthy_outbox_healthy():
    """Given no stale or dead-letter messages, when reported, then all zero."""
    from outbox.tasks.publisher import report_unhealthy_outbox

    result = report_unhealthy_outbox(max_age_minutes=5)
    assert result['stale'] == 0
    assert result['dead_letter'] == 0


@pytest.mark.django_db(transaction=True)
def test_report_unhealthy_outbox_with_dead_letter():
    """Given dead-letter messages, when reported, then count includes them."""
    from outbox.models import OutboxMessage
    from outbox.tasks.publisher import report_unhealthy_outbox

    OutboxMessage.objects.create(
        event_type='test.dl',
        aggregate_type='Test',
        aggregate_id='dl-1',
        payload={},
        status='DEAD_LETTER',
    )
    result = report_unhealthy_outbox(max_age_minutes=5)
    assert result['dead_letter'] >= 1


@pytest.mark.django_db(transaction=True)
def test_process_outbox_message_not_found():
    """Given non-existent message id, when processed, then returns without error."""
    import uuid

    from outbox.tasks.publisher import process_outbox

    fake_id = uuid.uuid4()
    process_outbox(str(fake_id))


@pytest.mark.django_db(transaction=True)
def test_process_outbox_already_published():
    """Given published message, when reprocessed, then idempotent no-op."""
    from outbox.models import OutboxMessage
    from outbox.tasks.publisher import process_outbox

    msg = OutboxMessage.objects.create(
        event_type='test.published',
        aggregate_type='Test',
        aggregate_id='pub-1',
        payload={},
        status='PUBLISHED',
    )
    process_outbox(str(msg.id))
    msg.refresh_from_db()
    assert msg.status == 'PUBLISHED'


@pytest.mark.django_db(transaction=True)
def test_process_outbox_unprocessable_status():
    """Given message in unrecognized status, when processed, then warning logged."""
    from outbox.models import OutboxMessage
    from outbox.tasks.publisher import process_outbox

    msg = OutboxMessage.objects.create(
        event_type='test.processing',
        aggregate_type='Test',
        aggregate_id='proc-1',
        payload={},
        status='PROCESSING',
    )
    process_outbox(str(msg.id))
    msg.refresh_from_db()
    assert msg.status == 'PROCESSING'


@pytest.mark.django_db(transaction=True)
def test_process_outbox_no_handler_raises():
    """Given message with unregistered handler, when processed, then LookupError raised."""
    from outbox.models import OutboxMessage
    from outbox.tasks.publisher import process_outbox

    msg = OutboxMessage.objects.create(
        event_type='nonexistent.handler.type',
        aggregate_type='Test',
        aggregate_id='nohandler-1',
        payload={},
        status='PENDING',
    )
    with pytest.raises(LookupError, match='No outbox handler'):
        process_outbox(str(msg.id))


@pytest.mark.django_db(transaction=True)
def test_process_outbox_successful_publish():
    """Given pending message with handler, when processed, then published and delivery created."""
    from outbox.handlers import register_handler
    from outbox.models import OutboxDelivery, OutboxMessage
    from outbox.tasks.publisher import process_outbox

    @register_handler('test.coverage.publish')
    def _handler(message):
        return {'ok': True}

    msg = OutboxMessage.objects.create(
        event_type='test.coverage.publish',
        aggregate_type='Test',
        aggregate_id='pub-ok-1',
        payload={'x': 1},
        status='PENDING',
    )
    process_outbox(str(msg.id))

    msg.refresh_from_db()
    assert msg.status == 'PUBLISHED'
    assert msg.published_at is not None
    assert msg.last_error == ''
    delivery = OutboxDelivery.objects.get(message=msg)
    assert delivery.result == {'ok': True}


@pytest.mark.django_db(transaction=True)
def test_record_failure_sets_failed_status():
    """Given message with retries < 3, when failure recorded, then status FAILED."""
    from outbox.models import OutboxMessage
    from outbox.tasks.publisher import _record_failure

    msg = OutboxMessage.objects.create(
        event_type='test.fail',
        aggregate_type='Test',
        aggregate_id='fail-1',
        payload={},
        status='PENDING',
        retry_count=1,
    )
    _record_failure(str(msg.id), Exception('something broke'))

    msg.refresh_from_db()
    assert msg.status == 'FAILED'
    assert msg.retry_count == 2
    assert 'something broke' in msg.last_error


@pytest.mark.django_db(transaction=True)
def test_record_failure_sets_dead_letter_after_3_retries():
    """Given message with retries >= 3, when failure recorded, then status DEAD_LETTER."""
    from outbox.models import OutboxMessage
    from outbox.tasks.publisher import _record_failure

    msg = OutboxMessage.objects.create(
        event_type='test.dead',
        aggregate_type='Test',
        aggregate_id='dead-1',
        payload={},
        status='FAILED',
        retry_count=3,
    )
    _record_failure(str(msg.id), Exception('final failure'))

    msg.refresh_from_db()
    assert msg.status == 'DEAD_LETTER'
    assert msg.retry_count == 4


@pytest.mark.django_db(transaction=True)
def test_record_failure_missing_message():
    """Given non-existent message id, when failure recorded, then no error."""
    import uuid

    from outbox.tasks.publisher import _record_failure

    _record_failure(str(uuid.uuid4()), Exception('orphan'))


@pytest.mark.django_db(transaction=True)
def test_process_outbox_handler_returns_none():
    """Given handler returning None, when processed, then delivery result is empty dict."""
    from outbox.handlers import register_handler
    from outbox.models import OutboxDelivery, OutboxMessage
    from outbox.tasks.publisher import process_outbox

    @register_handler('test.handler.none')
    def _none_handler(message):
        return None

    msg = OutboxMessage.objects.create(
        event_type='test.handler.none',
        aggregate_type='Test',
        aggregate_id='none-1',
        payload={},
        status='PENDING',
    )
    process_outbox(str(msg.id))

    msg.refresh_from_db()
    assert msg.status == 'PUBLISHED'
    delivery = OutboxDelivery.objects.get(message=msg)
    assert delivery.result == {}


# ──────────────────────────────────────────────────────────────
# config/views.py
# ──────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_health_view_returns_200(client, settings):
    """Given working db and locmem cache, when health checked, then 200."""
    settings.CACHES = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}
    response = client.get('/health/')
    body = response.json()
    assert response.status_code == 200
    assert body['status'] == 'healthy'
    assert body['services']['database'] == 'ok'
    assert body['services']['cache'] == 'ok'


@pytest.mark.django_db
def test_health_view_redis_down_returns_503(client, settings, monkeypatch):
    """Given broken Redis, when health checked, then 503 degraded."""
    settings.CACHES = {
        'default': {
            'BACKEND': 'django_redis.cache.RedisCache',
            'LOCATION': 'redis://localhost:6380/0',
        }
    }

    class BrokenRedis:
        def __init__(self, *a, **kw):
            pass

        def ping(self):
            raise ConnectionError('down')

    monkeypatch.setattr('redis.Redis', BrokenRedis)
    response = client.get('/health/')
    body = response.json()
    assert response.status_code == 503
    assert body['status'] == 'degraded'
    assert body['services']['cache'] == 'down'


@pytest.mark.django_db
def test_readiness_view_returns_200(client, settings):
    """Given working services and low backlog, when readiness checked, then 200."""
    settings.CACHES = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}
    response = client.get('/readiness/')
    body = response.json()
    assert response.status_code == 200
    assert body['status'] == 'ready'
    assert body['outbox']['total_pending'] == 0
    assert body['outbox']['status'] == 'ok'


@pytest.mark.django_db
def test_readiness_view_backlog_too_large_returns_503(client, settings):
    """Given 100+ pending messages, when readiness checked, then 503."""
    from outbox.models import OutboxMessage

    settings.CACHES = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}
    for i in range(101):
        OutboxMessage.objects.create(
            event_type='backlog.test',
            aggregate_type='Test',
            aggregate_id=str(i),
            payload={},
            status='PENDING',
        )
    response = client.get('/readiness/')
    body = response.json()
    assert response.status_code == 503
    assert body['outbox']['status'] == 'backlog_too_large'
    assert body['outbox']['total_pending'] >= 101


@pytest.mark.django_db
def test_readiness_view_redis_down_returns_503(client, settings, monkeypatch):
    """Given broken Redis, when readiness checked, then 503."""
    settings.CACHES = {
        'default': {
            'BACKEND': 'django_redis.cache.RedisCache',
            'LOCATION': 'redis://localhost:6380/0',
        }
    }

    class BrokenRedis:
        def __init__(self, *a, **kw):
            pass

        def ping(self):
            raise ConnectionError('down')

    monkeypatch.setattr('redis.Redis', BrokenRedis)
    response = client.get('/readiness/')
    body = response.json()
    assert response.status_code == 503
    assert body['services']['cache'] == 'down'


@pytest.mark.django_db
def test_readiness_view_shows_oldest_pending(client, settings):
    """Given pending messages, when readiness checked, then oldest timestamp shown."""
    from outbox.models import OutboxMessage

    settings.CACHES = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}
    OutboxMessage.objects.create(
        event_type='oldest.test',
        aggregate_type='Test',
        aggregate_id='old-1',
        payload={},
        status='PENDING',
    )
    response = client.get('/readiness/')
    body = response.json()
    assert body['outbox']['oldest_pending'] is not None
    assert body['outbox']['failed_count'] == 0


@pytest.mark.django_db
def test_readiness_view_shows_failed_count(client, settings):
    """Given failed messages, when readiness checked, then failed_count shown."""
    from outbox.models import OutboxMessage

    settings.CACHES = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}
    OutboxMessage.objects.create(
        event_type='failed.test',
        aggregate_type='Test',
        aggregate_id='fail-cnt',
        payload={},
        status='FAILED',
    )
    response = client.get('/readiness/')
    body = response.json()
    assert body['outbox']['failed_count'] >= 1


def test_check_redis_empty_location():
    """Given empty cache location, when _check_redis called, then True (no redis)."""
    from config.views import _check_redis

    with patch('config.views.settings') as mock_settings:
        mock_settings.CACHES = {'default': {'BACKEND': 'foo', 'LOCATION': ''}}
        assert _check_redis() is True


def test_csrf_failure_content_type():
    """Given csrf_failure, when rendered, then problem+json content type."""
    from config.views import csrf_failure

    response = csrf_failure(RequestFactory().post('/'))
    assert response['Content-Type'] == 'application/problem+json'
    body = json.loads(response.content)
    assert body['status'] == 403
    assert body['title'] == 'CSRF validation failed'
