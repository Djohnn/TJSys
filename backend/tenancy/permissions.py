from rest_framework.permissions import BasePermission

from tenancy.models import TenantMembership


class HasActiveTenant(BasePermission):
    message = 'A valid X-Tenant-ID header is required.'

    def has_permission(self, request, view):
        return getattr(request, 'tenant', None) is not None


class HasVerifiedMFA(BasePermission):
    message = 'Multi-factor authentication is required.'

    def has_permission(self, request, view):
        auth = getattr(request, 'auth', None)
        if auth and hasattr(auth, 'get') and auth.get('device_id'):
            return True
        tenant = getattr(request, 'tenant', None)
        if tenant is None:
            return True
        membership = TenantMembership.objects.filter(
            user=request.user, tenant=tenant, is_active=True,
        ).first()
        if membership is None:
            return False
        if membership.role != 'admin':
            return True
        return (
            request.session.get('mfa_tenant_id') == str(tenant.id)
            and request.session.get('mfa_method') in {'totp', 'email', 'recovery'}
        )


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
            user=request.user, tenant=tenant, is_active=True,
        ).first()
        if membership is None:
            return False
        from tenancy.capabilities import role_allows
        return role_allows(membership.role, capability)

