import hashlib
import json

import pytest
from rest_framework.test import APIClient


def _client(ctx):
    client = APIClient()
    client.credentials(
        HTTP_AUTHORIZATION=f'Bearer {ctx["token"]}',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    return client


def _event(sequence=1, *, ctx=None, event_id=None, payload=None):
    tenant_id = str(ctx['tenant'].id) if ctx else '00000000-0000-0000-0000-000000000001'
    branch_id = str(ctx['branch'].id) if ctx else '00000000-0000-0000-0000-000000000002'
    device_id = ctx['device'].device_id if ctx else 'pdv-device-flow'
    return {
        'event_id': event_id or f'00000000-0000-0000-0000-{sequence:012d}',
        'device_id': device_id,
        'tenant_id': tenant_id,
        'branch_id': branch_id,
        'cash_session_id': '00000000-0000-0000-0000-000000000003',
        'operator_id': '00000000-0000-0000-0000-000000000004',
        'local_sequence': sequence,
        'event_type': 'offline.sale.completed',
        'event_version': 1,
        'idempotency_key': f'pdv-event-{sequence}',
        'occurred_at': '2026-08-11T12:00:00Z',
        'payload': payload or {'sale_id': f'local-sale-{sequence}'},
        'payload_hash': hashlib.sha256(
            json.dumps(
                payload or {'sale_id': f'local-sale-{sequence}'},
                sort_keys=True,
                separators=(',', ':'),
            ).encode()
        ).hexdigest(),
    }


@pytest.mark.django_db
def test_sync_batches_rejects_empty_batch(pdv_device_context):
    response = _client(pdv_device_context).post(
        '/api/v1/pdv/sync-batches/',
        {'events': []},
        format='json',
        HTTP_HOST='localhost',
    )

    assert response.status_code == 400
    assert response.json()['code'] == 'invalid_batch_size'


@pytest.mark.django_db
def test_sync_batches_rejects_more_than_fifty_events(pdv_device_context):
    response = _client(pdv_device_context).post(
        '/api/v1/pdv/sync-batches/',
        {'events': [_event(index) for index in range(1, 52)]},
        format='json',
        HTTP_HOST='localhost',
    )

    assert response.status_code == 400
    assert response.json()['code'] == 'invalid_batch_size'


@pytest.mark.django_db
def test_sync_batches_requires_device_authenticated_context(pdv_device_context):
    client = APIClient()
    client.force_authenticate(user=pdv_device_context['user'])

    response = client.post(
        '/api/v1/pdv/sync-batches/',
        {'events': [_event()]},
        format='json',
        HTTP_HOST='localhost',
    )

    assert response.status_code in (401, 403)


@pytest.mark.django_db
def test_sync_batches_accepts_single_event_and_returns_per_event_result(pdv_device_context):
    response = _client(pdv_device_context).post(
        '/api/v1/pdv/sync-batches/',
        {'events': [_event(ctx=pdv_device_context)]},
        format='json',
        HTTP_HOST='localhost',
    )

    assert response.status_code == 200
    result = response.json()['results'][0]
    assert result['event_id'] == _event(ctx=pdv_device_context)['event_id']
    assert result['status'] == 'accepted'


@pytest.mark.django_db
def test_sync_batches_records_sequence_gap_as_auditable_conflict(pdv_device_context):
    response = _client(pdv_device_context).post(
        '/api/v1/pdv/sync-batches/',
        {'events': [_event(2, ctx=pdv_device_context)]},
        format='json',
        HTTP_HOST='localhost',
    )

    assert response.status_code == 200
    result = response.json()['results'][0]
    assert result['status'] == 'conflict_requires_review'
    assert result['error_code'] == 'sequence_gap'


@pytest.mark.django_db
def test_sync_batches_replays_identical_event_without_duplicate_effect(pdv_device_context):
    payload = {'sale_id': 'same-local-sale'}
    body = {'events': [_event(ctx=pdv_device_context, payload=payload)]}
    client = _client(pdv_device_context)

    first = client.post('/api/v1/pdv/sync-batches/', body, format='json', HTTP_HOST='localhost')
    second = client.post('/api/v1/pdv/sync-batches/', body, format='json', HTTP_HOST='localhost')

    assert first.status_code == second.status_code == 200
    assert second.json()['results'][0]['event_id'] == first.json()['results'][0]['event_id']
