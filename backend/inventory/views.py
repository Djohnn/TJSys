from decimal import Decimal

from django.core.exceptions import ObjectDoesNotExist
from django.db import transaction
from django.db.models import Q, Sum
from django.http import JsonResponse
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog.models import Product, Unit
from inventory.models import (
    ProductStockPolicy,
    StockBalance,
    StockLocation,
    StockLot,
    StockMovement,
    StockOperation,
    StockOperationReversal,
)
from inventory.permissions import (
    InventoryCapabilityPermission,
    InventoryLocationsPermission,
)
from inventory.serializers import (
    ProductStockPolicySerializer,
    StockBalanceSerializer,
    StockLocationSerializer,
    StockLotSerializer,
    StockMovementSerializer,
    StockOperationReversalSerializer,
    StockOperationSerializer,
)
from inventory.services import (
    DuplicateIdempotencyKey,
    ExpiredLotError,
    InsufficientStock,
    InvalidLotError,
    ProductStockControlError,
    create_adjustment,
    create_issue,
    create_receipt,
    create_transfer,
    deactivate_product_stock_control,
    reactivate_product_stock_control,
    reconcile_stock_balances,
    reverse_operation,
)
from tenancy.models import Branch
from tenancy.permissions import HasActiveTenant, HasVerifiedMFA


class StockWriteSerializer(serializers.Serializer):
    branch = serializers.UUIDField()
    product = serializers.UUIDField()
    location = serializers.UUIDField()
    quantity = serializers.DecimalField(max_digits=18, decimal_places=6)
    unit = serializers.UUIDField()
    factor = serializers.DecimalField(
        max_digits=18,
        decimal_places=6,
        default=Decimal('1'),
    )
    lot = serializers.UUIDField(required=False, allow_null=True)
    reason = serializers.CharField(required=False, allow_blank=True, default='')
    unit_cost = serializers.DecimalField(
        max_digits=18,
        decimal_places=6,
        required=False,
        allow_null=True,
    )


class StockTransferSerializer(serializers.Serializer):
    source_branch = serializers.UUIDField()
    target_branch = serializers.UUIDField()
    product = serializers.UUIDField()
    source_location = serializers.UUIDField()
    target_location = serializers.UUIDField()
    quantity = serializers.DecimalField(max_digits=18, decimal_places=6)
    unit = serializers.UUIDField()
    factor = serializers.DecimalField(
        max_digits=18,
        decimal_places=6,
        default=Decimal('1'),
    )
    lot = serializers.UUIDField(required=False, allow_null=True)
    reason = serializers.CharField(required=False, allow_blank=True, default='')


class StockReversalRequestSerializer(serializers.Serializer):
    operation = serializers.UUIDField()
    reason = serializers.CharField(required=True, allow_blank=False)


def _problem(detail, code='invalid_stock_operation', status_code=400):
    return Response(
        {
            'type': f'https://tjsys.local/problems/{code}',
            'title': 'Stock operation rejected',
            'status': status_code,
            'detail': str(detail),
        },
        status=status_code,
    )


def _idempotency_key(request):
    value = request.headers.get('Idempotency-Key', '').strip()
    if not value:
        raise ValueError('Idempotency-Key header is required.')
    return value


def _tenant_get(model, tenant, pk):
    return model.all_objects.get(tenant=tenant, pk=pk)


class TenantScopedViewSetMixin:
    def perform_create(self, serializer):
        serializer.save(tenant=self.request.tenant)

    def perform_update(self, serializer):
        instance = serializer.save()
        instance.version += 1
        instance.save(update_fields=['version'])
        return instance


class StockLocationViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    serializer_class = StockLocationSerializer
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
        InventoryLocationsPermission,
    ]

    def get_queryset(self):
        return StockLocation.objects.select_related(
            'branch',
            'branch__company',
        ).filter(tenant=self.request.tenant)

    def get_permissions(self):
        permissions = [IsAuthenticated(), HasActiveTenant()]
        if self.action in {'create', 'update', 'partial_update', 'destroy', 'set_primary'}:
            permissions.extend([HasVerifiedMFA(), InventoryLocationsPermission()])
        else:
            permissions.append(InventoryLocationsPermission())
        return permissions

    @action(detail=True, methods=['post'])
    def set_primary(self, request, pk=None):
        location = self.get_object()
        with transaction.atomic():
            StockLocation.all_objects.filter(
                tenant=request.tenant,
                branch=location.branch,
                is_primary=True,
                is_active=True,
            ).exclude(pk=location.pk).update(is_primary=False)
            location.is_primary = True
            location.version += 1
            location.save(update_fields=['is_primary', 'version', 'updated_at'])
        return Response({'detail': 'Local definido como principal.'})


class StockLotViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    serializer_class = StockLotSerializer
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
        InventoryCapabilityPermission,
    ]

    def get_queryset(self):
        return StockLot.objects.select_related('product').filter(tenant=self.request.tenant)

    def get_permissions(self):
        permissions = [IsAuthenticated(), HasActiveTenant()]
        if self.action in {'create', 'update', 'partial_update', 'destroy', 'deactivate'}:
            permissions.append(HasVerifiedMFA())
        permissions.append(InventoryCapabilityPermission())
        return permissions

    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        lot = self.get_object()
        lot.is_active = False
        lot.version += 1
        lot.save(update_fields=['is_active', 'version', 'updated_at'])
        return Response({'detail': 'Lote desativado.'})

    @action(detail=False, methods=['get'])
    def expired(self, request):
        from django.utils import timezone

        lots = self.get_queryset().filter(
            expiry_date__lt=timezone.now().date(),
            is_active=True,
        ).order_by('expiry_date')
        serializer = self.get_serializer(lots, many=True)
        return Response(serializer.data)


class StockOperationViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    serializer_class = StockOperationSerializer
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
        InventoryCapabilityPermission,
    ]

    def get_queryset(self):
        return StockOperation.objects.select_related('branch', 'actor').filter(
            tenant=self.request.tenant,
        ).prefetch_related('movements')

    def get_permissions(self):
        permissions = [IsAuthenticated(), HasActiveTenant()]
        write_actions = {
            'create',
            'update',
            'partial_update',
            'destroy',
            'confirm',
            'receipt',
            'issue',
            'adjustment',
            'transfer',
            'reverse',
        }
        if self.action in write_actions:
            permissions.append(HasVerifiedMFA())
        permissions.append(InventoryCapabilityPermission())
        return permissions

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.tenant, actor=self.request.user)

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        operation = self.get_object()
        if operation.status != 'draft':
            return Response(
                {'detail': 'Apenas operacoes em rascunho podem ser confirmadas.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        operation.status = 'confirmed'
        operation.version += 1
        operation.save(update_fields=['status', 'version', 'updated_at'])
        return Response({'detail': 'Operacao confirmada.', 'id': str(operation.id)})

    def _handle_stock_error(self, exc):
        if isinstance(exc, ObjectDoesNotExist):
            return _problem('Resource not found.', 'not_found', status.HTTP_404_NOT_FOUND)
        if isinstance(exc, DuplicateIdempotencyKey):
            return _problem(exc, 'idempotency_conflict', status.HTTP_409_CONFLICT)
        if isinstance(exc, InsufficientStock):
            return _problem(exc, 'insufficient_stock', status.HTTP_409_CONFLICT)
        if isinstance(exc, (InvalidLotError, ExpiredLotError, ValueError)):
            return _problem(exc)
        raise exc

    def _serialize_operation(self, operation):
        data = StockOperationSerializer(
            operation,
            context=self.get_serializer_context(),
        ).data
        return Response(data)

    @action(detail=False, methods=['post'])
    def receipt(self, request):
        serializer = StockWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            operation = create_receipt(
                request.tenant,
                _tenant_get(Branch, request.tenant, data['branch']),
                _tenant_get(Product, request.tenant, data['product']),
                _tenant_get(StockLocation, request.tenant, data['location']),
                data['quantity'],
                _tenant_get(Unit, request.tenant, data['unit']),
                data['factor'],
                lot=_tenant_get(StockLot, request.tenant, data['lot']) if data.get('lot') else None,
                unit_cost=data.get('unit_cost'),
                idempotency_key=_idempotency_key(request),
                actor=request.user,
                reason=data.get('reason', ''),
            )
        except Exception as exc:
            return self._handle_stock_error(exc)
        return self._serialize_operation(operation)

    @action(detail=False, methods=['post'])
    def issue(self, request):
        serializer = StockWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            operation = create_issue(
                request.tenant,
                _tenant_get(Branch, request.tenant, data['branch']),
                _tenant_get(Product, request.tenant, data['product']),
                _tenant_get(StockLocation, request.tenant, data['location']),
                data['quantity'],
                _tenant_get(Unit, request.tenant, data['unit']),
                data['factor'],
                lot=_tenant_get(StockLot, request.tenant, data['lot']) if data.get('lot') else None,
                unit_cost=data.get('unit_cost'),
                idempotency_key=_idempotency_key(request),
                actor=request.user,
                reason=data.get('reason', ''),
            )
        except Exception as exc:
            return self._handle_stock_error(exc)
        return self._serialize_operation(operation)

    @action(detail=False, methods=['post'])
    def adjustment(self, request):
        serializer = StockWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            operation = create_adjustment(
                request.tenant,
                _tenant_get(Branch, request.tenant, data['branch']),
                _tenant_get(Product, request.tenant, data['product']),
                _tenant_get(StockLocation, request.tenant, data['location']),
                data['quantity'],
                _tenant_get(Unit, request.tenant, data['unit']),
                data['factor'],
                lot=_tenant_get(StockLot, request.tenant, data['lot']) if data.get('lot') else None,
                unit_cost=data.get('unit_cost'),
                idempotency_key=_idempotency_key(request),
                actor=request.user,
                reason=data.get('reason', ''),
                allow_expired_lot=True,
            )
        except Exception as exc:
            return self._handle_stock_error(exc)
        return self._serialize_operation(operation)

    @action(detail=False, methods=['post'])
    def transfer(self, request):
        serializer = StockTransferSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            operation = create_transfer(
                request.tenant,
                _tenant_get(Branch, request.tenant, data['source_branch']),
                _tenant_get(Branch, request.tenant, data['target_branch']),
                _tenant_get(Product, request.tenant, data['product']),
                _tenant_get(StockLocation, request.tenant, data['source_location']),
                _tenant_get(StockLocation, request.tenant, data['target_location']),
                data['quantity'],
                _tenant_get(Unit, request.tenant, data['unit']),
                data['factor'],
                lot=_tenant_get(StockLot, request.tenant, data['lot']) if data.get('lot') else None,
                idempotency_key=_idempotency_key(request),
                actor=request.user,
                reason=data.get('reason', ''),
            )
        except Exception as exc:
            return self._handle_stock_error(exc)
        return self._serialize_operation(operation)

    @action(detail=False, methods=['post'], url_path='reverse')
    def reverse(self, request):
        serializer = StockReversalRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            operation = reverse_operation(
                _tenant_get(StockOperation, request.tenant, data['operation']),
                reason=data['reason'],
                idempotency_key=_idempotency_key(request),
                actor=request.user,
            )
        except Exception as exc:
            return self._handle_stock_error(exc)
        return self._serialize_operation(operation)


class StockMovementViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = StockMovementSerializer
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
        InventoryCapabilityPermission,
    ]

    def get_queryset(self):
        qs = StockMovement.objects.select_related(
            'operation',
            'product',
            'location',
            'lot',
            'unit',
        ).filter(tenant=self.request.tenant)
        date_from = self.request.query_params.get('date_from')
        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)
        date_to = self.request.query_params.get('date_to')
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)
        movement_type = self.request.query_params.get('type')
        if movement_type:
            qs = qs.filter(direction=movement_type)
        return qs


class StockBalanceViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = StockBalanceSerializer
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
        InventoryCapabilityPermission,
    ]

    def get_queryset(self):
        queryset = StockBalance.objects.select_related(
            'product',
            'location',
            'location__branch',
            'lot',
        ).filter(tenant=self.request.tenant)
        product_id = self.request.query_params.get('product')
        branch_id = self.request.query_params.get('branch')
        location_id = self.request.query_params.get('location')
        lot_id = self.request.query_params.get('lot')
        query = self.request.query_params.get('q', '').strip()
        if product_id:
            queryset = queryset.filter(product_id=product_id)
        if branch_id:
            queryset = queryset.filter(location__branch_id=branch_id)
        if location_id:
            queryset = queryset.filter(location_id=location_id)
        if lot_id:
            queryset = queryset.filter(lot_id=lot_id)
        if query:
            queryset = queryset.filter(
                Q(product__name__icontains=query) | Q(product__sku__icontains=query)
            )
        return queryset

    @action(detail=False, methods=['get'])
    def summary(self, request):
        queryset = self.get_queryset().filter(quantity__gt=0)
        totals = queryset.aggregate(
            total_quantity=Sum('quantity'),
            total_reserved=Sum('reserved'),
        )
        total_quantity = totals['total_quantity'] or 0
        total_reserved = totals['total_reserved'] or 0
        return Response(
            {
                'total_items': queryset.count(),
                'total_quantity': total_quantity,
                'total_reserved': total_reserved,
                'total_available': total_quantity - total_reserved,
            }
        )

    @action(detail=False, methods=['get'])
    def reconcile(self, request):
        return Response(reconcile_stock_balances(request.tenant))


class StockOperationReversalViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    serializer_class = StockOperationReversalSerializer
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
        HasVerifiedMFA,
        InventoryCapabilityPermission,
    ]

    def get_queryset(self):
        return StockOperationReversal.objects.select_related(
            'original_operation',
            'reversal_operation',
        ).filter(tenant=self.request.tenant)


class ProductStockPolicyViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    serializer_class = ProductStockPolicySerializer
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
        InventoryCapabilityPermission,
    ]
    http_method_names = ['get', 'patch', 'head', 'options']

    def get_queryset(self):
        qs = ProductStockPolicy.objects.select_related(
            'product',
            'branch',
            'location',
        ).filter(tenant=self.request.tenant).order_by(
            'branch__name',
            'location__name',
            'id',
        )
        product_id = self.request.query_params.get('product')
        branch_id = self.request.query_params.get('branch')
        location_id = self.request.query_params.get('location')
        if product_id:
            qs = qs.filter(product_id=product_id)
        if branch_id:
            qs = qs.filter(branch_id=branch_id)
        if location_id:
            qs = qs.filter(location_id=location_id)
        return qs

    def get_permissions(self):
        permissions = [IsAuthenticated(), HasActiveTenant()]
        if self.action in {'partial_update', 'update'}:
            permissions.append(HasVerifiedMFA())
        permissions.append(InventoryCapabilityPermission())
        return permissions

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if_match = request.headers.get('If-Match')
        if if_match is not None and str(instance.version) != if_match:
            return Response(
                {
                    'type': 'about:blank',
                    'title': 'Conflict',
                    'status': 409,
                    'detail': 'Version mismatch.',
                    'code': 'CONFLICT_VERSION_MISMATCH',
                },
                status=status.HTTP_409_CONFLICT,
                content_type='application/problem+json',
            )
        return super().update(request, *args, **kwargs)


class ProductStockSummaryView(APIView):
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
        InventoryCapabilityPermission,
    ]

    def get(self, request, product_id):
        from catalog.models import Product
        from inventory.services.product_stock import build_product_stock_summary

        product = Product.all_objects.get(
            tenant=request.tenant,
            id=product_id,
        )

        branch_id = request.query_params.get('branch')
        location_id = request.query_params.get('location')
        has_filters = bool(branch_id or location_id)

        policies = ProductStockPolicy.objects.filter(
            tenant=request.tenant,
            product=product,
            is_active=True,
        ).order_by('branch__name', 'location__name', 'id')

        if branch_id:
            policies = policies.filter(branch_id=branch_id)
        if location_id:
            policies = policies.filter(location_id=location_id)

        # If no filters, return ordered collection of all locations
        if not has_filters:
            summaries = []
            for policy in policies:
                balance = StockBalance.objects.filter(
                    tenant=request.tenant,
                    product=product,
                    location=policy.location,
                ).first()
                summaries.append(
                    build_product_stock_summary(
                        product=product,
                        policy=policy,
                        balance=balance,
                    )
                )
            return Response(summaries)

        # If filters provided, return single summary
        policy = policies.first()
        if not policy:
            return JsonResponse(None, safe=False)

        balance = StockBalance.objects.filter(
            tenant=request.tenant,
            product=product,
            location=policy.location,
        ).first()

        return Response(
            build_product_stock_summary(
                product=product,
                policy=policy,
                balance=balance,
            )
        )


class ProductStockControlDeactivateView(APIView):
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
        InventoryCapabilityPermission,
    ]

    def post(self, request, product_id):
        from catalog.models import Product
        from inventory.serializers import (
            StockControlDeactivateRequestSerializer,
        )

        serializer = StockControlDeactivateRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            product = Product.all_objects.get(tenant=request.tenant, id=product_id)
        except Product.DoesNotExist:
            return Response(
                {
                    'type': 'https://tjsys.local/problems/product-not-found',
                    'title': 'Product not found',
                    'status': 404,
                    'detail': 'Product was not found.',
                    'code': 'PRODUCT_NOT_FOUND',
                },
                status=status.HTTP_404_NOT_FOUND,
                content_type='application/problem+json',
            )
        command_id = str(data['command_id'])
        correlation_id = str(data['correlation_id']) if data.get('correlation_id') else None

        try:
            result = deactivate_product_stock_control(
                tenant=request.tenant,
                product=product,
                actor=request.user,
                command_id=command_id,
                correlation_id=correlation_id,
            )
        except ProductStockControlError as exc:
            problem = {
                'type': f'https://tjsys.local/problems/{exc.code}',
                'title': 'Stock control operation rejected',
                'status': exc.status_code,
                'detail': str(exc),
                'code': exc.code,
            }
            if exc.errors:
                problem['errors'] = exc.errors
            return Response(
                problem,
                status=exc.status_code,
                content_type='application/problem+json',
            )

        return Response(
            {
                'action': result.action,
                'policy_updated': result.policy_updated,
                'correlation_id': result.correlation_id,
            },
            status=status.HTTP_201_CREATED,
        )


class ProductStockControlReactivateView(APIView):
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
        InventoryCapabilityPermission,
    ]

    def post(self, request, product_id):
        from catalog.models import Product
        from inventory.serializers import (
            StockControlReactivateRequestSerializer,
        )

        serializer = StockControlReactivateRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            product = Product.all_objects.get(tenant=request.tenant, id=product_id)
        except Product.DoesNotExist:
            return Response(
                {
                    'type': 'https://tjsys.local/problems/product-not-found',
                    'title': 'Product not found',
                    'status': 404,
                    'detail': 'Product was not found.',
                    'code': 'PRODUCT_NOT_FOUND',
                },
                status=status.HTTP_404_NOT_FOUND,
                content_type='application/problem+json',
            )
        command_id = str(data['command_id'])
        correlation_id = str(data['correlation_id']) if data.get('correlation_id') else None
        initial_stocks = data.get('initial_stocks', [])

        try:
            result = reactivate_product_stock_control(
                tenant=request.tenant,
                product=product,
                actor=request.user,
                command_id=command_id,
                correlation_id=correlation_id,
                initial_stocks=initial_stocks,
            )
        except ProductStockControlError as exc:
            problem = {
                'type': f'https://tjsys.local/problems/{exc.code}',
                'title': 'Stock control operation rejected',
                'status': exc.status_code,
                'detail': str(exc),
                'code': exc.code,
            }
            if exc.errors:
                problem['errors'] = exc.errors
            return Response(
                problem,
                status=exc.status_code,
                content_type='application/problem+json',
            )

        return Response(
            {
                'action': result.action,
                'policy_updated': result.policy_updated,
                'correlation_id': result.correlation_id,
            },
            status=status.HTTP_201_CREATED,
        )
