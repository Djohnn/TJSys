from django.urls import include, path
from rest_framework.routers import DefaultRouter

from financial.views import (
    CashClosingReportView,
    CashflowReportView,
    FinancialReportView,
    InventoryReportView,
    PayableViewSet,
    PendingOperationsReportView,
    ReceivableViewSet,
    SalesReportView,
)

router = DefaultRouter()
router.register('payables', PayableViewSet, basename='payable')
router.register('receivables', ReceivableViewSet, basename='receivable')

urlpatterns = [
    path('reports/sales/', SalesReportView.as_view(), name='report-sales'),
    path('reports/cash-closing/', CashClosingReportView.as_view(), name='report-cash-closing'),
    path('reports/inventory/', InventoryReportView.as_view(), name='report-inventory'),
    path('reports/financial/', FinancialReportView.as_view(), name='report-financial'),
    path('reports/cashflow/', CashflowReportView.as_view(), name='report-cashflow'),
    path(
        'reports/pending-operations/',
        PendingOperationsReportView.as_view(),
        name='report-pending-operations',
    ),
    path('', include(router.urls)),
]
