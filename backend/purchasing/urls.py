from django.urls import include, path
from rest_framework.routers import DefaultRouter

from purchasing.views import (
    OpenPurchaseViewSet,
    PurchaseOrderItemViewSet,
    PurchaseOrderViewSet,
    PurchaseReceiptItemViewSet,
    PurchaseReceiptViewSet,
    PurchasingSummaryViewSet,
    RecurringPurchaseOrderViewSet,
    SupplierViewSet,
)

router = DefaultRouter()
router.register('suppliers', SupplierViewSet, basename='supplier')
router.register('orders', PurchaseOrderViewSet, basename='purchaseorder')
router.register('purchase-order-items', PurchaseOrderItemViewSet, basename='purchaseorderitem')
router.register('purchase-receipts', PurchaseReceiptViewSet, basename='purchasereceipt')
router.register(
    'purchase-receipt-items',
    PurchaseReceiptItemViewSet,
    basename='purchasereceiptitem',
)
router.register(
    'purchasing-summary',
    PurchasingSummaryViewSet,
    basename='purchasingsummary',
)
router.register(
    'recurring-purchase-orders',
    RecurringPurchaseOrderViewSet,
    basename='recurringpurchaseorder',
)
router.register(
    'open-purchases',
    OpenPurchaseViewSet,
    basename='openpurchase',
)

urlpatterns = [
    path('', include(router.urls)),
]
