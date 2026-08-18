from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from inventory.models import MovementReason
from inventory.serializers import MovementReasonSerializer
from tenancy.permissions import HasActiveTenant, HasVerifiedMFA


class MovementReasonViewSet(viewsets.ModelViewSet):
    serializer_class = MovementReasonSerializer
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
    ]

    def get_queryset(self):
        queryset = MovementReason.objects.filter(tenant=self.request.tenant)
        is_active = self.request.query_params.get('is_active')
        direction = self.request.query_params.get('direction')
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
        if direction:
            queryset = queryset.filter(direction=direction)
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
