from rest_framework.permissions import BasePermission

from tenancy.capabilities import role_allows
from tenancy.models import TenantMembership

_READ_ACTIONS = {'list', 'retrieve'}


class CatalogCapabilityPermission(BasePermission):
    manage_capability = 'catalog.manage'
    view_capability = 'catalog.view'

    def has_permission(self, request, view):
        tenant = getattr(request, 'tenant', None)
        if tenant is None:
            self.message = 'X-Tenant-ID header is required or tenant not found.'
            return False
        membership = TenantMembership.objects.filter(
            user=request.user,
            tenant=tenant,
            is_active=True,
        ).first()
        if membership is None:
            self.message = f'No active membership for user={request.user.id} tenant={tenant.id}.'
            return False
        action = getattr(view, 'action', '')
        if action in _READ_ACTIONS:
            allowed = role_allows(membership.role, self.view_capability)
        else:
            allowed = role_allows(membership.role, self.manage_capability)
        if not allowed:
            required_capability = (
                self.view_capability if action in _READ_ACTIONS else self.manage_capability
            )
            self.message = f'Role {membership.role} lacks {required_capability} (action={action}).'
        return allowed


class PricingCapabilityPermission(CatalogCapabilityPermission):
    manage_capability = 'pricing.manage'
    view_capability = 'pricing.view'
