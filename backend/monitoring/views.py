import logging
from datetime import datetime, timezone
from urllib.parse import urlparse

from django.conf import settings
from django.db import connection
from django.http import JsonResponse
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import csrf_exempt

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from config.observability import system_metrics
from monitoring.middleware import get_error_metrics, get_request_metrics, reset_metrics
from tenancy.permissions import HasActiveTenant, HasCapability

logger = logging.getLogger(__name__)


@method_decorator(csrf_exempt, name='dispatch')
class HealthCheckView(View):
    """Health check endpoint for load balancers."""

    def get(self, request):
        db_ok = False
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT 1')
            db_ok = True
        except Exception:
            logger.warning('Health check database probe failed', exc_info=True)

        redis_ok = False
        try:
            cache_settings = settings.CACHES.get('default', {})
            location = cache_settings.get('LOCATION', '')
            if location and 'LocMem' not in cache_settings.get('BACKEND', ''):
                from redis import Redis
                parsed = urlparse(location)
                redis = Redis(
                    host=parsed.hostname,
                    port=parsed.port,
                    db=0,
                    socket_connect_timeout=2,
                )
                redis_ok = redis.ping()
            else:
                redis_ok = True
        except Exception:
            logger.warning('Health check cache probe failed', exc_info=True)

        overall = db_ok and redis_ok
        status_code = 200 if overall else 503

        return JsonResponse(
            {
                'status': 'healthy' if overall else 'unhealthy',
                'timestamp': datetime.utcnow().isoformat() + 'Z',
                'checks': {
                    'database': 'ok' if db_ok else 'down',
                    'cache': 'ok' if redis_ok else 'down',
                },
            },
            status=status_code,
        )


@method_decorator(csrf_exempt, name='dispatch')
class ReadinessView(View):
    """Readiness probe — checks DB, cache, and outbox backlog."""

    def _check_db(self):
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT 1')
            return True
        except Exception:
            return False

    def _check_redis(self):
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

    def get(self, request):
        db_ok = self._check_db()
        redis_ok = self._check_redis()
        services_ok = db_ok and redis_ok

        if not services_ok:
            return JsonResponse(
                {
                    'status': 'not_ready',
                    'reason': 'database unavailable' if not db_ok
                              else 'cache unavailable',
                },
                status=503,
            )

        sm = system_metrics()
        backlog_ok = sm['outbox']['pending'] < 100
        if not backlog_ok:
            return JsonResponse(
                {
                    'status': 'degraded',
                    'reason': 'outbox backlog too large',
                    'outbox': sm['outbox'],
                },
                status=503,
            )

        return JsonResponse({
            'status': 'ready',
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'services': {
                'database': 'ok' if db_ok else 'down',
                'cache': 'ok' if redis_ok else 'down',
            },
            'outbox': {
                'total_pending': sm['outbox']['pending'],
                'oldest_pending': sm['outbox']['oldest_pending_at'],
                'failed_count': sm['outbox']['failed'],
                'status': 'ok',
            },
        })


@method_decorator(csrf_exempt, name='dispatch')
class MetricsView(View):
    """Expose application metrics for monitoring."""

    def get(self, request):
        # Check if monitoring is enabled
        if not getattr(settings, 'MONITORING_ENABLED', True):
            return JsonResponse({'error': 'Monitoring disabled'}, status=403)

        metrics = get_request_metrics()
        errors = get_error_metrics()

        # Also check database and cache health
        db_ok = False
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT 1')
            db_ok = True
        except Exception:
            logger.warning('Metrics database probe failed', exc_info=True)

        # Check Redis
        redis_ok = False
        try:
            cache_settings = settings.CACHES.get('default', {})
            location = cache_settings.get('LOCATION', '')
            if location and 'LocMem' not in cache_settings.get('BACKEND', ''):
                from urllib.parse import urlparse

                from redis import Redis
                parsed = urlparse(location)
                redis = Redis(
                    host=parsed.hostname,
                    port=parsed.port,
                    db=0,
                    socket_connect_timeout=2,
                )
                redis_ok = redis.ping()
            else:
                redis_ok = True
        except Exception:
            logger.warning('Metrics cache probe failed', exc_info=True)

        return JsonResponse({
            'database': 'ok' if db_ok else 'down',
            'cache': 'ok' if redis_ok else 'down',
            'request_metrics': metrics,
            'error_metrics': errors,
            'system_metrics': system_metrics(),
        })


@method_decorator(csrf_exempt, name='dispatch')
class MetricsResetView(View):
    """Reset metrics (for testing)."""

    def post(self, request):
        reset_metrics()
        return JsonResponse({'status': 'reset'})


# Sprint 20 — authorized operations aggregate

class OperationsView(APIView):
    """Authorized monitoring aggregate for web dashboards."""

    permission_classes = [IsAuthenticated, HasActiveTenant, HasCapability]
    required_capability = 'monitoring.view'

    def get(self, request):
        db_ok = False
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT 1')
            db_ok = True
        except Exception:
            pass

        redis_ok = False
        try:
            cache_settings = settings.CACHES.get('default', {})
            location = cache_settings.get('LOCATION', '')
            if not location or 'LocMem' in cache_settings.get('BACKEND', ''):
                redis_ok = True
            elif location.startswith('redis://'):
                from redis import Redis
                from urllib.parse import urlparse
                parsed = urlparse(location)
                r = Redis(host=parsed.hostname, port=parsed.port or 6379, socket_connect_timeout=2)
                redis_ok = r.ping()
            else:
                redis_ok = True
        except Exception:
            pass

        return Response({
            'health': {
                'status': 'healthy' if (db_ok and redis_ok) else 'unhealthy',
                'checks': {
                    'database': 'ok' if db_ok else 'down',
                    'cache': 'ok' if redis_ok else 'down',
                },
                'timestamp': datetime.now(tz=timezone.utc).isoformat(),
            },
            'readiness': {
                'status': 'ready' if db_ok else 'not_ready',
                'services': {
                    'database': 'ok' if db_ok else 'down',
                    'cache': 'ok' if redis_ok else 'down',
                },
            },
            'system_metrics': system_metrics(),
            'runbook_links': [
                {'id': 'db-down', 'label': 'Database outage', 'url': 'https://docs.zyrp.local/runbooks/db-down'},
                {'id': 'cache-down', 'label': 'Cache outage', 'url': 'https://docs.zyrp.local/runbooks/cache-down'},
                {'id': 'fiscal-rejected', 'label': 'Fiscal rejection guidance', 'url': 'https://docs.zyrp.local/runbooks/fiscal-rejected'},
                {'id': 'outbox-backlog', 'label': 'Outbox backlog guidance', 'url': 'https://docs.zyrp.local/runbooks/outbox-backlog'},
            ],
        })
