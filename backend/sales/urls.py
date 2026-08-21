from django.urls import include, path
from rest_framework.routers import DefaultRouter

from sales.views import (
    CashSessionViewSet,
    QuoteViewSet,
    SalesOrderViewSet,
    SaleViewSet,
    SyncBatchView,
)

router = DefaultRouter()
router.register('cash-sessions', CashSessionViewSet, basename='cashsession')
router.register('sales', SaleViewSet, basename='sale')
router.register('quotes', QuoteViewSet, basename='quote')
router.register('sales-orders', SalesOrderViewSet, basename='sales-order')

urlpatterns = [
    path('', include(router.urls)),
    path('sync/batch/', SyncBatchView.as_view(), name='sync-batch'),
]
