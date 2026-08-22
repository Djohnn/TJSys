from django.urls import include, path
from rest_framework.routers import DefaultRouter

from inventory.views import (
    InventoryCountItemViewSet,
    InventoryCountViewSet,
    MovementReasonViewSet,
    ProductStockControlDeactivateView,
    ProductStockControlReactivateView,
    ProductStockPolicyViewSet,
    ProductStockSummaryView,
    ReplenishmentOrderViewSet,
    ReplenishmentRuleViewSet,
    StockBalanceViewSet,
    StockLocationViewSet,
    StockLotViewSet,
    StockMovementViewSet,
    StockOperationReversalViewSet,
    StockOperationViewSet,
    StorageTypeViewSet,
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
router.register(
    'product-policies',
    ProductStockPolicyViewSet,
    basename='productstockpolicy',
)
router.register('storage-types', StorageTypeViewSet, basename='storage-type')
router.register('movement-reasons', MovementReasonViewSet, basename='movement-reason')
router.register('replenishment-rules', ReplenishmentRuleViewSet, basename='replenishment-rule')
router.register('replenishment-orders', ReplenishmentOrderViewSet, basename='replenishment-order')
router.register('inventory-counts', InventoryCountViewSet, basename='inventory-count')
router.register('inventory-count-items', InventoryCountItemViewSet, basename='inventory-count-item')

urlpatterns = [
    path('', include(router.urls)),
    path(
        'product-summary/<uuid:product_id>/',
        ProductStockSummaryView.as_view(),
        name='product-stock-summary',
    ),
    path(
        'products/<uuid:product_id>/stock-control/deactivate/',
        ProductStockControlDeactivateView.as_view(),
        name='product-stock-control-deactivate',
    ),
    path(
        'products/<uuid:product_id>/stock-control/reactivate/',
        ProductStockControlReactivateView.as_view(),
        name='product-stock-control-reactivate',
    ),
]

