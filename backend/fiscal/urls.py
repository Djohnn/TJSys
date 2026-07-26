from django.urls import path
from rest_framework.routers import DefaultRouter

from fiscal.export import FiscalDocumentExportView
from fiscal.views import (
    FiscalConfigView,
    FiscalDocumentViewSet,
    FiscalEmitterViewSet,
    FiscalProductConfigViewSet,
    FiscalStatusView,
    OCRNFeView,
    ReceiptFiscalValidateView,
    RequestFiscalView,
)
from fiscal.webhook import fiscal_webhook

app_name = 'fiscal'

router = DefaultRouter()
router.register('fiscal/emitters', FiscalEmitterViewSet, basename='fiscal-emitter')
router.register('fiscal/documents', FiscalDocumentViewSet, basename='fiscal-document')
router.register(
    'fiscal/product-configs', FiscalProductConfigViewSet, basename='fiscal-product-config'
)

urlpatterns = [
    path(
        'sales/<uuid:sale_id>/fiscal-status/',
        FiscalStatusView.as_view(),
        name='fiscal-status',
    ),
    path(
        'sales/<uuid:sale_id>/request-fiscal/',
        RequestFiscalView.as_view(),
        name='request-fiscal',
    ),
    path('fiscal/ocr/', OCRNFeView.as_view(), name='fiscal-ocr'),
    path('fiscal/config/', FiscalConfigView.as_view(), name='fiscal-config'),
    path('fiscal/webhook/', fiscal_webhook, name='fiscal-webhook'),
    path(
        'receipts/<uuid:receipt_id>/validate-fiscal/',
        ReceiptFiscalValidateView.as_view(),
        name='receipt-validate-fiscal',
    ),
    path(
        'fiscal/documents/export/',
        FiscalDocumentExportView.as_view(),
        name='fiscal-document-export',
    ),
] + router.urls
