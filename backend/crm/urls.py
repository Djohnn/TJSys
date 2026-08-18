from django.urls import include, path
from rest_framework.routers import DefaultRouter

from crm.views import (
    ActivityTypeViewSet,
    ActivityViewSet,
    CustomerHistoryEntryViewSet,
    OpportunityViewSet,
    PipelineStageViewSet,
    PipelineViewSet,
)

router = DefaultRouter()
router.register('pipelines', PipelineViewSet, basename='pipeline')
router.register('pipeline-stages', PipelineStageViewSet, basename='pipeline-stage')
router.register('opportunities', OpportunityViewSet, basename='opportunity')
router.register('activity-types', ActivityTypeViewSet, basename='activity-type')
router.register('activities', ActivityViewSet, basename='activity')
router.register('customer-history', CustomerHistoryEntryViewSet, basename='customer-history')

urlpatterns = [
    path('', include(router.urls)),
]
