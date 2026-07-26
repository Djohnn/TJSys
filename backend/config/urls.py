from django.conf import settings
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.permissions import BasePermission

from .views import health, readiness


class _SchemaAccessPermission(BasePermission):
    """Allow unauthenticated access in DEBUG; require auth otherwise."""

    def has_permission(self, request, view):
        if settings.DEBUG:
            return True
        return request.user.is_authenticated


urlpatterns = [
    path(
        'api/v1/schema/',
        SpectacularAPIView.as_view(
            api_version='1.0.0',
            permission_classes=[_SchemaAccessPermission],
        ),
        name='schema',
    ),
    path(
        'api/v1/docs/',
        SpectacularSwaggerView.as_view(
            url_name='schema',
            permission_classes=[_SchemaAccessPermission],
        ),
        name='docs',
    ),
    path('health/', health, name='health'),
    path('readiness/', readiness, name='readiness'),
    path('api/v1/health/', health, name='api-health'),
    path('api/v1/monitoring/', include('monitoring.urls')),
    path('api/v1/readiness/', readiness, name='api-readiness'),
    path('api/v1/', include('accounts.urls')),
    path('api/v1/', include('tenancy.urls')),
    path('api/v1/', include('catalog.urls')),
    path('api/v1/', include('inventory.urls')),
    path('api/v1/', include('purchasing.urls')),
    path('api/v1/', include('financial.urls')),
    path('api/v1/', include('sales.urls')),
    path('api/v1/', include('fiscal.urls')),
    path('api/v1/', include('people.urls')),
    path('api/v1/', include('payments.urls')),
    path('api/v1/', include('platform_admin.urls')),
    # Module-prefixed mounts for frontend compatibility
    path('api/v1/catalog/', include('catalog.urls')),
    path('api/v1/inventory/', include('inventory.urls')),
    path('api/v1/purchasing/', include('purchasing.urls')),
    path('api/v1/financial/', include('financial.urls')),
    path('api/v1/sales/', include('sales.urls')),
    path('api/v1/people/', include('people.urls')),
    path('admin/', admin.site.urls),
]
