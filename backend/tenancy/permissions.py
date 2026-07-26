from rest_framework.permissions import BasePermission

from tenancy.models import TenantMembership


class HasActiveTenant(BasePermission):
    message = 'A valid X-Tenant-ID header is required.'

    def has_permission(self, request, view):
        return getattr(request, 'tenant', None) is not None


class HasVerifiedMFA(BasePermission):
    """Multi-factor authentication is required for admin users."""

    def has_permission(self, request, view):
        auth = getattr(request, 'auth', None)
        if auth and hasattr(auth, 'get') and auth.get('device_id'):
            return True
        tenant = getattr(request, 'tenant', None)
        if tenant is None:
            return True
        membership = TenantMembership.objects.filter(
            user=request.user,
            tenant=tenant,
            is_active=True,
        ).first()
        if membership is None:
            self.message = 'HasVerifiedMFA: membership not found.'
            return False
        if membership.role != 'admin':
            return True
        sess_tenant = request.session.get('mfa_tenant_id')
        sess_method = request.session.get('mfa_method')
        tenant_match = str(tenant.id) == sess_tenant
        method_ok = sess_method in {'totp', 'email', 'recovery'}
        if not tenant_match or not method_ok:
            self.message = (
                f'HasVerifiedMFA denied: mfa_tenant_id={sess_tenant} '
                f'(expected={tenant.id}), mfa_method={sess_method}'
            )
            return False
        return True


class HasCapability(BasePermission):
    """Role-based capability gate. Set `required_capability` on the view."""

    def has_permission(self, request, view):
        tenant = getattr(request, 'tenant', None)
        if tenant is None or request.user is None or not request.user.is_authenticated:
            return False
        capability = getattr(view, 'required_capability', None)
        if not capability:
            return True
        membership = TenantMembership.objects.filter(
            user=request.user,
            tenant=tenant,
            is_active=True,
        ).first()
        if membership is None:
            return False
        from tenancy.capabilities import role_allows

        return role_allows(membership.role, capability)
