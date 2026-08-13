from decimal import Decimal

from django.db.models import Count, Sum
from rest_framework import serializers

from sales.models import (
    CashMovement,
    CashSession,
    Sale,
    SaleCancellation,
    SaleItem,
    SalePayment,
    SaleRefund,
    SaleReturn,
    SaleReturnItem,
)
from sales.validators import normalize_reason


def _money(value):
    return Decimal(str(value)).quantize(Decimal('0.01'))


class CashMovementSerializer(serializers.ModelSerializer):
    class Meta:
        model = CashMovement
        fields = [
            'id',
            'movement_type',
            'amount',
            'payment_method',
            'reference',
            'notes',
            'created_at',
        ]
        read_only_fields = fields


class CashSessionSerializer(serializers.ModelSerializer):
    movements = CashMovementSerializer(many=True, read_only=True)

    # Secao 2 - Resumo Geral das Vendas
    sales_count = serializers.SerializerMethodField()
    total_sales = serializers.SerializerMethodField()
    gross_total = serializers.SerializerMethodField()
    discount_total = serializers.SerializerMethodField()
    surcharge_total = serializers.SerializerMethodField()
    net_total = serializers.SerializerMethodField()
    average_ticket = serializers.SerializerMethodField()

    # Secao 3 - Vendas por Forma de Pagamento
    payment_methods = serializers.SerializerMethodField()

    # Secao 4 - Movimentacoes (separadas por tipo)
    cash_ins = serializers.SerializerMethodField()
    cash_outs = serializers.SerializerMethodField()
    cash_ins_total = serializers.SerializerMethodField()
    cash_outs_total = serializers.SerializerMethodField()

    # Devolucoes / Estornos
    returns_total = serializers.SerializerMethodField()

    # Outras movimentacoes
    expenses = serializers.SerializerMethodField()
    expenses_total = serializers.SerializerMethodField()
    other_in_total = serializers.SerializerMethodField()
    other_out_total = serializers.SerializerMethodField()

    # Secao 6 - Conferencia do Dinheiro
    cash_breakdown = serializers.SerializerMethodField()

    # Diferenca
    difference = serializers.SerializerMethodField()

    # Operador / data abertura (ja existem nos fields)

    def _sales_qs(self, obj):
        return obj.sales.filter(status='confirmed')

    def get_sales_count(self, obj):
        return self._sales_qs(obj).count()

    def get_total_sales(self, obj):
        total = self._sales_qs(obj).aggregate(
            total=Sum('net_total'),
        )['total'] or Decimal('0')
        return f'{total:.2f}'

    def get_gross_total(self, obj):
        total = self._sales_qs(obj).aggregate(
            total=Sum('gross_total'),
        )['total'] or Decimal('0')
        return f'{total:.2f}'

    def get_discount_total(self, obj):
        total = self._sales_qs(obj).aggregate(
            total=Sum('discount_total'),
        )['total'] or Decimal('0')
        return f'{total:.2f}'

    def get_surcharge_total(self, obj):
        sales = self._sales_qs(obj)
        gross = sales.aggregate(total=Sum('gross_total'))['total'] or Decimal('0')
        discount = sales.aggregate(total=Sum('discount_total'))['total'] or Decimal('0')
        net = sales.aggregate(total=Sum('net_total'))['total'] or Decimal('0')
        surcharge = _money(net - (gross - discount))
        return max(surcharge, Decimal('0')).quantize(Decimal('0.01'))

    def get_net_total(self, obj):
        total = self._sales_qs(obj).aggregate(
            total=Sum('net_total'),
        )['total'] or Decimal('0')
        return f'{total:.2f}'

    def get_average_ticket(self, obj):
        qs = self._sales_qs(obj)
        count = qs.count()
        if count == 0:
            return '0.00'
        total = qs.aggregate(total=Sum('net_total'))['total'] or Decimal('0')
        avg = _money(total / count)
        return f'{avg:.2f}'

    def get_payment_methods(self, obj):
        qs = (
            SalePayment.objects.filter(
                sale__cash_session=obj,
                sale__status='confirmed',
            )
            .values('method')
            .annotate(
                total=Sum('amount'),
                count=Count('id'),
            )
        )
        result = {}
        for row in qs:
            result[row['method']] = {
                'total': f'{_money(row["total"]):.2f}',
                'count': row['count'],
            }
        return result

    def _movements_filter(self, obj, movement_type):
        return obj.movements.filter(movement_type=movement_type).order_by('created_at')

    def get_cash_ins(self, obj):
        qs = self._movements_filter(obj, 'cash_in')
        return CashMovementSerializer(qs, many=True).data

    def get_cash_outs(self, obj):
        qs = self._movements_filter(obj, 'cash_out')
        return CashMovementSerializer(qs, many=True).data

    def get_cash_ins_total(self, obj):
        total = self._movements_filter(obj, 'cash_in').aggregate(
            total=Sum('amount'),
        )['total'] or Decimal('0')
        return f'{total:.2f}'

    def get_cash_outs_total(self, obj):
        total = self._movements_filter(obj, 'cash_out').aggregate(
            total=Sum('amount'),
        )['total'] or Decimal('0')
        return f'{total:.2f}'

    def get_returns_total(self, obj):
        # TODO: implementar modelo de devolucoes
        return '0.00'

    def get_expenses(self, obj):
        qs = self._movements_filter(obj, 'expense')
        return CashMovementSerializer(qs, many=True).data

    def get_expenses_total(self, obj):
        total = self._movements_filter(obj, 'expense').aggregate(
            total=Sum('amount'),
        )['total'] or Decimal('0')
        return f'{total:.2f}'

    def get_other_in_total(self, obj):
        total = self._movements_filter(obj, 'other_in').aggregate(
            total=Sum('amount'),
        )['total'] or Decimal('0')
        return f'{total:.2f}'

    def get_other_out_total(self, obj):
        total = self._movements_filter(obj, 'other_out').aggregate(
            total=Sum('amount'),
        )['total'] or Decimal('0')
        return f'{total:.2f}'

    def get_cash_breakdown(self, obj):
        opening = _money(obj.opening_amount)
        sales = _money(
            SalePayment.objects.filter(
                sale__cash_session=obj,
                sale__status='confirmed',
            ).aggregate(total=Sum('amount'))['total']
            or Decimal('0'),
        )
        cash_ins = _money(
            self._movements_filter(obj, 'cash_in').aggregate(
                total=Sum('amount'),
            )['total']
            or Decimal('0'),
        )
        cash_outs = _money(
            self._movements_filter(obj, 'cash_out').aggregate(
                total=Sum('amount'),
            )['total']
            or Decimal('0'),
        )
        expenses = _money(
            self._movements_filter(obj, 'expense').aggregate(
                total=Sum('amount'),
            )['total']
            or Decimal('0'),
        )
        other_in = _money(
            self._movements_filter(obj, 'other_in').aggregate(
                total=Sum('amount'),
            )['total']
            or Decimal('0'),
        )
        other_out = _money(
            self._movements_filter(obj, 'other_out').aggregate(
                total=Sum('amount'),
            )['total']
            or Decimal('0'),
        )
        expected = _money(opening + sales + cash_ins + other_in - cash_outs - expenses - other_out)
        return {
            'opening': f'{opening:.2f}',
            'cash_sales': f'{sales:.2f}',
            'cash_ins': f'{cash_ins:.2f}',
            'cash_outs': f'{cash_outs:.2f}',
            'expenses': f'{expenses:.2f}',
            'other_in': f'{other_in:.2f}',
            'other_out': f'{other_out:.2f}',
            'expected_amount': f'{expected:.2f}',
            'closing_amount': (
                f'{_money(obj.closing_amount):.2f}' if obj.closing_amount is not None else None
            ),
        }

    def get_difference(self, obj):
        if obj.closing_amount is not None:
            diff = _money(obj.expected_amount - obj.closing_amount)
            return str(diff)
        return None

    class Meta:
        model = CashSession
        fields = [
            # Info basica
            'id',
            'branch',
            'operator',
            'status',
            'opened_at',
            'closed_at',
            'version',
            # Secao 1 - Abertura
            'opening_amount',
            # Secao 2 - Resumo Vendas
            'sales_count',
            'total_sales',
            'gross_total',
            'discount_total',
            'surcharge_total',
            'net_total',
            'average_ticket',
            # Secao 3 - Formas de Pagamento
            'payment_methods',
            # Secao 4 - Movimentacoes
            'cash_ins',
            'cash_outs',
            'cash_ins_total',
            'cash_outs_total',
            # Devolucoes
            'returns_total',
            # Outras movimentacoes
            'expenses',
            'expenses_total',
            'other_in_total',
            'other_out_total',
            # Secao 6 - Conferencia
            'cash_breakdown',
            'expected_amount',
            'closing_amount',
            # Diferenca
            'difference',
            # Movimentos brutos
            'movements',
        ]
        read_only_fields = fields


class OpenCashSessionSerializer(serializers.Serializer):
    branch = serializers.UUIDField()
    opening_amount = serializers.DecimalField(max_digits=18, decimal_places=2)


class CloseCashSessionSerializer(serializers.Serializer):
    closing_amount = serializers.DecimalField(max_digits=18, decimal_places=2)


class SaleItemSerializer(serializers.ModelSerializer):
    unit_precision = serializers.IntegerField(source='unit.precision', read_only=True)

    class Meta:
        model = SaleItem
        fields = [
            'id',
            'product',
            'unit',
            'stock_operation',
            'quantity',
            'factor',
            'unit_price',
            'discount_amount',
            'line_total',
            'unit_precision',
        ]
        read_only_fields = fields


class SalePaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = SalePayment
        fields = ['id', 'method', 'amount', 'reference']
        read_only_fields = fields


class SaleSerializer(serializers.ModelSerializer):
    items = SaleItemSerializer(many=True, read_only=True)
    payments = SalePaymentSerializer(many=True, read_only=True)
    refundable_balance = serializers.SerializerMethodField()

    class Meta:
        model = Sale
        fields = [
            'id',
            'branch',
            'cash_session',
            'operator',
            'customer',
            'status',
            'gross_total',
            'discount_total',
            'net_total',
            'created_at',
            'version',
            'items',
            'payments',
            'refundable_balance',
        ]
        read_only_fields = fields

    def get_refundable_balance(self, obj):
        refunds = getattr(obj, '_completed_refunds_for_serializer', None)
        if refunds is None:
            refunds = SaleRefund.all_objects.filter(
                tenant_id=obj.tenant_id,
                sale_id=obj.pk,
                status='completed',
            )
        refunded_total = sum(
            (refund.amount for refund in refunds if refund.tenant_id == obj.tenant_id),
            Decimal('0'),
        )
        balance = max(Decimal('0'), obj.net_total - refunded_total)
        return format(balance.quantize(Decimal('0.01')), 'f')


class CounterSaleItemInputSerializer(serializers.Serializer):
    product = serializers.UUIDField()
    unit = serializers.UUIDField()
    quantity = serializers.DecimalField(max_digits=18, decimal_places=6)
    factor = serializers.DecimalField(max_digits=18, decimal_places=6)
    discount_amount = serializers.DecimalField(
        max_digits=18,
        decimal_places=2,
        required=False,
        default=Decimal('0'),
    )


class CounterSalePaymentInputSerializer(serializers.Serializer):
    method = serializers.ChoiceField(choices=SalePayment.METHOD_CHOICES)
    amount = serializers.DecimalField(max_digits=18, decimal_places=2)
    reference = serializers.CharField(required=False, allow_blank=True, default='')


class CounterSaleSerializer(serializers.Serializer):
    branch = serializers.UUIDField()
    stock_location = serializers.UUIDField()
    customer = serializers.UUIDField(required=False, allow_null=True)
    items = CounterSaleItemInputSerializer(many=True)
    payments = CounterSalePaymentInputSerializer(many=True)


class SyncOperationSerializer(serializers.Serializer):
    type = serializers.ChoiceField(
        choices=[
            'sale:create',
            'cash-session:open',
            'cash-session:close',
        ]
    )
    payload = serializers.JSONField()
    idempotency_key = serializers.CharField(max_length=255)


class SyncBatchSerializer(serializers.Serializer):
    operations = SyncOperationSerializer(many=True)

    def validate_operations(self, value):
        if len(value) < 1:
            raise serializers.ValidationError('At least one operation is required')
        if len(value) > 100:
            raise serializers.ValidationError('No more than 100 operations allowed')
        return value


class SaleReturnItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = SaleReturnItem
        fields = ['id', 'sale_item', 'quantity', 'factor']
        read_only_fields = fields


class SaleReturnSerializer(serializers.ModelSerializer):
    items = SaleReturnItemSerializer(many=True, read_only=True)

    class Meta:
        model = SaleReturn
        fields = ['id', 'sale', 'reason', 'status', 'items', 'created_at']
        read_only_fields = fields


class ReturnItemInputSerializer(serializers.Serializer):
    sale_item_id = serializers.UUIDField()
    quantity = serializers.DecimalField(
        max_digits=18,
        decimal_places=6,
    )


class CreateSaleReturnSerializer(serializers.Serializer):
    # DRF supports list-level validation kwargs when ``many=True``; its type stubs
    # do not currently expose ``min_length`` on the child serializer constructor.
    items = ReturnItemInputSerializer(many=True, min_length=1)  # type: ignore[call-arg]
    reason = serializers.CharField(min_length=1, max_length=500)

    def validate_reason(self, value):
        try:
            return normalize_reason(value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc


class SaleRefundSerializer(serializers.ModelSerializer):
    class Meta:
        model = SaleRefund
        fields = ['id', 'sale', 'sale_return', 'method', 'amount', 'status', 'created_at']
        read_only_fields = fields


class CreateSaleRefundSerializer(serializers.Serializer):
    method = serializers.ChoiceField(choices=SaleRefund.METHOD_CHOICES)
    amount = serializers.DecimalField(
        max_digits=18,
        decimal_places=2,
        min_value=Decimal('0.01'),
        required=False,
    )
    reason = serializers.CharField(min_length=1, max_length=500)

    def validate_reason(self, value):
        try:
            return normalize_reason(value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc


class SaleCancellationSerializer(serializers.ModelSerializer):
    class Meta:
        model = SaleCancellation
        fields = ['id', 'sale', 'reason', 'status', 'created_at']
        read_only_fields = fields


class CreateSaleCancellationSerializer(serializers.Serializer):
    reason = serializers.CharField(min_length=1, max_length=500)

    def validate_reason(self, value):
        try:
            return normalize_reason(value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc
