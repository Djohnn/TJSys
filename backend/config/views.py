from urllib.parse import urlparse

from django.conf import settings
from django.db import connection
from django.http import JsonResponse


def _check_redis():
    try:
        cache_settings = settings.CACHES.get('default', {})
        location = cache_settings.get('LOCATION', '')
        if not location or 'LocMem' in cache_settings.get('BACKEND', ''):
            return True

        from redis import Redis

        parsed = urlparse(location)
        redis = Redis(
            host=parsed.hostname,
            port=parsed.port,
            db=0,
            socket_connect_timeout=2,
        )
        return redis.ping()
    except Exception:
        return False


def health(request):
    db_ok = False

    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
            db_ok = True
    except Exception:
        db_ok = False

    redis_ok = _check_redis()
    status = 200 if (db_ok and redis_ok) else 503
    return JsonResponse(
        {
            'status': 'healthy' if status == 200 else 'degraded',
            'services': {
                'database': 'ok' if db_ok else 'down',
                'cache': 'ok' if redis_ok else 'down',
            },
        },
        status=status,
    )


def readiness(request):
    from outbox.models import OutboxMessage

    db_ok = False
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
            db_ok = True
    except Exception:
        db_ok = False

    redis_ok = _check_redis()
    total_pending = OutboxMessage.objects.filter(status='PENDING').count()
    oldest_pending = (
        OutboxMessage.objects.filter(status='PENDING')
        .order_by('created_at')
        .values('created_at')
        .first()
    )
    failed_count = OutboxMessage.objects.filter(status='FAILED').count()

    services_ok = db_ok and redis_ok
    backlog_ok = total_pending < 100
    status = 200 if (services_ok and backlog_ok) else 503
    return JsonResponse(
        {
            'status': 'ready' if status == 200 else 'degraded',
            'services': {
                'database': 'ok' if db_ok else 'down',
                'cache': 'ok' if redis_ok else 'down',
            },
            'outbox': {
                'total_pending': total_pending,
                'oldest_pending': oldest_pending['created_at'].isoformat()
                if oldest_pending
                else None,
                'failed_count': failed_count,
                'status': 'ok' if backlog_ok else 'backlog_too_large',
            },
        },
        status=status,
    )


def csrf_failure(request, reason=''):
    return JsonResponse(
        {
            'type': 'about:blank',
            'title': 'CSRF validation failed',
            'status': 403,
            'detail': 'A valid CSRF token is required.',
        },
        status=403,
        content_type='application/problem+json',
    )
