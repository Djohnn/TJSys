from django.urls import include, path
from rest_framework.routers import DefaultRouter

from inventory.views import ReplenishmentOrderViewSet, ReplenishmentRuleViewSet

router = DefaultRouter()
router.register('replenishment-rules', ReplenishmentRuleViewSet, basename='replenishment-rule')
router.register('replenishment-orders', ReplenishmentOrderViewSet, basename='replenishment-order')

urlpatterns = [
    path('', include(router.urls)),
]
