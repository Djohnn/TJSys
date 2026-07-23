from django.urls import include, path
from rest_framework.routers import DefaultRouter

from inventory.views import (
    StockBalanceViewSet,
    StockLocationViewSet,
    StockLotViewSet,
    StockMovementViewSet,
    StockOperationReversalViewSet,
    StockOperationViewSet,
)

router = DefaultRouter()
router.register('stock-locations', StockLocationViewSet, basename='stocklocation')
router.register('lots', StockLotViewSet, basename='lot')
router.register('stock-operations', StockOperationViewSet, basename='stockoperation')
router.register('movements', StockMovementViewSet, basename='movement')
router.register('balances', StockBalanceViewSet, basename='balance')
router.register(
    'stock-operation-reversals',
    StockOperationReversalViewSet,
    basename='stockoperationreversal',
)

urlpatterns = [
    path('', include(router.urls)),
]
