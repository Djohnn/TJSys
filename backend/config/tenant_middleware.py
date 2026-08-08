import logging
import uuid

from django.db import connection, transaction
from django.http import JsonResponse

from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import TenantMembership

logger = logging.getLogger(__name__)


class TenantMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def _try_jwt_auth(self, request):
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            from tenancy.authentication import DeviceJWTAuthentication

            try:
                result = DeviceJWTAuthentication().authenticate(request)
                if result:
                    request.user, request.auth = result
            except Exception as exc:
                logger.warning('Device JWT authentication failed: %s', exc)

    def __call__(self, request):
        if request.path.startswith('/api/v1/fiscal/webhook/'):
            return self.get_response(request)

        tenant = None
        tenant_header = request.headers.get('X-Tenant-ID')

        if tenant_header:
            try:
                tenant_id = uuid.UUID(tenant_header)
            except (TypeError, ValueError, AttributeError):
                return self._problem(400, 'invalid_tenant', 'X-Tenant-ID must be a UUID.')

            if not request.user.is_authenticated:
                self._try_jwt_auth(request)

            if not request.user.is_authenticated:
                return self._problem(401, 'authentication_required', 'Authentication is required.')

            membership = (
                TenantMembership.objects.filter(
                    user=request.user,
                    tenant_id=tenant_id,
                    tenant__is_active=True,
                    is_active=True,
                )
                .select_related('tenant')
                .first()
            )
            if membership is None:
                return self._problem(404, 'tenant_not_found', 'Tenant was not found.')
            tenant = membership.tenant

        request.tenant = tenant
        token = set_current_tenant_id(tenant.id if tenant else None)
        try:
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(
                        "SELECT set_config('app.current_tenant_id', %s, true)",
                        [str(tenant.id) if tenant else ''],
                    )
                return self.get_response(request)
        finally:
            reset_current_tenant_id(token)

    @staticmethod
    def _problem(status, code, detail):
        return JsonResponse(
            {
                'type': f'https://docs.tjsys.local/errors/{code}',
                'title': code.replace('_', ' ').title(),
                'status': status,
                'detail': detail,
                'code': code,
            },
            status=status,
            content_type='application/problem+json',
        )
