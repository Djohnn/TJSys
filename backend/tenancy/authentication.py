import logging
import uuid

from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed

from tenancy.models import Device, TenantMembership

logger = logging.getLogger(__name__)


class DeviceJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        result = super().authenticate(request)
        if result is None:
            return None

        _, validated_token = result
        tenant_header = request.headers.get('X-Tenant-ID')
        if tenant_header:
            try:
                requested_tenant_id = uuid.UUID(tenant_header)
                token_tenant_id = uuid.UUID(str(validated_token.get('tenant_id')))
            except (ValueError, TypeError, AttributeError) as exc:
                raise AuthenticationFailed('Invalid tenant scope') from exc
            if requested_tenant_id != token_tenant_id:
                raise AuthenticationFailed('Device token cannot switch tenant')

        return result

    def get_user(self, validated_token):
        raw = validated_token.get('device_id')
        if not raw:
            logger.warning('JWT missing device_id claim')
            raise AuthenticationFailed('No device_id in token')

        try:
            device_id = uuid.UUID(raw)
        except (ValueError, TypeError) as exc:
            logger.warning('Invalid device_id in JWT: %s', raw)
            raise AuthenticationFailed('Invalid device_id format') from exc

        try:
            device = Device.all_objects.select_related('registered_by', 'tenant').get(
                id=device_id
            )
        except Device.DoesNotExist as exc:
            logger.warning('Device not found: %s', device_id)
            raise AuthenticationFailed('Device not found') from exc

        if device.status != 'active' or not device.tenant.is_active:
            raise AuthenticationFailed('Device or tenant is inactive')

        try:
            tenant_id = uuid.UUID(str(validated_token.get('tenant_id')))
        except (ValueError, TypeError, AttributeError) as exc:
            raise AuthenticationFailed('Invalid tenant scope') from exc
        if tenant_id != device.tenant_id:
            raise AuthenticationFailed('Device token tenant does not match device')

        branch_claim = validated_token.get('branch_id')
        if device.branch_id is None:
            if branch_claim not in {None, ''}:
                raise AuthenticationFailed('Device token branch does not match device')
        else:
            try:
                branch_id = uuid.UUID(str(branch_claim))
            except (ValueError, TypeError, AttributeError) as exc:
                raise AuthenticationFailed('Invalid branch scope') from exc
            if branch_id != device.branch_id:
                raise AuthenticationFailed('Device token branch does not match device')

        logger.info('Device found: %s (registered_by=%s)', device.id, device.registered_by)

        if device.registered_by and device.registered_by.is_active:
            return device.registered_by

        membership = (
            TenantMembership.objects.filter(
                tenant=device.tenant,
                is_active=True,
                user__is_active=True,
            )
            .select_related('user')
            .first()
        )
        if membership:
            return membership.user

        raise AuthenticationFailed('Device has no registered user and no active members found')
