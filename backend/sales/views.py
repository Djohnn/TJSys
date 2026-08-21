import csv

from django.core.exceptions import ObjectDoesNotExist
from django.db.models import Prefetch
from django.http import Http404, HttpResponse
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotAuthenticated, PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog.models import Product, Unit
from inventory.models import StockLocation
from inventory.services import InsufficientStock
from people.models import Person
from sales.models import (
    CashSession,
    Commission,
    CommissionRule,
    Consignment,
    ConsignmentItem,
    Sale,
    SaleItem,
    SaleRefund,
    SaleReturn,
)
from sales.permissions import SalesCapabilityPermission
from sales.serializers import (
    CashSessionSerializer,
    CloseCashSessionSerializer,
    CommissionRuleSerializer,
    CommissionSerializer,
    ConsignmentSerializer,
    CounterSaleSerializer,
    CreateSaleCancellationSerializer,
    CreateSaleRefundSerializer,
    CreateSaleReturnSerializer,
    OpenCashSessionSerializer,
    SaleCancellationSerializer,
    SaleRefundSerializer,
    SaleReturnSerializer,
    SaleSerializer,
    SyncBatchSerializer,
)
from sales.services import (
    CashSessionRequired,
    DuplicateIdempotencyKey,
    EmptySale,
    InsufficientReturnableQuantity,
    InvalidReturnQuantity,
    OpenCashSessionExists,
    PaymentMismatch,
    RefundAmountExceeded,
    SaleAlreadyCancelled,
    SaleHasReturns,
    SaleNotCompensable,
    cancel_sale,
    close_cash_session,
    create_counter_sale,
    create_sale_refund,
    create_sale_return,
    open_cash_session,
)
from tenancy.models import Branch
from tenancy.permissions import HasActiveTenant, HasVerifiedMFA


class MissingIdempotencyKey(ValueError):
    pass


_SALES_COMMAND_ERRORS = (
    Http404,
    ObjectDoesNotExist,
    DuplicateIdempotencyKey,
    InsufficientStock,
    CashSessionRequired,
    OpenCashSessionExists,
    RefundAmountExceeded,
    SaleHasReturns,
    SaleNotCompensable,
    PaymentMismatch,
    SaleAlreadyCancelled,
    InvalidReturnQuantity,
    InsufficientReturnableQuantity,
    EmptySale,
    ValueError,
)


def _problem(detail, code='invalid_sales_operation', status_code=400):
    return Response(
        {
            'type': f'https://zyrp.local/problems/{code}',
            'title': 'Sales operation rejected',
            'status': status_code,
            'detail': str(detail),
            'code': code,
        },
        status=status_code,
        content_type='application/problem+json',
    )


def _idempotency_key(request):
    value = request.headers.get('Idempotency-Key', '').strip()
    if not value:
        raise MissingIdempotencyKey('Idempotency-Key header is required.')
    return value


def _tenant_get(model, tenant, pk):
    return model.all_objects.get(tenant=tenant, pk=pk)


class CashSessionViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = CashSessionSerializer
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
        SalesCapabilityPermission,
    ]

    def get_queryset(self):
        queryset = (
            CashSession.objects.select_related('branch', 'operator')
            .filter(
                tenant=self.request.tenant,
            )
            .prefetch_related('movements')
        )
        branch_id = self.request.query_params.get('branch')
        operator_id = self.request.query_params.get('operator')
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)
        if operator_id:
            queryset = queryset.filter(operator_id=operator_id)
        if date_from:
            queryset = queryset.filter(opened_at__date__gte=date_from)
        if date_to:
            queryset = queryset.filter(opened_at__date__lte=date_to)
        return queryset

    def get_permissions(self):
        permissions = [IsAuthenticated(), HasActiveTenant()]
        if self.action in {'open', 'close'}:
            permissions.append(HasVerifiedMFA())
        permissions.append(SalesCapabilityPermission())
        return permissions

    def _handle_sales_error(self, exc):
        if isinstance(exc, (Http404, ObjectDoesNotExist)):
            return _problem('Resource not found.', 'not_found', status.HTTP_404_NOT_FOUND)
        if isinstance(exc, DuplicateIdempotencyKey):
            return _problem(exc, 'idempotency_conflict', status.HTTP_409_CONFLICT)
        if isinstance(exc, OpenCashSessionExists):
            return _problem(exc, 'open_cash_session_exists', status.HTTP_409_CONFLICT)
        if isinstance(exc, ValueError):
            return _problem(exc)
        raise exc

    @action(detail=False, methods=['post'])
    def open(self, request):
        serializer = OpenCashSessionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            session = open_cash_session(
                tenant=request.tenant,
                branch=_tenant_get(Branch, request.tenant, data['branch']),
                operator=request.user,
                opening_amount=data['opening_amount'],
                idempotency_key=_idempotency_key(request),
            )
        except _SALES_COMMAND_ERRORS as exc:
            return self._handle_sales_error(exc)
        return Response(
            CashSessionSerializer(session, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=['get'])
    def current(self, request):
        branch_id = request.query_params.get('branch')
        if not branch_id:
            return _problem('branch query parameter is required.')
        session = (
            self.get_queryset()
            .filter(
                branch_id=branch_id,
                operator=request.user,
                status='open',
            )
            .first()
        )
        if session is None:
            return _problem('Open cash session not found.', 'not_found', 404)
        return Response(CashSessionSerializer(session, context=self.get_serializer_context()).data)

    @action(detail=True, methods=['post'])
    def close(self, request, pk=None):
        serializer = CloseCashSessionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            session = close_cash_session(
                cash_session=self.get_object(),
                closing_amount=serializer.validated_data['closing_amount'],
                idempotency_key=_idempotency_key(request),
            )
        except _SALES_COMMAND_ERRORS as exc:
            return self._handle_sales_error(exc)
        return Response(CashSessionSerializer(session, context=self.get_serializer_context()).data)


class SaleViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = SaleSerializer
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
        SalesCapabilityPermission,
    ]
    MAX_EXPORT_ROWS = 1000

    def handle_exception(self, exc):
        if isinstance(exc, NotAuthenticated):
            return _problem(exc.detail, 'authentication_required', status.HTTP_401_UNAUTHORIZED)
        if isinstance(exc, PermissionDenied):
            return _problem(exc.detail, 'permission_denied', status.HTTP_403_FORBIDDEN)
        return super().handle_exception(exc)

    def get_queryset(self):
        queryset = (
            Sale.objects.select_related(
                'branch',
                'cash_session',
                'operator',
            )
            .filter(tenant=self.request.tenant)
            .prefetch_related(
                Prefetch(
                    'items',
                    queryset=SaleItem.all_objects.filter(
                        tenant=self.request.tenant,
                    ).select_related('unit'),
                ),
                'payments',
                Prefetch(
                    'refunds',
                    queryset=SaleRefund.all_objects.filter(
                        tenant=self.request.tenant,
                        status='completed',
                    ),
                    to_attr='_completed_refunds_for_serializer',
                ),
            )
        )
        branch_id = self.request.query_params.get('branch')
        cash_session_id = self.request.query_params.get('cash_session')
        operator_id = self.request.query_params.get('operator')
        customer_id = self.request.query_params.get('customer')
        status = self.request.query_params.get('status')
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)
        if cash_session_id:
            queryset = queryset.filter(cash_session_id=cash_session_id)
        if operator_id:
            queryset = queryset.filter(operator_id=operator_id)
        if customer_id:
            queryset = queryset.filter(customer_id=customer_id)
        if status:
            queryset = queryset.filter(status=status)
        if date_from:
            queryset = queryset.filter(created_at__date__gte=date_from)
        if date_to:
            queryset = queryset.filter(created_at__date__lte=date_to)
        return queryset

    def get_permissions(self):
        permissions = [IsAuthenticated(), HasActiveTenant()]
        if self.action in {'counter'}:
            permissions.append(HasVerifiedMFA())
        permissions.append(SalesCapabilityPermission())
        return permissions

    def _handle_sales_error(self, exc):
        if isinstance(exc, (Http404, ObjectDoesNotExist)):
            return _problem('Resource not found.', 'not_found', status.HTTP_404_NOT_FOUND)
        if isinstance(exc, DuplicateIdempotencyKey):
            return _problem(exc, 'idempotency_conflict', status.HTTP_409_CONFLICT)
        if isinstance(exc, InsufficientStock):
            return _problem(exc, 'insufficient_stock', status.HTTP_409_CONFLICT)
        if isinstance(exc, CashSessionRequired):
            return _problem(exc, 'cash_session_required', status.HTTP_409_CONFLICT)
        if isinstance(exc, RefundAmountExceeded):
            return _problem(exc, 'refund_amount_exceeded', status.HTTP_409_CONFLICT)
        if isinstance(exc, SaleHasReturns):
            return _problem(exc, 'sale_has_returns', status.HTTP_409_CONFLICT)
        if isinstance(exc, SaleNotCompensable):
            return _problem(exc, 'sale_not_compensable', status.HTTP_409_CONFLICT)
        if isinstance(exc, PaymentMismatch):
            return _problem(exc, 'payment_mismatch')
        if isinstance(exc, SaleAlreadyCancelled):
            return _problem(exc, 'sale_already_cancelled', status.HTTP_409_CONFLICT)
        if isinstance(exc, InvalidReturnQuantity):
            return _problem(exc, 'invalid_quantity', status.HTTP_422_UNPROCESSABLE_ENTITY)
        if isinstance(exc, InsufficientReturnableQuantity):
            return _problem(exc, 'insufficient_returnable', status.HTTP_409_CONFLICT)
        if isinstance(exc, MissingIdempotencyKey):
            return _problem(exc, 'validation_error', status.HTTP_400_BAD_REQUEST)
        if isinstance(exc, EmptySale):
            return _problem(exc)
        if isinstance(exc, ValueError):
            status_code = (
                status.HTTP_422_UNPROCESSABLE_ENTITY
                if self.action in {'returns', 'refund', 'cancel'}
                else status.HTTP_400_BAD_REQUEST
            )
            return _problem(exc, 'validation_error', status_code)
        raise exc

    @action(detail=False, methods=['post'])
    def counter(self, request):
        serializer = CounterSaleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            branch = _tenant_get(Branch, request.tenant, data['branch'])
            sale = create_counter_sale(
                tenant=request.tenant,
                branch=branch,
                operator=request.user,
                stock_location=_tenant_get(
                    StockLocation,
                    request.tenant,
                    data['stock_location'],
                ),
                items=[
                    {
                        'product': _tenant_get(Product, request.tenant, item['product']),
                        'unit': _tenant_get(Unit, request.tenant, item['unit']),
                        'quantity': item['quantity'],
                        'factor': item['factor'],
                        'discount_amount': item.get('discount_amount', 0),
                    }
                    for item in data['items']
                ],
                payments=data['payments'],
                idempotency_key=_idempotency_key(request),
                customer=(
                    _tenant_get(Person, request.tenant, data['customer'])
                    if data.get('customer')
                    else None
                ),
            )
        except _SALES_COMMAND_ERRORS as exc:
            return self._handle_sales_error(exc)
        return Response(
            SaleSerializer(sale, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['post'])
    def returns(self, request, pk=None):
        serializer = CreateSaleReturnSerializer(data=request.data)
        if not serializer.is_valid():
            return _problem(
                serializer.errors,
                'validation_error',
                status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        data = serializer.validated_data
        try:
            sale = self.get_object()
            sale_return = create_sale_return(
                tenant=request.tenant,
                sale=sale,
                items=[
                    {
                        'sale_item_id': str(item['sale_item_id']),
                        'quantity': item['quantity'],
                    }
                    for item in data['items']
                ],
                reason=data['reason'],
                idempotency_key=_idempotency_key(request),
                actor=request.user,
            )
        except _SALES_COMMAND_ERRORS as exc:
            return self._handle_sales_error(exc)
        return Response(
            SaleReturnSerializer(sale_return, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['post'])
    def refund(self, request, pk=None):
        serializer = CreateSaleRefundSerializer(data=request.data)
        if not serializer.is_valid():
            return _problem(
                serializer.errors,
                'validation_error',
                status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        data = serializer.validated_data
        try:
            sale = self.get_object()
            refund = create_sale_refund(
                tenant=request.tenant,
                sale=sale,
                method=data['method'],
                amount=data.get('amount'),
                reason=data['reason'],
                idempotency_key=_idempotency_key(request),
                actor=request.user,
            )
        except _SALES_COMMAND_ERRORS as exc:
            return self._handle_sales_error(exc)
        return Response(
            SaleRefundSerializer(refund, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )

    @returns.mapping.get
    def list_returns(self, request, pk=None):
        try:
            sale = self.get_object()
        except _SALES_COMMAND_ERRORS as exc:
            return self._handle_sales_error(exc)
        returns_queryset = SaleReturn.all_objects.filter(
            tenant=request.tenant,
            sale=sale,
        ).prefetch_related('items')
        return Response(
            SaleReturnSerializer(returns_queryset, many=True).data,
        )

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        serializer = CreateSaleCancellationSerializer(data=request.data)
        if not serializer.is_valid():
            return _problem(
                serializer.errors,
                'validation_error',
                status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        data = serializer.validated_data
        try:
            sale = self.get_object()
            cancellation = cancel_sale(
                tenant=request.tenant,
                sale=sale,
                reason=data['reason'],
                idempotency_key=_idempotency_key(request),
                actor=request.user,
            )
        except _SALES_COMMAND_ERRORS as exc:
            return self._handle_sales_error(exc)
        return Response(
            SaleCancellationSerializer(cancellation, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=['get'])
    def export(self, request):
        queryset = self.get_queryset()
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        branch_id = request.query_params.get('branch')
        if date_from:
            queryset = queryset.filter(created_at__date__gte=date_from)
        if date_to:
            queryset = queryset.filter(created_at__date__lte=date_to)
        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)
        queryset = queryset.order_by('-created_at')[: self.MAX_EXPORT_ROWS]
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="sales-export.csv"'
        writer = csv.writer(response)
        writer.writerow(
            [
                'id',
                'created_at',
                'branch',
                'operator',
                'customer',
                'status',
                'gross_total',
                'discount_total',
                'net_total',
                'items_count',
                'payment_methods',
            ]
        )
        for sale in queryset:
            writer.writerow(
                [
                    sale.id,
                    sale.created_at,
                    sale.branch_id,
                    sale.operator_id,
                    sale.customer_id or '',
                    sale.status,
                    sale.gross_total,
                    sale.discount_total,
                    sale.net_total,
                    sale.items.count(),
                    ', '.join(sale.payments.values_list('method', flat=True).distinct()),
                ]
            )
        return response


def _route_batch_operation(request, op):
    t = op['type']
    payload = op['payload']

    if t == 'sale:create':
        serializer = CounterSaleSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        branch = _tenant_get(Branch, request.tenant, data['branch'])
        sale = create_counter_sale(
            tenant=request.tenant,
            branch=branch,
            operator=request.user,
            stock_location=_tenant_get(StockLocation, request.tenant, data['stock_location']),
            items=[
                {
                    'product': _tenant_get(Product, request.tenant, item['product']),
                    'unit': _tenant_get(Unit, request.tenant, item['unit']),
                    'quantity': item['quantity'],
                    'factor': item['factor'],
                    'discount_amount': item.get('discount_amount', 0),
                }
                for item in data['items']
            ],
            payments=data['payments'],
            idempotency_key=op['idempotency_key'],
        )
        return SaleSerializer(sale).data, None

    if t == 'cash-session:open':
        serializer = OpenCashSessionSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        session = open_cash_session(
            tenant=request.tenant,
            branch=_tenant_get(Branch, request.tenant, data['branch']),
            operator=request.user,
            opening_amount=data['opening_amount'],
            idempotency_key=op['idempotency_key'],
        )
        return CashSessionSerializer(session).data, None

    if t == 'cash-session:close':
        serializer = CloseCashSessionSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        session_id = payload.get('session_id')
        if not session_id:
            raise ValueError('session_id is required')
        session = _tenant_get(CashSession, request.tenant, session_id)
        session = close_cash_session(
            cash_session=session,
            closing_amount=serializer.validated_data['closing_amount'],
            idempotency_key=op['idempotency_key'],
        )
        return CashSessionSerializer(session).data, None

    raise ValueError(f'Unknown operation type: {t}')


class SyncBatchView(APIView):
    permission_classes = [IsAuthenticated, HasActiveTenant, HasVerifiedMFA]

    def post(self, request):
        serializer = SyncBatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        operations = serializer.validated_data['operations']

        results = []
        for op in operations:
            try:
                data, _ = _route_batch_operation(request, op)
                results.append(
                    {
                        'idempotency_key': op['idempotency_key'],
                        'type': op['type'],
                        'status': 'synced',
                        'data': data,
                    }
                )
            except DuplicateIdempotencyKey:
                results.append(
                    {
                        'idempotency_key': op['idempotency_key'],
                        'type': op['type'],
                        'status': 'conflict',
                        'error': 'Idempotency key already used with a different payload.',
                    }
                )
            except (CashSessionRequired, OpenCashSessionExists) as exc:
                results.append(
                    {
                        'idempotency_key': op['idempotency_key'],
                        'type': op['type'],
                        'status': 'conflict',
                        'error': str(exc),
                    }
                )
            except (ValueError, ObjectDoesNotExist) as exc:
                results.append(
                    {
                        'idempotency_key': op['idempotency_key'],
                        'type': op['type'],
                        'status': 'failed',
                        'error': str(exc),
                    }
                )

        return Response({'results': results})


# =============================================================================
# F4 — Consignment
# =============================================================================


class ConsignmentViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ConsignmentSerializer
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
        SalesCapabilityPermission,
    ]

    def get_queryset(self):
        queryset = (
            Consignment.objects.select_related('branch', 'operator', 'customer')
            .filter(tenant=self.request.tenant)
            .prefetch_related(
                Prefetch(
                    'items',
                    queryset=ConsignmentItem.all_objects.filter(
                        tenant=self.request.tenant,
                    ).select_related('product', 'unit'),
                ),
            )
        )
        branch_id = self.request.query_params.get('branch')
        operator_id = self.request.query_params.get('operator')
        customer_id = self.request.query_params.get('customer')
        status = self.request.query_params.get('status')
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)
        if operator_id:
            queryset = queryset.filter(operator_id=operator_id)
        if customer_id:
            queryset = queryset.filter(customer_id=customer_id)
        if status:
            queryset = queryset.filter(status=status)
        if date_from:
            queryset = queryset.filter(created_at__date__gte=date_from)
        if date_to:
            queryset = queryset.filter(created_at__date__lte=date_to)
        return queryset

    def _handle_sales_error(self, exc):
        if isinstance(exc, (Http404, ObjectDoesNotExist)):
            return _problem('Resource not found.', 'not_found', status.HTTP_404_NOT_FOUND)
        if isinstance(exc, DuplicateIdempotencyKey):
            return _problem(exc, 'idempotency_conflict', status.HTTP_409_CONFLICT)
        if isinstance(exc, ValueError):
            return _problem(exc)
        raise exc

    @action(detail=True, methods=['post'])
    def convert(self, request, pk=None):
        consignment = self.get_object()
        if consignment.status not in ('draft', 'active'):
            return _problem('Consignment cannot be converted.', 'invalid_status', status.HTTP_409_CONFLICT)
        try:
            consignment.status = 'closed'
            consignment.actual_return_date = timezone.now().date()
            consignment.save()
            return Response(ConsignmentSerializer(consignment, context=self.get_serializer_context()).data)
        except _SALES_COMMAND_ERRORS as exc:
            return self._handle_sales_error(exc)


# =============================================================================
# F4 — Commission
# =============================================================================


class CommissionRuleViewSet(viewsets.ModelViewSet):
    serializer_class = CommissionRuleSerializer
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
        SalesCapabilityPermission,
    ]

    def get_queryset(self):
        queryset = CommissionRule.objects.filter(tenant=self.request.tenant)
        is_active = self.request.query_params.get('is_active')
        rule_type = self.request.query_params.get('rule_type')
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
        if rule_type:
            queryset = queryset.filter(rule_type=rule_type)
        return queryset

    def get_permissions(self):
        permissions = [IsAuthenticated(), HasActiveTenant()]
        if self.action in {'create', 'update', 'partial_update', 'destroy'}:
            permissions.append(HasVerifiedMFA())
        permissions.append(SalesCapabilityPermission())
        return permissions

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.tenant)

    def perform_update(self, serializer):
        serializer.save(tenant=self.request.tenant)


class CommissionViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = CommissionSerializer
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
        SalesCapabilityPermission,
    ]

    def get_queryset(self):
        queryset = Commission.objects.select_related('sale', 'rule', 'operator').filter(
            tenant=self.request.tenant,
        )
        status = self.request.query_params.get('status')
        operator_id = self.request.query_params.get('operator')
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        if status:
            queryset = queryset.filter(status=status)
        if operator_id:
            queryset = queryset.filter(operator_id=operator_id)
        if date_from:
            queryset = queryset.filter(created_at__date__gte=date_from)
        if date_to:
            queryset = queryset.filter(created_at__date__lte=date_to)
        return queryset

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        commission = self.get_object()
        if commission.status != 'pending':
            return _problem('Commission is not pending.', 'invalid_status', status.HTTP_409_CONFLICT)
        commission.status = 'approved'
        commission.approved_at = timezone.now()
        commission.save()
        return Response(CommissionSerializer(commission).data)

    @action(detail=True, methods=['post'])
    def pay(self, request, pk=None):
        commission = self.get_object()
        if commission.status != 'approved':
            return _problem('Commission is not approved.', 'invalid_status', status.HTTP_409_CONFLICT)
        commission.status = 'paid'
        commission.paid_at = timezone.now()
        commission.save()
        return Response(CommissionSerializer(commission).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        commission = self.get_object()
        if commission.status not in ('pending', 'approved'):
            return _problem('Commission cannot be cancelled.', 'invalid_status', status.HTTP_409_CONFLICT)
        commission.status = 'cancelled'
        commission.save()
        return Response(CommissionSerializer(commission).data)
