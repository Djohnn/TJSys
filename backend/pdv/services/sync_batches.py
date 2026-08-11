import hashlib
import json

from django.db import transaction
from django.utils import timezone

from pdv.models import PDVSyncBatch, PDVSyncConflict, PDVSyncEvent


def canonical_json(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), default=str)


def sha256_payload(value):
    return hashlib.sha256(canonical_json(value).encode('utf-8')).hexdigest()


def _conflict(event, code, detail, context=None):
    event.status = 'conflict_requires_review'
    event.error_code = code
    event.error_detail = detail
    event.result = {}
    event.save(update_fields=['status', 'error_code', 'error_detail', 'result'])
    PDVSyncConflict.objects.update_or_create(
        event=event,
        defaults={'code': code, 'detail': detail, 'context': context or {}},
    )


def _device_sequence(device, sequence, *, exclude_id=None):
    query = PDVSyncEvent.objects.filter(device=device)
    if exclude_id:
        query = query.exclude(pk=exclude_id)
    last = query.order_by('-local_sequence').first()
    expected = (last.local_sequence + 1) if last else 1
    if sequence > expected:
        return False, 'sequence_gap', f'Expected local_sequence {expected}, received {sequence}'
    if sequence < expected:
        return False, 'sequence_replay', f'Expected local_sequence {expected}, received {sequence}'
    return True, '', ''


@transaction.atomic
def ingest_batch(*, tenant, device, events, batch_hash=None):
    computed_batch_hash = sha256_payload(events)
    if batch_hash and batch_hash != computed_batch_hash:
        raise ValueError('batch_hash does not match canonical event envelope')
    existing_batch = PDVSyncBatch.objects.filter(
        tenant=tenant, device=device, batch_hash=computed_batch_hash
    ).first()
    if existing_batch:
        return existing_batch, list(existing_batch.events.order_by('local_sequence'))

    batch = PDVSyncBatch.objects.create(
        tenant=tenant,
        device=device,
        batch_hash=computed_batch_hash,
        metadata={'count': len(events)},
    )
    results = []
    for raw in events:
        event_id = raw['event_id']
        existing = PDVSyncEvent.objects.filter(device=device, event_id=event_id).first()
        if existing:
            if existing.payload_hash != raw['payload_hash']:
                _conflict(existing, 'event_payload_hash_mismatch', 'Event replay has a different payload hash.')
            results.append(existing)
            continue

        existing_key = PDVSyncEvent.objects.filter(
            tenant=tenant,
            device=device,
            idempotency_key=raw['idempotency_key'],
        ).first()
        if existing_key:
            _conflict(
                existing_key,
                'idempotency_payload_mismatch',
                'Idempotency key is already bound to another event.',
                {'incoming_event_id': str(event_id)},
            )
            results.append(existing_key)
            continue

        event = PDVSyncEvent.objects.create(
            batch=batch,
            tenant=tenant,
            device=device,
            event_id=event_id,
            local_sequence=raw['local_sequence'],
            event_type=raw['event_type'],
            event_version=raw['event_version'],
            idempotency_key=raw['idempotency_key'],
            occurred_at=raw['occurred_at'],
            payload=raw['payload'],
            payload_hash=raw['payload_hash'],
            status='accepted',
            result={'accepted_at': timezone.now().isoformat(), 'effects_applied': False},
        )
        if raw['tenant_id'] != tenant.id or raw['device_id'] != device.device_id:
            _conflict(event, 'identity_mismatch', 'Event identity does not match authenticated tenant/device.')
        elif sha256_payload(raw['payload']) != raw['payload_hash']:
            _conflict(event, 'payload_hash_mismatch', 'Payload hash does not match canonical payload.')
        else:
            valid, code, detail = _device_sequence(
                device,
                raw['local_sequence'],
                exclude_id=event.pk,
            )
            if not valid:
                _conflict(event, code, detail)
        results.append(event)
    return batch, results
