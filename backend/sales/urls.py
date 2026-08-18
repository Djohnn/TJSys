from django.urls import include, path
from rest_framework.routers import DefaultRouter

from sales.views import CashSessionViewSet, CommissionRuleViewSet, CommissionViewSet, SaleViewSet, SyncBatchView

router = DefaultRouter()
router.register('cash-sessions', CashSessionViewSet, basename='cashsession')
router.register('sales', SaleViewSet, basename='sale')
router.register('commission-rules', CommissionRuleViewSet, basename='commission-rule')
router.register('commissions', CommissionViewSet, basename='commission')

urlpatterns = [
    path('', include(router.urls)),
    path('sync/batch/', SyncBatchView.as_view(), name='sync-batch'),
]
