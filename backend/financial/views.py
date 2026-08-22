import csv
from datetime import date
from decimal import Decimal

from django.db.models import Count, Sum
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from financial.models import CashflowEntry, Payable, Receivable
from financial.permissions import FinancialReportingPermission
from financial.serializers import CashflowEntrySerializer, PayableSerializer, ReceivableSerializer
from financial.services import cashflow_projection
from tenancy.models import Branch
from tenancy.permissions import HasActiveTenant, HasCapability


class CashflowEntryViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = CashflowEntrySerializer
    permission_classes = [IsAuthenticated, HasActiveTenant, HasCapability]
    required_capability = 'financial.view'

    def get_queryset(self):
        queryset = CashflowEntry.all_objects.filter(tenant=self.request.tenant).select_related(
            'branch'
        )
        if date_from := self.request.query_params.get('date_from'):
            queryset = queryset.filter(effective_date__gte=date_from)
        if date_to := self.request.query_params.get('date_to'):
            queryset = queryset.filter(effective_date__lte=date_to)
        if branch := self.request.query_params.get('branch'):
            queryset = queryset.filter(branch_id=branch)
        return queryset.order_by('effective_date', 'created_at')


MAX_EXPORT_ROWS = 1000


def _parse_date(value, default):
    return date.fromisoformat(value) if value else default


class ReportView(APIView):
    permission_classes = [IsAuthenticated, HasActiveTenant, FinancialReportingPermission]

    def period(self, request):
        today = timezone.localdate()
        return (
            _parse_date(request.query_params.get('date_from'), today.replace(day=1)),
            _parse_date(request.query_params.get('date_to'), today),
        )

    def branch(self, request):
        branch_id = request.query_params.get('branch')
        if not branch_id:
            return None
        return Branch.objects.filter(tenant=request.tenant, id=branch_id).first()

    def export_limit_problem(self, request):
        try:
            limit = int(request.query_params.get('limit', MAX_EXPORT_ROWS))
        except ValueError:
            limit = MAX_EXPORT_ROWS + 1
        if limit < 1 or limit > MAX_EXPORT_ROWS:
            return Response(
                {
                    'type': 'https://zyrp.local/problems/export-limit-exceeded',
                    'title': 'Export limit exceeded',
                    'status': 400,
                    'detail': f'Export limit must be between 1 and {MAX_EXPORT_ROWS}.',
                    'code': 'export_limit_exceeded',
                },
                status=400,
            )
        return None


class SalesReportView(ReportView):
    def get(self, request):
        from sales.models import Sale

        date_from, date_to = self.period(request)
        queryset = Sale.all_objects.filter(
            tenant=request.tenant,
            created_at__date__range=(date_from, date_to),
        )
        branch = self.branch(request)
        if branch:
            queryset = queryset.filter(branch=branch)
        totals = queryset.aggregate(count=Count('id'), net_total=Sum('net_total'))
        return Response(
            {
                'count': totals['count'],
                'net_total': totals['net_total'] or Decimal('0.00'),
            }
        )


class CashClosingReportView(ReportView):
    def get(self, request):
        from sales.models import CashSession

        date_from, date_to = self.period(request)
        queryset = CashSession.all_objects.filter(
            tenant=request.tenant,
            opened_at__date__range=(date_from, date_to),
        )
        branch = self.branch(request)
        if branch:
            queryset = queryset.filter(branch=branch)
        return Response(
            {
                'sessions': [
                    {
                        'id': str(session.id),
                        'status': session.status,
                        'expected_amount': session.expected_amount,
                        'closing_amount': session.closing_amount,
                    }
                    for session in queryset[:MAX_EXPORT_ROWS]
                ]
            }
        )


class InventoryReportView(ReportView):
    def get(self, request):
        from inventory.models import StockBalance

        queryset = StockBalance.all_objects.select_related('product', 'location').filter(
            tenant=request.tenant,
        )
        branch = self.branch(request)
        if branch:
            queryset = queryset.filter(location__branch=branch)
        return Response(
            {
                'items': [
                    {
                        'product_id': str(balance.product_id),
                        'sku': balance.product.sku,
                        'location_id': str(balance.location_id),
                        'quantity': balance.quantity,
                        'reserved': balance.reserved,
                        'available': balance.available,
                        'critical': balance.available <= 0,
                    }
                    for balance in queryset[:MAX_EXPORT_ROWS]
                ]
            }
        )


class FinancialReportView(ReportView):
    def get(self, request):
        limit_problem = self.export_limit_problem(request)
        if limit_problem:
            return limit_problem
        limit = int(request.query_params.get('limit', MAX_EXPORT_ROWS))
        payables = Payable.all_objects.filter(tenant=request.tenant).order_by('due_date')[:limit]
        receivables = Receivable.all_objects.filter(
            tenant=request.tenant,
        ).order_by('due_date')[:limit]
        payable_rows = [self._row(item) for item in payables]
        receivable_rows = [self._row(item) for item in receivables]
        if request.query_params.get('export') == 'csv':
            return self._csv(payable_rows, receivable_rows)
        return Response({'payables': payable_rows, 'receivables': receivable_rows})

    @staticmethod
    def _row(item):
        return {
            'id': str(item.id),
            'description': item.description,
            'amount': item.amount,
            'status': item.status,
            'due_date': item.due_date,
        }

    @staticmethod
    def _csv(payables, receivables):
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="financial-report.csv"'
        writer = csv.writer(response)
        writer.writerow(['kind', 'id', 'description', 'amount', 'status', 'due_date'])
        for kind, rows in [('payable', payables), ('receivable', receivables)]:
            for row in rows:
                writer.writerow(
                    [
                        kind,
                        row['id'],
                        row['description'],
                        row['amount'],
                        row['status'],
                        row['due_date'] or '',
                    ]
                )
        return response


class CashflowReportView(ReportView):
    def get(self, request):
        date_from, date_to = self.period(request)
        return Response(
            cashflow_projection(
                tenant=request.tenant,
                branch=self.branch(request),
                date_from=date_from,
                date_to=date_to,
            )
        )


class PendingOperationsReportView(ReportView):
    def get(self, request):
        from fiscal.models import FiscalDocument
        from outbox.models import OutboxMessage

        fiscal = (
            FiscalDocument.all_objects.filter(
                tenant=request.tenant,
                status__in=['PENDING', 'PROCESSING', 'REJECTED', 'FAILED'],
            )
            .values('status')
            .annotate(count=Count('id'))
            .order_by('status')
        )
        outbox = (
            OutboxMessage.objects.filter(
                tenant_id=str(request.tenant.id),
                status__in=['PENDING', 'FAILED'],
            )
            .values('status')
            .annotate(count=Count('id'))
            .order_by('status')
        )
        return Response(
            {
                'fiscal': list(fiscal),
                'offline_or_outbox': list(outbox),
            }
        )


class PayableViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = PayableSerializer
    permission_classes = [IsAuthenticated, HasActiveTenant, FinancialReportingPermission]

    def get_queryset(self):
        queryset = Payable.all_objects.filter(tenant=self.request.tenant)
        status = self.request.query_params.get('status')
        branch_id = self.request.query_params.get('branch')
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        if status:
            queryset = queryset.filter(status=status)
        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)
        if date_from:
            queryset = queryset.filter(due_date__gte=date_from)
        if date_to:
            queryset = queryset.filter(due_date__lte=date_to)
        return queryset.order_by('-created_at')


class ReceivableViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ReceivableSerializer
    permission_classes = [IsAuthenticated, HasActiveTenant, FinancialReportingPermission]

    def get_queryset(self):
        queryset = Receivable.all_objects.filter(tenant=self.request.tenant)
        status = self.request.query_params.get('status')
        branch_id = self.request.query_params.get('branch')
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        if status:
            queryset = queryset.filter(status=status)
        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)
        if date_from:
            queryset = queryset.filter(due_date__gte=date_from)
        if date_to:
            queryset = queryset.filter(due_date__lte=date_to)
        return queryset.order_by('-created_at')


# =============================================================================
# Sprint F10 — Fiscal Compensation API
# =============================================================================


from rest_framework import serializers
from rest_framework.decorators import action
from financial.models import FiscalCompensation


class FiscalCompensationSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    fiscal_document = serializers.UUIDField(required=False, allow_null=True)
    branch = serializers.UUIDField()
    customer_name = serializers.CharField(max_length=200, required=False, allow_blank=True, default='')
    supplier_name = serializers.CharField(max_length=200, required=False, allow_blank=True, default='')
    code = serializers.CharField(max_length=40)
    compensation_type = serializers.ChoiceField(
        choices=[
            ('credit', 'Crédito'),
            ('debit', 'Débito'),
            ('both', 'Ambos'),
        ],
        default='both',
    )
    status = serializers.ChoiceField(
        choices=[
            ('pending', 'Pendente'),
            ('approved', 'Aprovado'),
            ('rejected', 'Rejeitado'),
            ('processed', 'Processado'),
            ('cancelled', 'Cancelado'),
        ],
        default='pending',
    )
    amount = serializers.DecimalField(max_digits=18, decimal_places=2)
    compensated_amount = serializers.DecimalField(max_digits=18, decimal_places=2, default=0)
    remaining_amount = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    due_date = serializers.DateField(required=False, allow_null=True)
    compensated_at = serializers.DateTimeField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)


class FiscalCompensationViewSet(viewsets.ModelViewSet):
    serializer_class = FiscalCompensationSerializer
    permission_classes = [IsAuthenticated, HasActiveTenant, HasCapability]
    required_capability = 'financial.view'

    def get_queryset(self):
        return FiscalCompensation.objects.select_related(
            'fiscal_document',
            'branch',
        ).filter(tenant=self.request.tenant)

    def get_permissions(self):
        permissions = [IsAuthenticated(), HasActiveTenant()]
        write_actions = {'create', 'update', 'partial_update', 'destroy', 'approve', 'process', 'cancel'}
        if self.action in write_actions:
            from tenancy.permissions import HasVerifiedMFA
            permissions.append(HasVerifiedMFA())
        permissions.append(HasCapability(self.required_capability))
        return permissions

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.tenant)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        compensation = self.get_object()
        if compensation.status != 'pending':
            return Response({'detail': 'Only pending compensations can be approved.'}, status=400)
        compensation.status = 'approved'
        compensation.full_clean()
        compensation.save()
        return Response(FiscalCompensationSerializer(compensation).data)

    @action(detail=True, methods=['post'])
    def process(self, request, pk=None):
        compensation = self.get_object()
        if compensation.status != 'approved':
            return Response({'detail': 'Only approved compensations can be processed.'}, status=400)
        compensation.status = 'processed'
        compensation.compensated_at = timezone.now()
        compensation.full_clean()
        compensation.save()
        return Response(FiscalCompensationSerializer(compensation).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        compensation = self.get_object()
        if compensation.status in ('cancelled', 'processed'):
            return Response({'detail': 'Cancelled or processed compensations cannot be cancelled.'}, status=400)
        compensation.status = 'cancelled'
        compensation.full_clean()
        compensation.save()
        return Response(FiscalCompensationSerializer(compensation).data)
