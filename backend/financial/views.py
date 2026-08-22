import csv
from datetime import date
from decimal import Decimal

from django.db.models import Count, F, Sum
from django.db.models.functions import TruncDate
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import serializers, viewsets
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

        by_status = (
            queryset.values('status')
            .annotate(count=Count('id'), total=Sum('net_total'))
            .order_by('status')
        )

        by_payment_method = (
            queryset.values(payment_method=F('payments__method'))
            .annotate(count=Count('id'), total=Sum('net_total'))
            .order_by('payment_method')
        )

        by_day = (
            queryset.annotate(day=TruncDate('created_at'))
            .values('day')
            .annotate(count=Count('id'), total=Sum('net_total'))
            .order_by('day')
        )

        return Response(
            {
                'count': totals['count'],
                'net_total': totals['net_total'] or Decimal('0.00'),
                'by_status': list(by_status),
                'by_payment_method': list(by_payment_method),
                'by_day': list(by_day),
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

        queryset = StockBalance.all_objects.select_related(
            'product',
            'location',
        ).filter(tenant=request.tenant).annotate(
            available_quantity=F('quantity') - F('reserved'),
        )
        branch = self.branch(request)
        if branch:
            queryset = queryset.filter(location__branch=branch)

        items = [
            {
                'product_id': str(balance.product_id),
                'sku': balance.product.sku,
                'product_name': balance.product.name,
                'location_id': str(balance.location_id),
                'location_name': balance.location.name,
                'quantity': balance.quantity,
                'reserved': balance.reserved,
                'available': balance.available_quantity,
                'critical': balance.available_quantity <= 0,
            }
            for balance in queryset[:MAX_EXPORT_ROWS]
        ]

        summary = queryset.aggregate(
            total_products=Count('product_id', distinct=True),
            total_quantity=Sum('quantity'),
            total_reserved=Sum('reserved'),
            total_available=Sum('available_quantity'),
        )

        critical_count = queryset.filter(available_quantity__lte=0).count()

        return Response(
            {
                'items': items,
                'summary': {
                    'total_products': summary['total_products'] or 0,
                    'total_quantity': summary['total_quantity'] or 0,
                    'total_reserved': summary['total_reserved'] or 0,
                    'total_available': summary['total_available'] or 0,
                    'critical_items': critical_count,
                },
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
# Sprint F11 — DRE API (Demonstração do Resultado do Exercício)
class DRELineSerializer(serializers.Serializer):
    label = serializers.CharField()  # type: ignore[assignment]
    value = serializers.DecimalField(max_digits=18, decimal_places=2)
    percentage = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        required=False,
        allow_null=True,
    )
    children = serializers.ListField(child=serializers.DictField(), required=False, default=list)


class DREReportSerializer(serializers.Serializer):
    period_from = serializers.DateField()
    period_to = serializers.DateField()
    branch = serializers.DictField(required=False, allow_null=True)
    revenue = DRELineSerializer()
    deductions = DRELineSerializer()
    net_revenue = DRELineSerializer()
    cost_of_goods = DRELineSerializer()
    gross_profit = DRELineSerializer()
    operating_expenses = DRELineSerializer()
    operating_result = DRELineSerializer()
    result_before_tax = DRELineSerializer()
    income_tax = DRELineSerializer()
    net_result = DRELineSerializer()


class DREReportView(ReportView):
    def get(self, request):
        date_from, date_to = self.period(request)
        branch = self.branch(request)

        from purchasing.models import PurchaseOrder
        from sales.models import Sale

        sales_queryset = Sale.all_objects.filter(
            tenant=request.tenant,
            created_at__date__range=(date_from, date_to),
        )
        if branch:
            sales_queryset = sales_queryset.filter(branch=branch)

        purchase_queryset = PurchaseOrder.all_objects.filter(
            tenant=request.tenant,
            created_at__date__range=(date_from, date_to),
        )
        if branch:
            purchase_queryset = purchase_queryset.filter(branch=branch)

        gross_revenue = sales_queryset.aggregate(total=Sum('net_total'))['total'] or Decimal('0.00')
        total_purchases = purchase_queryset.aggregate(total=Sum('items_total'))['total'] or Decimal(
            '0.00'
        )
        total_billing_discounts = sales_queryset.aggregate(total=Sum('discount_total'))[
            'total'
        ] or Decimal('0.00')
        total_billing_taxes = Decimal('0.00')

        deductions = total_billing_discounts + total_billing_taxes
        net_revenue = gross_revenue - deductions
        cost_of_goods = total_purchases
        gross_profit = net_revenue - cost_of_goods

        operating_expenses = Payable.all_objects.filter(
            tenant=request.tenant,
            due_date__range=(date_from, date_to),
            description__icontains='despesa',
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

        if branch:
            operating_expenses = Payable.all_objects.filter(
                tenant=request.tenant,
                branch=branch,
                due_date__range=(date_from, date_to),
                description__icontains='despesa',
            ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

        operating_result = gross_profit - operating_expenses
        result_before_tax = operating_result
        income_tax = (
            result_before_tax * Decimal('0.25') if result_before_tax > 0 else Decimal('0.00')
        )
        net_result = result_before_tax - income_tax

        def make_line(label, value, base=net_revenue, children=None):
            percentage = (value / base * 100) if base else Decimal('0.00')
            return {
                'label': label,
                'value': str(value),
                'percentage': str(percentage.quantize(Decimal('0.01'))),
                'children': children or [],
            }

        branch_data = None
        if branch:
            branch_data = {'id': str(branch.id), 'name': branch.name}

        dre = {
            'period_from': str(date_from),
            'period_to': str(date_to),
            'branch': branch_data,
            'revenue': make_line('Receita Bruta', gross_revenue),
            'deductions': make_line('Deduções', deductions),
            'net_revenue': make_line('Receita Líquida', net_revenue),
            'cost_of_goods': make_line('Custo dos Produtos/Serviços', cost_of_goods),
            'gross_profit': make_line('Lucro Bruto', gross_profit),
            'operating_expenses': make_line('Despesas Operacionais', operating_expenses),
            'operating_result': make_line('Resultado Operacional', operating_result),
            'result_before_tax': make_line('Resultado Antes do IR/CSLL', result_before_tax),
            'income_tax': make_line('IR/CSLL (25%)', income_tax),
            'net_result': make_line('Resultado Líquido', net_result),
        }

        if request.query_params.get('export') == 'csv':
            return self._csv(dre)
        return Response(dre)

    @staticmethod
    def _csv(dre):
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="dre-report.csv"'
        writer = csv.writer(response)
        writer.writerow(['line', 'value', 'percentage'])
        lines = [
            ('Receita Bruta', dre['revenue']),
            ('Deduções', dre['deductions']),
            ('Receita Líquida', dre['net_revenue']),
            ('Custo dos Produtos/Serviços', dre['cost_of_goods']),
            ('Lucro Bruto', dre['gross_profit']),
            ('Despesas Operacionais', dre['operating_expenses']),
            ('Resultado Operacional', dre['operating_result']),
            ('Resultado Antes do IR/CSLL', dre['result_before_tax']),
            ('IR/CSLL (25%)', dre['income_tax']),
            ('Resultado Líquido', dre['net_result']),
        ]
        for label, line in lines:
            writer.writerow([label, line['value'], line['percentage']])
        return response
