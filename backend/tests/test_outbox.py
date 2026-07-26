from datetime import timedelta

import pytest
from django.db import transaction
from django.utils import timezone

from outbox.handlers import register_handler
from outbox.models import OutboxDelivery, OutboxMessage
from outbox.services import create_outbox_message
from outbox.tasks.publisher import process_outbox, report_unhealthy_outbox


@pytest.mark.django_db(transaction=True)
class TestOutboxAtomicity:
    def test_outbox_created_in_same_transaction(self):
        """Outbox message é criado dentro da transação."""
        msg = create_outbox_message(
            event_type='test.event',
            aggregate_type='Test',
            aggregate_id='123',
            payload={'key': 'value'},
        )
        assert OutboxMessage.objects.filter(id=msg.id, status='PENDING').exists()

    def test_outbox_rolls_back_with_domain_change(self):
        """Rollback da transação remove a outbox message também."""
        with transaction.atomic():
            msg = create_outbox_message(
                event_type='rollback.test',
                aggregate_type='Test',
                aggregate_id='456',
                payload={'will': 'rollback'},
            )
            msg_id = msg.id
            transaction.set_rollback(True)

        assert not OutboxMessage.objects.filter(id=msg_id).exists()

    def test_outbox_count_after_rollback(self):
        """Contagem de outbox não inclui mensagens de transações revertidas."""
        initial = OutboxMessage.objects.count()
        try:
            with transaction.atomic():
                create_outbox_message(
                    event_type='rollback.test',
                    aggregate_type='Test',
                    aggregate_id='789',
                    payload={'data': 'lost'},
                )
                raise RuntimeError('forcing rollback')
        except RuntimeError:
            pass

        assert OutboxMessage.objects.count() == initial


@pytest.mark.django_db(transaction=True)
class TestOutboxIdempotency:
    def test_process_same_message_twice_does_not_duplicate(self):
        """Reprocessamento da mesma mensagem não duplica o efeito."""

        @register_handler('idempotent.test')
        def persist_test_effect(message):
            return {'processed_aggregate': message.aggregate_id}

        msg = create_outbox_message(
            event_type='idempotent.test',
            aggregate_type='Test',
            aggregate_id='101',
            payload={'n': 1},
        )

        process_outbox(msg.id)

        msg.refresh_from_db()
        assert msg.status == 'PUBLISHED'
        assert msg.retry_count == 0
        delivery = OutboxDelivery.objects.get(message=msg)
        assert delivery.handler == 'persist_test_effect'
        assert delivery.result == {'processed_aggregate': '101'}

        process_outbox(msg.id)

        msg.refresh_from_db()
        assert msg.status == 'PUBLISHED'
        assert msg.retry_count == 0
        assert OutboxDelivery.objects.filter(message=msg).count() == 1

    def test_stale_message_is_reported_without_payload(self, caplog):
        msg = create_outbox_message(
            event_type='stale.test',
            aggregate_type='Test',
            aggregate_id='202',
            payload={'secret': 'must-not-appear'},
        )
        OutboxMessage.objects.filter(id=msg.id).update(
            created_at=timezone.now() - timedelta(minutes=10),
        )

        result = report_unhealthy_outbox(max_age_minutes=5)

        assert result == {'stale': 1, 'dead_letter': 0}
        assert 'Unhealthy outbox detected' in caplog.text
        assert 'must-not-appear' not in caplog.text


@pytest.mark.django_db(transaction=True)
class TestAuditBasic:
    def test_audit_record_created(self):
        from audit.models import AuditRecord

        record = AuditRecord.objects.create(
            action='test.action',
            resource_type='Test',
            resource_id='1',
            detail={'test': True},
        )
        assert AuditRecord.objects.filter(id=record.id).exists()
        assert str(record) == 'test.action Test by None'
