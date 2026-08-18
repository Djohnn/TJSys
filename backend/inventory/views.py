from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from inventory.models import MovementReason, ReplenishmentOrder, ReplenishmentRule, StorageType
from inventory.serializers import (
    MovementReasonSerializer,
    ReplenishmentOrderSerializer,
    ReplenishmentRuleSerializer,
    StorageTypeSerializer,
)
from tenancy.permissions import HasActiveTenant, HasVerifiedMFA


class StorageTypeViewSet(viewsets.ModelViewSet):
    serializer_class = StorageTypeSerializer
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
    ]

    def get_queryset(self):
        queryset = StorageType.objects.filter(tenant=self.request.tenant)
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
