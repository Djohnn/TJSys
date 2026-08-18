from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from inventory.models import InventoryCount, InventoryCountItem
from inventory.serializers import InventoryCountItemSerializer, InventoryCountSerializer
from tenancy.permissions import HasActiveTenant, HasVerifiedMFA


class InventoryCountViewSet(viewsets.ModelViewSet):
    serializer_class = InventoryCountSerializer
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
    ]

    def get_queryset(self):
        queryset = InventoryCount.objects.select_related(
            'location', 'counted_by',
        ).filter(tenant=self.request.tenant)
        status = self.request.query_params.get('status')
        location_id = self.request.query_params.get('location')
        if status:
            queryset = queryset.filter(status=status)
        if location_id:
            queryset = queryset.filter(location_id=location_id)
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


class InventoryCountItemViewSet(viewsets.ModelViewSet):
    serializer_class = InventoryCountItemSerializer
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
    ]

    def get_queryset(self):
        queryset = InventoryCountItem.objects.select_related(
            'count', 'product',
        ).filter(tenant=self.request.tenant)
        count_id = self.request.query_params.get('count')
        if count_id:
            queryset = queryset.filter(count_id=count_id)
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
