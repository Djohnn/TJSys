from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from inventory.models import ReplenishmentOrder, ReplenishmentRule
from inventory.serializers import ReplenishmentOrderSerializer, ReplenishmentRuleSerializer
from tenancy.permissions import HasActiveTenant, HasVerifiedMFA


class ReplenishmentRuleViewSet(viewsets.ModelViewSet):
    serializer_class = ReplenishmentRuleSerializer
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
    ]

    def get_queryset(self):
        queryset = ReplenishmentRule.objects.select_related(
            'product', 'location',
        ).filter(tenant=self.request.tenant)
        is_active = self.request.query_params.get('is_active')
        trigger_type = self.request.query_params.get('trigger_type')
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
        if trigger_type:
            queryset = queryset.filter(trigger_type=trigger_type)
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


class ReplenishmentOrderViewSet(viewsets.ModelViewSet):
    serializer_class = ReplenishmentOrderSerializer
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
    ]

    def get_queryset(self):
        queryset = ReplenishmentOrder.objects.select_related(
            'rule', 'approved_by',
        ).filter(tenant=self.request.tenant)
        status = self.request.query_params.get('status')
        if status:
            queryset = queryset.filter(status=status)
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
