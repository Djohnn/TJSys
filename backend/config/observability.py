from django.db.models import Count, Max, Min, Q

from outbox.models import OutboxMessage


def outbox_metrics():
    agg = OutboxMessage.objects.aggregate(
        total=Count('id'),
        pending=Count('id', filter=Q(status='PENDING')),
        failed=Count('id', filter=Q(status='FAILED')),
        dead=Count('id', filter=Q(status='DEAD_LETTER')),
        published=Count('id', filter=Q(status='PUBLISHED')),
        oldest_pending=Min('created_at', filter=Q(status='PENDING')),
        newest_pending=Max('created_at', filter=Q(status='PENDING')),
    )
    return {
        'total': agg['total'] or 0,
        'pending': agg['pending'] or 0,
        'failed': agg['failed'] or 0,
        'dead_letter': agg['dead'] or 0,
        'published': agg['published'] or 0,
        'oldest_pending_at': agg['oldest_pending'].isoformat() if agg['oldest_pending'] else None,
        'newest_pending_at': agg['newest_pending'].isoformat() if agg['newest_pending'] else None,
    }


def fiscal_metrics():
    from fiscal.models import FiscalDocument

    # System monitoring is intentionally cross-tenant and returns only counts.
    # The tenant-scoped manager returns an empty queryset outside request context.
    agg = FiscalDocument.all_objects.aggregate(
        total=Count('id'),
        pending=Count('id', filter=Q(status='PENDING')),
        processing=Count('id', filter=Q(status='PROCESSING')),
        concluded=Count('id', filter=Q(status='CONCLUDED')),
        rejected=Count('id', filter=Q(status='REJECTED')),
        cancelled=Count('id', filter=Q(status='CANCELLED')),
        failed=Count('id', filter=Q(status='FAILED')),
    )
    return {
        'total': agg['total'] or 0,
        'pending': agg['pending'] or 0,
        'processing': agg['processing'] or 0,
        'concluded': agg['concluded'] or 0,
        'rejected': agg['rejected'] or 0,
        'cancelled': agg['cancelled'] or 0,
        'failed': agg['failed'] or 0,
    }


def system_metrics():
    return {
        'outbox': outbox_metrics(),
        'fiscal': fiscal_metrics(),
    }
