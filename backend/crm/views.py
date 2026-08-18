from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from crm.models import CustomerHistoryEntry
from crm.serializers import CustomerHistoryEntrySerializer
from tenancy.permissions import HasActiveTenant, HasVerifiedMFA


class CustomerHistoryEntryViewSet(viewsets.ModelViewSet):
    serializer_class = CustomerHistoryEntrySerializer
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
    ]

    def get_queryset(self):
        queryset = CustomerHistoryEntry.objects.select_related(
            'customer', 'created_by',
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
