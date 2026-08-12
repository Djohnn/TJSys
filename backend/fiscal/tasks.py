import logging

from celery import shared_task
from django.utils import timezone

from fiscal.models import FiscalDocument
from fiscal.services import POLLING_INTERVAL, emit_document, poll_fiscal_document

logger = logging.getLogger(__name__)

BEAT_SCHEDULE = {
    'poll-fiscal-documents': {
        'task': 'fiscal.tasks.poll_fiscal_documents',
        'schedule': 30.0,
    },
}


# NFC-e emission is now triggered on demand via the request-fiscal API endpoint.
# The outbox-triggered handler below is kept for reference but disabled.
# @register_handler('sales.sale.confirmed')
# def handle_sale_confirmed_outbox(message):
#     sale_id = message.payload.get('sale_id') or message.aggregate_id
#     handle_sale_completed.delay(str(sale_id))
#     return {'sale_id': str(sale_id), 'task': 'fiscal.tasks.handle_sale_completed'}


@shared_task(max_retries=3, default_retry_delay=60)
def handle_sale_completed(sale_id):
    from sales.models import Sale

    try:
        sale = Sale.all_objects.select_related('branch', 'tenant').get(id=sale_id)
    except Sale.DoesNotExist:
        logger.warning('Sale not found for fiscal emission: %s', sale_id)
        return None

    # Find the QUEUED document for this sale
    doc = FiscalDocument.all_objects.filter(
        sale=sale,
        status=FiscalDocument.STATUS_QUEUED,
        is_active=True,
    ).first()

    if doc is None:
        logger.info('No QUEUED fiscal document found for sale: %s', sale_id)
        return None

    # Process the queued document itself; emit_nfce would return it unchanged.
    doc = emit_document(doc)
    return {'document_id': str(doc.id), 'status': doc.status}


@shared_task
def poll_fiscal_documents():
    cutoff = timezone.now() - POLLING_INTERVAL
    docs = FiscalDocument.all_objects.filter(
        status=FiscalDocument.STATUS_PROCESSING,
    ).filter(
        last_polled_at__isnull=True,
    ) | FiscalDocument.all_objects.filter(
        status=FiscalDocument.STATUS_PROCESSING,
        last_polled_at__lt=cutoff,
    )
    count = 0
    for doc in docs.select_related('sale__branch', 'tenant'):
        poll_fiscal_document(doc)
        count += 1
    return {'processed': count}
