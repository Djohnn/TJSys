from django.urls import include, path
from rest_framework.routers import DefaultRouter

from crm.views import CustomerHistoryEntryViewSet

router = DefaultRouter()
router.register('customer-history', CustomerHistoryEntryViewSet, basename='customer-history')

urlpatterns = [
    path('', include(router.urls)),
]
