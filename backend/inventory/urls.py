from django.urls import include, path
from rest_framework.routers import DefaultRouter

from inventory.views import InventoryCountItemViewSet, InventoryCountViewSet

router = DefaultRouter()
router.register('inventory-counts', InventoryCountViewSet, basename='inventory-count')
router.register('inventory-count-items', InventoryCountItemViewSet, basename='inventory-count-item')

urlpatterns = [
    path('', include(router.urls)),
]
