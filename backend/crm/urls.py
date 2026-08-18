from django.urls import include, path
from rest_framework.routers import DefaultRouter

from crm.views import (
    ActivityTypeViewSet,
    ActivityViewSet,
)

router = DefaultRouter()
router.register('activity-types', ActivityTypeViewSet, basename='activity-type')
router.register('activities', ActivityViewSet, basename='activity')

urlpatterns = [
    path('', include(router.urls)),
]
