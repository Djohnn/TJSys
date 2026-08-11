import hashlib
import json

import pytest
from rest_framework.test import APIClient

from pdv.models import PDVSyncConflict


def _client(context):
    client = APIClient()
    client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {context['token']}",
        HTTP_X_TENANT_ID=str(context['tenant'].id),
    )
    return client


def _event(context, sequence, *, event_id=None, payload=None, idempotency_key=None):
    payload = payload or {'sale_id': f'chaos-sale-{sequence}'}
    return {
        'event_id': event_id or f'00000000-0000-0000-0000-{sequence:012d}',
        'device_id': context['device'].device_id,
        'tenant_id': str(context['tenant'].id),
        'branch_id': str(context['branch'].id),
        'cash_session_id': '00000000-0000-0000-0000-000000000003',
        'operator_id': '00000000-0000-0000-0000-000000000004',
        'local_sequence': sequence,
        'event_type': 'offline.sale.completed',
        'event_version': 1,
        'idempotency_key': idempotency_key or f'chaos-event-{sequence}',
        'occurred_at': '2026-08-11T12:00:00Z',
        'payload': payload,
        'payload_hash': hashlib.sha256(
            json.dumps(payload, sort_keys=True, separators=(',', ':')).encode()
        ).hexdigest(),
    }


@pytest.mark.django_db
def test_sync_batches_chaos_out_of_order_and_bad_hash_are_fail_closed(pdv_device_context):
    """Given reordered/offline events, the API preserves auditability and rejects bad hashes."""
    client = _client(pdv_device_context)

    # Given a burst reordered by the network, each event receives an explicit result.
    response = client.post(
        '/api/v1/pdv/sync-batches/',
        {
            'events': [
                _event(pdv_device_context, 1),
                _event(pdv_device_context, 3),
                _event(pdv_device_context, 2),
            ]
        },
        format='json',
        HTTP_HOST='localhost',
    )

    assert response.status_code == 200
    statuses = [result['status'] for result in response.json()['results']]
    assert statuses == ['accepted', 'conflict_requires_review', 'conflict_requires_review']
    assert PDVSyncConflict.objects.filter(code__in=['sequence_gap', 'sequence_replay']).count() == 2

    # When a proxy or client corrupts the envelope hash, the batch is rejected atomically.
    event = _event(pdv_device_context, 4)
    response = client.post(
        '/api/v1/pdv/sync-batches/',
        {'events': [event], 'batch_hash': '0' * 64},
        format='json',
        HTTP_HOST='localhost',
    )

    assert response.status_code == 400
    assert response.json()['code'] == 'invalid_batch_hash'
