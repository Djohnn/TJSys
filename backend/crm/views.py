from django.db.models import Prefetch
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from crm.models import Activity, ActivityType, Opportunity
from crm.serializers import (
    ActivitySerializer,
    ActivityTypeSerializer,
)
from tenancy.permissions import HasActiveTenant, HasVerifiedMFA


class ActivityTypeViewSet(viewsets.ModelViewSet):
    serializer_class = ActivityTypeSerializer
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
    ]

    def get_queryset(self):
        queryset = ActivityType.objects.filter(tenant=self.request.tenant)
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
        return queryset

    def get_permissions(self):
        permissions = [IsAuthenticated(), HasActiveTenant()]
        if self.action in {'create', 'update', 'partial_update', 'destroy'}:
            permissions.append(HasVerifiedMFA())
        return permissions

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.tenant)

    def perform_update(self, serializer):
        serializer.save(tenant=self.request.tenant)


class ActivityViewSet(viewsets.ModelViewSet):
    serializer_class = ActivitySerializer
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
    ]

    def get_queryset(self):
        queryset = Activity.objects.select_related(
            'activity_type', 'customer', 'opportunity', 'assigned_to',
        ).filter(tenant=self.request.tenant)
        customer_id = self.request.query_params.get('customer')
        activity_type_id = self.request.query_params.get('activity_type')
        status_param = self.request.query_params.get('status')
        assigned_to = self.request.query_params.get('assigned_to')
        if customer_id:
            queryset = queryset.filter(customer_id=customer_id)
        if activity_type_id:
            queryset = queryset.filter(activity_type_id=activity_type_id)
        if status_param:
            queryset = queryset.filter(status=status_param)
        if assigned_to:
            queryset = queryset.filter(assigned_to_id=assigned_to)
        return queryset

    def get_permissions(self):
        permissions = [IsAuthenticated(), HasActiveTenant()]
        if self.action in {'create', 'update', 'partial_update', 'destroy'}:
            permissions.append(HasVerifiedMFA())
        return permissions

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.tenant)

    def perform_update(self, serializer):
        serializer.save(tenant=self.request.tenant)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        activity = self.get_object()
        if activity.status != 'pending':
            return Response(
                {'detail': 'Activity is not pending.'},
                status=status.HTTP_409_CONFLICT,
            )
        activity.status = 'completed'
        activity.completed_at = timezone.now()
        activity.save()
        return Response(ActivitySerializer(activity).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        activity = self.get_object()
        if activity.status != 'pending':
            return Response(
                {'detail': 'Activity is not pending.'},
                status=status.HTTP_409_CONFLICT,
            )
        activity.status = 'cancelled'
        activity.save()
        return Response(ActivitySerializer(activity).data)
