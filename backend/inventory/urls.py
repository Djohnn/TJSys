from django.urls import include, path
from rest_framework.routers import DefaultRouter

from inventory.views import MovementReasonViewSet

router = DefaultRouter()
router.register('movement-reasons', MovementReasonViewSet, basename='movement-reason')

urlpatterns = [
    path('', include(router.urls)),
]
