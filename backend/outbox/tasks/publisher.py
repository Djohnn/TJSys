import logging
from datetime import timedelta

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from outbox.handlers import get_handler
from outbox.models import OutboxDelivery, OutboxMessage

logger = logging.getLogger(__name__)


@shared_task
def report_unhealthy_outbox(max_age_minutes=5):
    cutoff = timezone.now() - timedelta(minutes=max_age_minutes)
    stale_count = OutboxMessage.objects.filter(
        status__in={'PENDING', 'FAILED'},
        created_at__lt=cutoff,
    ).count()
    dead_letter_count = OutboxMessage.objects.filter(status='DEAD_LETTER').count()
    if stale_count or dead_letter_count:
        logger.warning(
            'Unhealthy outbox detected: stale=%s dead_letter=%s',
            stale_count,
            dead_letter_count,
        )
    return {'stale': stale_count, 'dead_letter': dead_letter_count}


@shared_task(bind=True, max_retries=3)
def process_outbox(self, message_id):
    logger.info('Processing outbox message %s', message_id)
    try:
        with transaction.atomic():
            try:
                message = OutboxMessage.objects.select_for_update().get(id=message_id)
            except OutboxMessage.DoesNotExist:
                logger.warning('Message %s not found', message_id)
                return

            if message.status == 'PUBLISHED':
                return
            if message.status not in {'PENDING', 'FAILED'}:
                logger.warning('Message %s cannot be processed from %s', message_id, message.status)
                return

            handler = get_handler(message.event_type)
            if handler is None:
                raise LookupError(f'No outbox handler for {message.event_type}')

            delivery, created = OutboxDelivery.objects.get_or_create(
                message=message,
                handler=handler.__name__,
                defaults={'result': handler(message) or {}},
            )
            if not created:
                logger.info('Delivery %s already exists', delivery.id)

            message.status = 'PUBLISHED'
            message.published_at = timezone.now()
            message.last_error = ''
            message.save(update_fields=['status', 'published_at', 'last_error'])
            logger.info('Message %s published successfully', message_id)
    except Exception as exc:
        _record_failure(message_id, exc)
        raise self.retry(exc=exc, countdown=60) from exc


def _record_failure(message_id, exc):
    with transaction.atomic():
        try:
            message = OutboxMessage.objects.select_for_update().get(id=message_id)
        except OutboxMessage.DoesNotExist:
            return
        message.retry_count += 1
        message.last_error = str(exc)[:2000]
        message.status = 'DEAD_LETTER' if message.retry_count >= 3 else 'FAILED'
        message.save(update_fields=['retry_count', 'last_error', 'status'])
