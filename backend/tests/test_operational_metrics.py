from django.test import TestCase

from config.observability import fiscal_metrics, outbox_metrics, system_metrics
from fiscal.models import FiscalDocument
from outbox.models import OutboxMessage
from tenancy.models import Tenant


class OutboxMetricsTest(TestCase):
    def test_outbox_metrics_empty(self):
        metrics = outbox_metrics()
        self.assertEqual(metrics['total'], 0)
        self.assertEqual(metrics['pending'], 0)
        self.assertEqual(metrics['failed'], 0)
        self.assertIsNone(metrics['oldest_pending_at'])
        self.assertIsNone(metrics['newest_pending_at'])

    def test_outbox_metrics_with_pending(self):
        OutboxMessage.objects.create(
            event_type='test.event',
            aggregate_type='Test',
            aggregate_id='1',
            payload={'key': 'value'},
            status='PENDING',
        )
        OutboxMessage.objects.create(
            event_type='test.event2',
            aggregate_type='Test',
            aggregate_id='2',
            payload={'key': 'value'},
            status='PUBLISHED',
        )
        metrics = outbox_metrics()
        self.assertEqual(metrics['total'], 2)
        self.assertEqual(metrics['pending'], 1)
        self.assertEqual(metrics['published'], 1)
        self.assertIsNotNone(metrics['oldest_pending_at'])

    def test_outbox_metrics_with_failed_and_dead(self):
        OutboxMessage.objects.create(
            event_type='test.fail',
            aggregate_type='Test',
            aggregate_id='3',
            payload={'key': 'value'},
            status='FAILED',
        )
        OutboxMessage.objects.create(
            event_type='test.dead',
            aggregate_type='Test',
            aggregate_id='4',
            payload={'key': 'value'},
            status='DEAD_LETTER',
        )
        metrics = outbox_metrics()
        self.assertEqual(metrics['failed'], 1)
        self.assertEqual(metrics['dead_letter'], 1)

    def test_outbox_metrics_safe_with_no_data(self):
        metrics = outbox_metrics()
        self.assertIsInstance(metrics['total'], int)
        self.assertIsInstance(metrics['pending'], int)


class FiscalMetricsTest(TestCase):
    def test_fiscal_metrics_empty(self):
        metrics = fiscal_metrics()
        self.assertEqual(metrics['total'], 0)
        self.assertEqual(metrics['pending'], 0)
        self.assertEqual(metrics['concluded'], 0)

    def test_fiscal_metrics_safe_with_no_data(self):
        metrics = fiscal_metrics()
        self.assertIsInstance(metrics['total'], int)
        self.assertIsInstance(metrics['failed'], int)

    def test_fiscal_metrics_are_global_without_request_tenant_context(self):
        tenant = Tenant.objects.create(name='Metrics tenant', slug='metrics-tenant')
        FiscalDocument.all_objects.create(
            tenant=tenant,
            status=FiscalDocument.STATUS_PROCESSING,
        )

        metrics = fiscal_metrics()

        self.assertEqual(metrics['total'], 1)
        self.assertEqual(metrics['processing'], 1)


class SystemMetricsTest(TestCase):
    def test_system_metrics_includes_outbox_and_fiscal(self):
        metrics = system_metrics()
        self.assertIn('outbox', metrics)
        self.assertIn('fiscal', metrics)
        self.assertIn('total', metrics['outbox'])
        self.assertIn('concluded', metrics['fiscal'])
