from decimal import Decimal

from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from purchasing.models import (
    PurchaseOrder,
    PurchaseOrderItem,
    PurchaseReceipt,
    PurchaseReceiptItem,
    RecurringPurchaseOrderTemplate,
    Supplier,
)
from purchasing.permissions import PurchasingCapabilityPermission
from purchasing.serializers import (
    PurchaseOrderCancellationSerializer,
    PurchaseOrderDetailSerializer,
    PurchaseOrderItemSerializer,
    PurchaseOrderListSerializer,
    PurchaseReceiptCancellationSerializer,
    PurchaseReceiptInputSerializer,
    PurchaseReceiptItemSerializer,
    PurchaseReceiptSerializer,
    RecurringPurchaseOrderTemplateSerializer,
    SupplierReturnSerializer,
    SupplierSerializer,
)
from purchasing.services import (
    AlreadyCancelled,
    CannotCancelPurchaseOrder,
    DuplicateIdempotencyKey,
    OverReceiptError,
    ReceiptWithoutApprovedOrder,
    approve_purchase_order,
    cancel_purchase_order,
    cancel_receipt,
    create_supplier_return,
    purchasing_summary,
    receive_purchase_order,
)
from tenancy.permissions import HasActiveTenant, HasVerifiedMFA


def _idempotency_key(request):
    value = request.headers.get('Idempotency-Key', '').strip()
    if not value:
        raise ValueError('Idempotency-Key header is required.')
    return value


class TenantScopedViewSetMixin:
    def perform_create(self, serializer):
        serializer.save(tenant=self.request.tenant)

    def perform_update(self, serializer):
        instance = serializer.save()
        instance.version += 1
        instance.save(update_fields=['version'])
        return instance


class SupplierViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    serializer_class = SupplierSerializer
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
        PurchasingCapabilityPermission,
    ]

    def get_queryset(self):
        return Supplier.objects.filter(tenant=self.request.tenant)

    def get_permissions(self):
        permissions = [IsAuthenticated(), HasActiveTenant()]
        if self.action in {'create', 'update', 'partial_update', 'destroy', 'auto_onboard'}:
            permissions.append(HasVerifiedMFA())
        permissions.append(PurchasingCapabilityPermission())
        return permissions

    @action(detail=False, methods=['post'])
    def auto_onboard(self, request):
        from purchasing.services import auto_onboard_supplier

        cnpj = request.data.get('cnpj', '')
        if not cnpj:
            return Response({'detail': 'CNPJ is required.'}, status=400)
        name = request.data.get('name', '')
        supplier = auto_onboard_supplier(
            tenant=request.tenant,
            cnpj=cnpj,
            name=name,
        )
        serializer = self.get_serializer(supplier)
        return Response(serializer.data, status=201)


class PurchaseOrderViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
        PurchasingCapabilityPermission,
    ]

    def get_serializer_class(self):
        if self.action in {'retrieve', 'approve', 'receive'}:
            return PurchaseOrderDetailSerializer
        return PurchaseOrderListSerializer

    def get_queryset(self):
        qs = PurchaseOrder.objects.select_related(
            'supplier',
            'branch',
        ).filter(tenant=self.request.tenant)
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        supplier_id = self.request.query_params.get('supplier')
        if supplier_id:
            qs = qs.filter(supplier_id=supplier_id)
        branch_id = self.request.query_params.get('branch')
        if branch_id:
            qs = qs.filter(branch_id=branch_id)
        return qs

    def get_permissions(self):
        permissions = [IsAuthenticated(), HasActiveTenant()]
        write_actions = {
            'create',
            'update',
            'partial_update',
            'destroy',
            'approve',
            'receive',
            'cancel',
        }
        if self.action in write_actions:
            permissions.append(HasVerifiedMFA())
        permissions.append(PurchasingCapabilityPermission())
        return permissions

    def _problem(self, detail, code='purchasing_error', status_code=400):
        return Response(
            {
                'type': f'https://zyrp.local/problems/{code}',
                'title': 'Purchase operation rejected',
                'status': status_code,
                'detail': str(detail),
            },
            status=status_code,
            content_type='application/problem+json',
        )

    def perform_update(self, serializer):
        if serializer.instance.status != 'draft':
            raise serializers.ValidationError({'detail': 'Approved purchase orders are immutable.'})
        return super().perform_update(serializer)

    def perform_destroy(self, instance):
        if instance.status != 'draft':
            raise serializers.ValidationError({'detail': 'Approved purchase orders are immutable.'})
        return super().perform_destroy(instance)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        po = self.get_object()
        try:
            key = _idempotency_key(request)
            result = approve_purchase_order(
                tenant=request.tenant,
                purchase_order=po,
                idempotency_key=key,
                actor=request.user,
            )
        except ValueError as exc:
            return self._problem(exc)
        serializer = self.get_serializer(result)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def receive(self, request, pk=None):
        po = self.get_object()
        input_serializer = PurchaseReceiptInputSerializer(data=request.data)
        if not input_serializer.is_valid():
            return self._problem(
                input_serializer.errors,
                code='invalid_receipt',
            )
        items = input_serializer.validated_data['items']
        notes = input_serializer.validated_data['notes']
        try:
            key = _idempotency_key(request)
            receipt = receive_purchase_order(
                tenant=request.tenant,
                purchase_order=po,
                items=items,
                notes=notes,
                idempotency_key=key,
                actor=request.user,
            )
        except (
            DuplicateIdempotencyKey,
            OverReceiptError,
            ReceiptWithoutApprovedOrder,
            ValueError,
        ) as exc:
            status_code = (
                409
                if isinstance(
                    exc,
                    (
                        DuplicateIdempotencyKey,
                        OverReceiptError,
                    ),
                )
                else 400
            )
            return self._problem(exc, status_code=status_code)
        serializer = PurchaseReceiptSerializer(
            receipt,
            context=self.get_serializer_context(),
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        po = self.get_object()
        reason = request.data.get('reason', '')
        if not reason:
            return self._problem('Reason is required.', 'missing_reason')
        try:
            key = _idempotency_key(request)
            result = cancel_purchase_order(
                tenant=request.tenant,
                purchase_order=po,
                reason=reason,
                idempotency_key=key,
                actor=request.user,
            )
        except (AlreadyCancelled, CannotCancelPurchaseOrder, ValueError) as exc:
            return self._problem(exc)
        serializer = PurchaseOrderCancellationSerializer(
            result,
            context=self.get_serializer_context(),
        )
        return Response(serializer.data)


class PurchaseOrderItemViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    serializer_class = PurchaseOrderItemSerializer
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
        PurchasingCapabilityPermission,
    ]

    def get_queryset(self):
        qs = PurchaseOrderItem.objects.select_related(
            'product',
            'unit',
            'purchase_order',
        ).filter(tenant=self.request.tenant)
        po_id = self.request.query_params.get('purchase_order')
        if po_id:
            qs = qs.filter(purchase_order_id=po_id)
        return qs

    def get_permissions(self):
        permissions = [IsAuthenticated(), HasActiveTenant()]
        if self.action in {'create', 'update', 'partial_update', 'destroy'}:
            permissions.append(HasVerifiedMFA())
        permissions.append(PurchasingCapabilityPermission())
        return permissions

    def perform_destroy(self, instance):
        if instance.purchase_order.status != 'draft':
            raise serializers.ValidationError(
                {'detail': 'Approved purchase order items are immutable.'}
            )
        return super().perform_destroy(instance)


class PurchaseReceiptViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = PurchaseReceiptSerializer
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
        PurchasingCapabilityPermission,
    ]

    def get_queryset(self):
        qs = PurchaseReceipt.objects.select_related(
            'purchase_order',
            'purchase_order__supplier',
        ).filter(tenant=self.request.tenant)
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        order_id = self.request.query_params.get('order')
        if order_id:
            qs = qs.filter(purchase_order_id=order_id)
        return qs

    def get_permissions(self):
        permissions = [IsAuthenticated(), HasActiveTenant()]
        write_actions = {'cancel', 'return'}
        if self.action in write_actions:
            permissions.append(HasVerifiedMFA())
        permissions.append(PurchasingCapabilityPermission())
        return permissions

    def _problem(self, detail, code='purchasing_error', status_code=400):
        return Response(
            {
                'type': f'https://zyrp.local/problems/{code}',
                'title': 'Purchase operation rejected',
                'status': status_code,
                'detail': str(detail),
            },
            status=status_code,
        )

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        receipt = self.get_object()
        reason = request.data.get('reason', '')
        if not reason:
            return self._problem('Reason is required.', 'missing_reason')
        try:
            key = _idempotency_key(request)
            result = cancel_receipt(
                tenant=request.tenant,
                receipt=receipt,
                reason=reason,
                idempotency_key=key,
                actor=request.user,
            )
        except (AlreadyCancelled, CannotCancelPurchaseOrder, ValueError) as exc:
            return self._problem(exc)
        serializer = PurchaseReceiptCancellationSerializer(
            result,
            context=self.get_serializer_context(),
        )
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def return_items(self, request, pk=None):
        receipt = self.get_object()
        reason = request.data.get('reason', '')
        items_data = request.data.get('items', [])
        if not reason:
            return self._problem('Reason is required.', 'missing_reason')
        if not items_data:
            return self._problem('Items are required.', 'missing_items')
        items = []
        for entry in items_data:
            items.append(
                {
                    'purchase_order_item_id': entry.get('purchase_order_item_id'),
                    'quantity': Decimal(str(entry.get('quantity', 0))),
                }
            )
        try:
            key = _idempotency_key(request)
            result = create_supplier_return(
                tenant=request.tenant,
                receipt=receipt,
                items=items,
                reason=reason,
                idempotency_key=key,
                actor=request.user,
            )
        except (OverReceiptError, ValueError) as exc:
            return self._problem(exc)
        serializer = SupplierReturnSerializer(
            result,
            context=self.get_serializer_context(),
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class PurchaseReceiptItemViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = PurchaseReceiptItemSerializer
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
        PurchasingCapabilityPermission,
    ]

    def get_queryset(self):
        qs = PurchaseReceiptItem.objects.select_related(
            'receipt',
            'purchase_order_item__product',
        ).filter(tenant=self.request.tenant)
        receipt_id = self.request.query_params.get('receipt')
        if receipt_id:
            qs = qs.filter(receipt_id=receipt_id)
        return qs


class PurchasingSummaryViewSet(viewsets.ViewSet):
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
        PurchasingCapabilityPermission,
    ]

    def list(self, request):
        data = purchasing_summary(tenant=request.tenant)
        return Response(data)


class RecurringPurchaseOrderViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    serializer_class = RecurringPurchaseOrderTemplateSerializer
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
        HasVerifiedMFA,
        PurchasingCapabilityPermission,
    ]

    def get_queryset(self):
        return RecurringPurchaseOrderTemplate.objects.select_related(
            'supplier',
            'branch',
        ).filter(tenant=self.request.tenant)

    @action(detail=True, methods=['post'])
    def generate(self, request, pk=None):
        from purchasing.services import generate_po_from_template

        template = self.get_object()
        po = generate_po_from_template(
            template,
            request.tenant,
            idempotency_key_prefix=f'recurring-{template.id}',
        )
        from purchasing.serializers import PurchaseOrderDetailSerializer

        serializer = PurchaseOrderDetailSerializer(
            po,
            context=self.get_serializer_context(),
        )
        return Response(serializer.data, status=201)


# =============================================================================
# Sprint F8 — PurchaseReturn API (devoluções de compra)
# =============================================================================


from purchasing.models import SupplierReturn, SupplierReturnItem


class SupplierReturnSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    receipt = serializers.UUIDField()
    reason = serializers.CharField()
    status = serializers.ChoiceField(
        choices=[
            ('draft', 'Rascunho'),
            ('completed', 'Concluída'),
            ('cancelled', 'Cancelada'),
        ],
        default='completed',
    )
    idempotency_key = serializers.CharField(max_length=100)
    payload_hash = serializers.CharField(max_length=64, required=False, allow_blank=True, default='')
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)


class SupplierReturnViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    serializer_class = SupplierReturnSerializer
    permission_classes = [IsAuthenticated, HasActiveTenant, PurchasingCapabilityPermission]

    def get_queryset(self):
        return SupplierReturn.objects.select_related(
            'receipt',
            'receipt__purchase_order',
            'receipt__purchase_order__supplier',
        ).filter(tenant=self.request.tenant)

    def get_permissions(self):
        permissions = [IsAuthenticated(), HasActiveTenant()]
        write_actions = {'create', 'update', 'partial_update', 'destroy', 'complete', 'cancel'}
        if self.action in write_actions:
            permissions.append(HasVerifiedMFA())
        permissions.append(PurchasingCapabilityPermission())
        return permissions

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        supplier_return = self.get_object()
        if supplier_return.status != 'draft':
            return Response({'detail': 'Only draft returns can be completed.'}, status=400)
        supplier_return.status = 'completed'
        supplier_return.full_clean()
        supplier_return.save()
        return Response(SupplierReturnSerializer(supplier_return).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        supplier_return = self.get_object()
        if supplier_return.status in ('completed', 'cancelled'):
            return Response({'detail': 'Completed or cancelled returns cannot be cancelled.'}, status=400)
        supplier_return.status = 'cancelled'
        supplier_return.full_clean()
        supplier_return.save()
        return Response(SupplierReturnSerializer(supplier_return).data)
