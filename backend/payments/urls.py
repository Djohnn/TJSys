from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    PaymentIntentViewSet,
    PaymentProviderConfigViewSet,
    PaymentReconciliationBatchViewSet,
    PaymentTransactionViewSet,
    payment_webhook,
)

router = DefaultRouter()
router.register('payments/transactions', PaymentTransactionViewSet, basename='payment-transaction')
router.register(
    'payments/intents',
    PaymentIntentViewSet,
    basename='payment-intent',
)
router.register(
    'payments/provider-configs',
    PaymentProviderConfigViewSet,
    basename='payment-provider-config',
)
router.register(
    'payments/reconciliation-batches',
    PaymentReconciliationBatchViewSet,
    basename='payment-reconciliation-batch',
)

urlpatterns = [
    path('payments/webhooks/<str:provider>/', payment_webhook, name='payment-webhook'),
] + router.urls
