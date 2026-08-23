from django.urls import include, path
from rest_framework.routers import DefaultRouter

from platform_admin.views import (
    FeatureFlagViewSet,
    PlanViewSet,
    PlatformAdminAuditViewSet,
    SubscriptionViewSet,
    SupportAccessViewSet,
    TenantCapabilitiesView,
    TenantEntitlementViewSet,
)

router = DefaultRouter()
router.register('plans', PlanViewSet, basename='plan')
router.register('subscriptions', SubscriptionViewSet, basename='subscription')
router.register('entitlements', TenantEntitlementViewSet, basename='entitlement')
router.register('feature-flags', FeatureFlagViewSet, basename='featureflag')
router.register('support-access', SupportAccessViewSet, basename='supportaccess')
router.register('audit', PlatformAdminAuditViewSet, basename='platformaudit')

app_name = 'platform_admin'

urlpatterns = [
    path('platform/', include(router.urls)),
    path(
        'platform/tenant-capabilities/',
        TenantCapabilitiesView.as_view(
            {'get': 'list'},
        ),
        name='tenant-capabilities',
    ),
]
