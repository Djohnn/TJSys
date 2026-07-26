import logging

from celery import shared_task
from django.utils import timezone

from purchasing.models import RecurringPurchaseOrderTemplate
from purchasing.services import advance_recurring_template_schedule, generate_po_from_template

logger = logging.getLogger(__name__)

BEAT_SCHEDULE = {
    'process-recurring-purchase-orders': {
        'task': 'purchasing.tasks.process_recurring_purchase_orders',
        'schedule': 3600.0,
    },
}


@shared_task
def process_recurring_purchase_orders():
    today = timezone.now().date()
    templates = RecurringPurchaseOrderTemplate.all_objects.filter(
        is_active=True,
        next_run__lte=today,
    ).select_related('tenant')

    created = 0
    for template in templates:
        try:
            tenant = template.tenant
            po = generate_po_from_template(
                template,
                tenant,
                idempotency_key_prefix=f'recurring-{template.id}-{today.isoformat()}',
            )
            advance_recurring_template_schedule(template)
            created += 1
            logger.info(
                'Generated PO %s from recurring template %s for tenant %s',
                po.id,
                template.id,
                tenant.id,
            )
        except Exception:
            logger.exception(
                'Failed to generate PO from template %s for tenant %s',
                template.id,
                template.tenant_id,
            )

    return {'created': created, 'total_processed': len(templates)}
