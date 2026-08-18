from django.urls import include, path
from rest_framework.routers import DefaultRouter

from inventory.views import StorageTypeViewSet

router = DefaultRouter()
router.register('storage-types', StorageTypeViewSet, basename='storage-type')

urlpatterns = [
    path('', include(router.urls)),
]
