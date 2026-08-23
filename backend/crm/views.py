from django.db.models import Prefetch
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from crm.models import (
    Activity,
    ActivityType,
    CustomerHistoryEntry,
    Opportunity,
    Pipeline,
    PipelineStage,
)
from crm.serializers import (
    ActivitySerializer,
    ActivityTypeSerializer,
    CustomerHistoryEntrySerializer,
    OpportunitySerializer,
    PipelineSerializer,
    PipelineStageSerializer,
)
from tenancy.permissions import HasActiveTenant, HasVerifiedMFA


class PipelineViewSet(viewsets.ModelViewSet):
    serializer_class = PipelineSerializer
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
    ]

    def get_queryset(self):
        queryset = Pipeline.objects.filter(tenant=self.request.tenant).prefetch_related(
            Prefetch(
                'stages',
                queryset=PipelineStage.all_objects.filter(
                    tenant=self.request.tenant,
                ),
            ),
        )
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


class PipelineStageViewSet(viewsets.ModelViewSet):
    serializer_class = PipelineStageSerializer
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
    ]

    def get_queryset(self):
        queryset = PipelineStage.objects.filter(tenant=self.request.tenant)
        pipeline_id = self.request.query_params.get('pipeline')
        if pipeline_id:
            queryset = queryset.filter(pipeline_id=pipeline_id)
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


class OpportunityViewSet(viewsets.ModelViewSet):
    serializer_class = OpportunitySerializer
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
    ]

    def get_queryset(self):
        queryset = Opportunity.objects.select_related(
            'pipeline',
            'stage',
            'customer',
            'assigned_to',
        ).filter(tenant=self.request.tenant)
        pipeline_id = self.request.query_params.get('pipeline')
        stage_id = self.request.query_params.get('stage')
        status = self.request.query_params.get('status')
        assigned_to = self.request.query_params.get('assigned_to')
        if pipeline_id:
            queryset = queryset.filter(pipeline_id=pipeline_id)
        if stage_id:
            queryset = queryset.filter(stage_id=stage_id)
        if status:
            queryset = queryset.filter(status=status)
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
    def convert(self, request, pk=None):
        opportunity = self.get_object()
        if opportunity.status != 'open':
            return Response(
                {'detail': 'Opportunity is not open.'},
                status=status.HTTP_409_CONFLICT,
            )
        opportunity.status = 'won'
        opportunity.actual_close_date = timezone.now().date()
        opportunity.save()
        return Response(OpportunitySerializer(opportunity).data)


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
            'activity_type',
            'customer',
            'opportunity',
            'assigned_to',
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


class CustomerHistoryEntryViewSet(viewsets.ModelViewSet):
    serializer_class = CustomerHistoryEntrySerializer
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
    ]

    def get_queryset(self):
        queryset = CustomerHistoryEntry.objects.select_related(
            'customer',
            'created_by',
        ).filter(tenant=self.request.tenant)
        customer_id = self.request.query_params.get('customer')
        event_type = self.request.query_params.get('event_type')
        if customer_id:
            queryset = queryset.filter(customer_id=customer_id)
        if event_type:
            queryset = queryset.filter(event_type=event_type)
        return queryset

    def get_permissions(self):
        permissions = [IsAuthenticated(), HasActiveTenant()]
        if self.action in {'create', 'update', 'partial_update', 'destroy'}:
            permissions.append(HasVerifiedMFA())
        return permissions

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.tenant, created_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(tenant=self.request.tenant)
