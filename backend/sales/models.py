from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from tenancy.managers import TenantManager
from tenancy.models import TenantScopedModel, TimeStampedModel


class VersionedSalesModel(TimeStampedModel, TenantScopedModel):
    version = models.PositiveIntegerField(default=1)

    class Meta:
        abstract = True


class CashSession(VersionedSalesModel):
    STATUS_CHOICES = [
        ('open', 'Aberto'),
        ('closed', 'Fechado'),
    ]

    branch = models.ForeignKey(
        'tenancy.Branch',
        on_delete=models.PROTECT,
        related_name='cash_sessions',
    )
    operator = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='cash_sessions',
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')
    opening_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    expected_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    closing_amount = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
    )
    idempotency_key = models.CharField(max_length=100, blank=True, default='')
    payload_hash = models.CharField(max_length=64, blank=True, default='')
    opened_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['-opened_at']
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'branch', 'operator'],
                condition=models.Q(status='open'),
                name='uniq_open_cash_session_per_operator_branch',
            ),
            models.UniqueConstraint(
                fields=['tenant', 'idempotency_key'],
                condition=models.Q(idempotency_key__gt=''),
                name='uniq_cashsession_tenant_idempotency',
            ),
        ]

    def clean(self):
        super().clean()
        if self.branch_id and self.tenant_id and self.branch.tenant_id != self.tenant_id:
            raise ValidationError({'branch': 'Branch must belong to the same tenant.'})


class CashMovement(VersionedSalesModel):
    TYPE_CHOICES = [
        ('opening', 'Abertura'),
        ('sale_payment', 'Pagamento de venda'),
        ('cash_in', 'Reforco'),
        ('cash_out', 'Sangria'),
        ('expense', 'Despesa'),
        ('other_in', 'Outra entrada'),
        ('other_out', 'Outra saida'),
        ('closing_adjustment', 'Ajuste de fechamento'),
    ]

    cash_session = models.ForeignKey(
        CashSession, on_delete=models.PROTECT, related_name='movements'
    )
    movement_type = models.CharField(max_length=30, choices=TYPE_CHOICES)
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    payment_method = models.CharField(max_length=30, blank=True, default='')
    reference = models.CharField(max_length=100, blank=True, default='')
    notes = models.TextField(blank=True, default='')

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['created_at']

    def clean(self):
        super().clean()
        if self.amount < 0:
            raise ValidationError({'amount': 'Amount cannot be negative.'})
        if (
            self.cash_session_id
            and self.tenant_id
            and self.cash_session.tenant_id != self.tenant_id
        ):
            raise ValidationError({'cash_session': 'Cash session must belong to the same tenant.'})


class Sale(VersionedSalesModel):
    STATUS_CHOICES = [
        ('confirmed', 'Confirmada'),
        ('cancelled', 'Cancelada'),
    ]

    branch = models.ForeignKey('tenancy.Branch', on_delete=models.PROTECT, related_name='sales')
    cash_session = models.ForeignKey(CashSession, on_delete=models.PROTECT, related_name='sales')
    operator = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='sales'
    )
    customer = models.ForeignKey(
        'people.Person', on_delete=models.PROTECT, null=True, blank=True, related_name='sales'
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='confirmed')
    gross_total = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    discount_total = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    net_total = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    idempotency_key = models.CharField(max_length=100, blank=True, default='')
    payload_hash = models.CharField(max_length=64, blank=True, default='')

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'idempotency_key'],
                condition=models.Q(idempotency_key__gt=''),
                name='uniq_sale_tenant_idempotency',
            ),
        ]

    def clean(self):
        super().clean()
        if self.branch_id and self.tenant_id and self.branch.tenant_id != self.tenant_id:
            raise ValidationError({'branch': 'Branch must belong to the same tenant.'})
        if (
            self.cash_session_id
            and self.tenant_id
            and self.cash_session.tenant_id != self.tenant_id
        ):
            raise ValidationError({'cash_session': 'Cash session must belong to the same tenant.'})
        if self.customer_id and self.customer.tenant_id != self.tenant_id:
            raise ValidationError({'customer': 'Customer must belong to the same tenant.'})


class SaleItem(VersionedSalesModel):
    sale = models.ForeignKey(Sale, on_delete=models.PROTECT, related_name='items')
    product = models.ForeignKey(
        'catalog.Product', on_delete=models.PROTECT, related_name='sale_items'
    )
    unit = models.ForeignKey('catalog.Unit', on_delete=models.PROTECT, related_name='sale_items')
    stock_operation = models.ForeignKey(
        'inventory.StockOperation',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='sale_items',
    )
    quantity = models.DecimalField(max_digits=18, decimal_places=6)
    factor = models.DecimalField(max_digits=18, decimal_places=6, default=1)
    unit_price = models.DecimalField(max_digits=18, decimal_places=4)
    discount_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    line_total = models.DecimalField(max_digits=18, decimal_places=2)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['created_at']

    def clean(self):
        super().clean()
        if self.quantity <= 0:
            raise ValidationError({'quantity': 'Quantity must be positive.'})
        if self.factor <= 0:
            raise ValidationError({'factor': 'Factor must be positive.'})
        if self.discount_amount < 0:
            raise ValidationError({'discount_amount': 'Discount cannot be negative.'})


class SalePayment(VersionedSalesModel):
    METHOD_CHOICES = [
        ('cash', 'Dinheiro'),
        ('pix', 'Pix'),
        ('card_external', 'Cartao externo'),
        ('card_integrated', 'Cartao integrado'),
        ('card_debit', 'Cartao debito'),
        ('card_credit', 'Cartao credito'),
    ]

    sale = models.ForeignKey(Sale, on_delete=models.PROTECT, related_name='payments')
    method = models.CharField(max_length=30, choices=METHOD_CHOICES)
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    reference = models.CharField(max_length=100, blank=True, default='')

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['created_at']

    def clean(self):
        super().clean()
        if self.amount <= 0:
            raise ValidationError({'amount': 'Payment amount must be positive.'})


class SaleReturn(VersionedSalesModel):
    STATUS_CHOICES = [('draft', 'Rascunho'), ('completed', 'Concluída'), ('cancelled', 'Cancelada')]
    sale = models.ForeignKey(Sale, on_delete=models.PROTECT, related_name='returns')
    reason = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    idempotency_key = models.CharField(max_length=100, blank=True, default='')
    payload_hash = models.CharField(max_length=64, blank=True, default='')

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'idempotency_key'],
                condition=models.Q(idempotency_key__gt=''),
                name='uniq_salereturn_tenant_idempotency',
            ),
        ]

    def clean(self):
        super().clean()
        if self.sale_id and self.tenant_id and self.sale.tenant_id != self.tenant_id:
            raise ValidationError({'sale': 'Sale must belong to the same tenant.'})


class SaleReturnItem(VersionedSalesModel):
    sale_return = models.ForeignKey(SaleReturn, on_delete=models.PROTECT, related_name='items')
    sale_item = models.ForeignKey(SaleItem, on_delete=models.PROTECT, related_name='return_items')
    quantity = models.DecimalField(max_digits=18, decimal_places=6)
    factor = models.DecimalField(max_digits=18, decimal_places=6, default=1)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['created_at']

    def clean(self):
        super().clean()
        if self.quantity <= 0:
            raise ValidationError({'quantity': 'Quantity must be positive.'})
        if self.factor <= 0:
            raise ValidationError({'factor': 'Factor must be positive.'})
        if self.sale_return_id and self.tenant_id and self.sale_return.tenant_id != self.tenant_id:
            raise ValidationError({'sale_return': 'Sale return must belong to the same tenant.'})


class SaleRefund(VersionedSalesModel):
    METHOD_CHOICES = [('cash', 'Dinheiro'), ('pix', 'Pix'), ('card_external', 'Cartao externo')]
    STATUS_CHOICES = [('pending', 'Pendente'), ('completed', 'Concluído'), ('failed', 'Falhou')]
    sale = models.ForeignKey(Sale, on_delete=models.PROTECT, related_name='refunds')
    sale_return = models.ForeignKey(
        SaleReturn, on_delete=models.PROTECT, null=True, blank=True, related_name='refunds'
    )
    method = models.CharField(max_length=30, choices=METHOD_CHOICES)
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    reason = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    idempotency_key = models.CharField(max_length=100, blank=True, default='')
    payload_hash = models.CharField(max_length=64, blank=True, default='')

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'idempotency_key'],
                condition=models.Q(idempotency_key__gt=''),
                name='uniq_salerefund_tenant_idempotency',
            ),
        ]

    def clean(self):
        super().clean()
        if self.amount <= 0:
            raise ValidationError({'amount': 'Refund amount must be positive.'})
        if self.sale_id and self.tenant_id and self.sale.tenant_id != self.tenant_id:
            raise ValidationError({'sale': 'Sale must belong to the same tenant.'})


class SaleCancellation(VersionedSalesModel):
    STATUS_CHOICES = [('draft', 'Rascunho'), ('completed', 'Concluído'), ('failed', 'Falhou')]
    sale = models.ForeignKey(Sale, on_delete=models.PROTECT, related_name='cancellations')
    reason = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    idempotency_key = models.CharField(max_length=100, blank=True, default='')
    payload_hash = models.CharField(max_length=64, blank=True, default='')

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'idempotency_key'],
                condition=models.Q(idempotency_key__gt=''),
                name='uniq_salecancellation_tenant_idempotency',
            ),
        ]

    def clean(self):
        super().clean()
        if self.sale_id and self.tenant_id and self.sale.tenant_id != self.tenant_id:
            raise ValidationError({'sale': 'Sale must belong to the same tenant.'})


class Quote(VersionedSalesModel):
    STATUS_CHOICES = [
        ('draft', 'Rascunho'),
        ('sent', 'Enviado'),
        ('approved', 'Aprovado'),
        ('rejected', 'Rejeitado'),
        ('converted', 'Convertido'),
        ('expired', 'Expirado'),
    ]

    branch = models.ForeignKey(
        'tenancy.Branch',
        on_delete=models.PROTECT,
        related_name='quotes',
    )
    customer = models.ForeignKey(
        'people.Person',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='quotes',
    )
    operator = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='quotes',
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    quote_number = models.CharField(max_length=30, blank=True, default='')
    valid_until = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True, default='')
    gross_total = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    discount_total = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    net_total = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    idempotency_key = models.CharField(max_length=100, blank=True, default='')
    payload_hash = models.CharField(max_length=64, blank=True, default='')
    converted_sale = models.ForeignKey(
        Sale,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='converted_quotes',
    )

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'quote_number'],
                condition=models.Q(quote_number__gt=''),
                name='uniq_quote_tenant_number',
            ),
            models.UniqueConstraint(
                fields=['tenant', 'idempotency_key'],
                condition=models.Q(idempotency_key__gt=''),
                name='uniq_quote_tenant_idempotency',
            ),
        ]

    def __str__(self):
        return f'Quote {self.quote_number} [{self.tenant.name}]'

    def clean(self):
        super().clean()
        if self.branch_id and self.tenant_id and self.branch.tenant_id != self.tenant_id:
            raise ValidationError({'branch': 'Branch must belong to the same tenant.'})
        if self.customer_id and self.tenant_id and self.customer.tenant_id != self.tenant_id:
            raise ValidationError({'customer': 'Customer must belong to the same tenant.'})
        if self.valid_until and self.valid_until < timezone.now().date():
            if self.status not in ('converted', 'expired', 'rejected'):
                raise ValidationError({'valid_until': 'Quote validity has expired.'})


class QuoteItem(VersionedSalesModel):
    quote = models.ForeignKey(Quote, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(
        'catalog.Product',
        on_delete=models.PROTECT,
        related_name='quote_items',
    )
    quantity = models.DecimalField(max_digits=18, decimal_places=6)
    unit_price = models.DecimalField(max_digits=18, decimal_places=4)
    discount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    notes = models.TextField(blank=True, default='')

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['quote', 'created_at']

    def __str__(self):
        return f'{self.product.sku} x{self.quantity} @ {self.unit_price}'

    def clean(self):
        super().clean()
        if self.quantity <= 0:
            raise ValidationError({'quantity': 'Quantity must be positive.'})
        if self.unit_price < 0:
            raise ValidationError({'unit_price': 'Unit price must not be negative.'})
        if self.quote_id and self.tenant_id and self.quote.tenant_id != self.tenant_id:
            raise ValidationError({'quote': 'Quote must belong to the same tenant.'})
        if self.product_id and self.tenant_id and self.product.tenant_id != self.tenant_id:
            raise ValidationError({'product': 'Product must belong to the same tenant.'})

class SalesOrder(VersionedSalesModel):
    STATUS_CHOICES = [
        ('draft', 'Rascunho'),
        ('confirmed', 'Confirmado'),
        ('processing', 'Em processamento'),
        ('shipped', 'Enviado'),
        ('delivered', 'Entregue'),
        ('cancelled', 'Cancelado'),
    ]

    branch = models.ForeignKey(
        'tenancy.Branch',
        on_delete=models.PROTECT,
        related_name='sales_orders',
    )
    customer = models.ForeignKey(
        'people.Person',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='sales_orders',
    )
    operator = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='sales_orders',
    )
    quote = models.ForeignKey(
        Quote,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='sales_orders',
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    order_number = models.CharField(max_length=30, blank=True, default='')
    expected_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True, default='')
    gross_total = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    discount_total = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    net_total = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    idempotency_key = models.CharField(max_length=100, blank=True, default='')
    payload_hash = models.CharField(max_length=64, blank=True, default='')
    converted_sale = models.ForeignKey(
        Sale,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='converted_orders',
    )

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'order_number'],
                condition=models.Q(order_number__gt=''),
                name='uniq_salesorder_tenant_number',
            ),
            models.UniqueConstraint(
                fields=['tenant', 'idempotency_key'],
                condition=models.Q(idempotency_key__gt=''),
                name='uniq_salesorder_tenant_idempotency',
            ),
        ]

    def __str__(self):
        return f'Order {self.order_number} [{self.tenant.name}]'

    def clean(self):
        super().clean()
        if self.branch_id and self.tenant_id and self.branch.tenant_id != self.tenant_id:
            raise ValidationError({'branch': 'Branch must belong to the same tenant.'})
        if self.customer_id and self.tenant_id and self.customer.tenant_id != self.tenant_id:
            raise ValidationError({'customer': 'Customer must belong to the same tenant.'})


class SalesOrderItem(VersionedSalesModel):
    order = models.ForeignKey(SalesOrder, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(
        'catalog.Product',
        on_delete=models.PROTECT,
        related_name='sales_order_items',
    )
    quantity = models.DecimalField(max_digits=18, decimal_places=6)
    unit_price = models.DecimalField(max_digits=18, decimal_places=4)
    discount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    notes = models.TextField(blank=True, default='')

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['order', 'created_at']

    def __str__(self):
        return f'{self.product.sku} x{self.quantity} @ {self.unit_price}'

    def clean(self):
        super().clean()
        if self.quantity <= 0:
            raise ValidationError({'quantity': 'Quantity must be positive.'})
        if self.unit_price < 0:
            raise ValidationError({'unit_price': 'Unit price must not be negative.'})
        if self.order_id and self.tenant_id and self.order.tenant_id != self.tenant_id:
            raise ValidationError({'order': 'Sales order must belong to the same tenant.'})
        if self.product_id and self.tenant_id and self.product.tenant_id != self.tenant_id:
            raise ValidationError({'product': 'Product must belong to the same tenant.'})


class Consignment(VersionedSalesModel):
    STATUS_CHOICES = [
        ('draft', 'Rascunho'),
        ('active', 'Ativo'),
        ('closed', 'Fechado'),
        ('cancelled', 'Cancelado'),
    ]

    branch = models.ForeignKey('tenancy.Branch', on_delete=models.PROTECT, related_name='consignments')
    operator = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='consignments'
    )
    customer = models.ForeignKey(
        'people.Person', on_delete=models.PROTECT, related_name='consignments'
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    consignment_number = models.CharField(max_length=50, unique=True)
    expected_return_date = models.DateField(null=True, blank=True)
    actual_return_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True, default='')
    gross_total = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    discount_total = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    net_total = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    converted_sale = models.ForeignKey(
        'sales.Sale', on_delete=models.SET_NULL, null=True, blank=True, related_name='consignments'
    )
    idempotency_key = models.CharField(max_length=100, blank=True, default='')
    payload_hash = models.CharField(max_length=64, blank=True, default='')

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'idempotency_key'],
                condition=models.Q(idempotency_key__gt=''),
                name='uniq_consignment_tenant_idempotency',
            ),
        ]

    def clean(self):
        super().clean()
        if self.branch_id and self.tenant_id and self.branch.tenant_id != self.tenant_id:
            raise ValidationError({'branch': 'Branch must belong to the same tenant.'})
        if self.customer_id and self.customer.tenant_id != self.tenant_id:
            raise ValidationError({'customer': 'Customer must belong to the same tenant.'})


class ConsignmentItem(VersionedSalesModel):
    consignment = models.ForeignKey(Consignment, on_delete=models.PROTECT, related_name='items')
    product = models.ForeignKey('catalog.Product', on_delete=models.PROTECT, related_name='consignment_items')
    unit = models.ForeignKey('catalog.Unit', on_delete=models.PROTECT, related_name='consignment_items')
    quantity = models.DecimalField(max_digits=18, decimal_places=6)
    returned_quantity = models.DecimalField(max_digits=18, decimal_places=6, default=0)
    factor = models.DecimalField(max_digits=18, decimal_places=6, default=1)
    unit_price = models.DecimalField(max_digits=18, decimal_places=4)
    discount_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    line_total = models.DecimalField(max_digits=18, decimal_places=2)
    notes = models.TextField(blank=True, default='')

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['created_at']

    def clean(self):
        super().clean()
        if self.quantity <= 0:
            raise ValidationError({'quantity': 'Quantity must be positive.'})
        if self.returned_quantity < 0 or self.returned_quantity > self.quantity:
            raise ValidationError({'returned_quantity': 'Returned quantity must be between zero and quantity.'})
        if self.factor <= 0:
            raise ValidationError({'factor': 'Factor must be positive.'})
        if self.discount_amount < 0:
            raise ValidationError({'discount_amount': 'Discount cannot be negative.'})


class CommissionRule(VersionedSalesModel):
    TYPE_CHOICES = [
        ('percentage', 'Percentual'),
        ('fixed', 'Fixo'),
    ]

    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, default='')
    rule_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    value = models.DecimalField(max_digits=18, decimal_places=4)
    min_sale_value = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    max_sale_value = models.DecimalField(
        max_digits=18,
        decimal_places=2,
        null=True,
        blank=True,
    )
    product = models.ForeignKey(
        'catalog.Product',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='commission_rules',
    )
    category = models.ForeignKey(
        'catalog.Category',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='commission_rules',
    )
    is_active = models.BooleanField(default=True)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['name']

    def clean(self):
        super().clean()
        if self.value <= 0:
            raise ValidationError({'value': 'Value must be positive.'})
        if self.min_sale_value < 0:
            raise ValidationError({'min_sale_value': 'Minimum sale value cannot be negative.'})
        if self.max_sale_value is not None and self.max_sale_value < self.min_sale_value:
            raise ValidationError(
                {'max_sale_value': 'Maximum sale value must be greater than minimum.'}
            )


class Commission(VersionedSalesModel):
    STATUS_CHOICES = [
        ('pending', 'Pendente'),
        ('approved', 'Aprovada'),
        ('paid', 'Paga'),
        ('cancelled', 'Cancelada'),
    ]

    sale = models.ForeignKey(
        'sales.Sale',
        on_delete=models.PROTECT,
        related_name='commissions',
    )
    rule = models.ForeignKey(
        CommissionRule,
        on_delete=models.PROTECT,
        related_name='commissions',
    )
    operator = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='commissions',
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    sale_value = models.DecimalField(max_digits=18, decimal_places=2)
    commission_value = models.DecimalField(max_digits=18, decimal_places=2)
    notes = models.TextField(blank=True, default='')
    approved_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    idempotency_key = models.CharField(max_length=100, blank=True, default='')
    payload_hash = models.CharField(max_length=64, blank=True, default='')

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'idempotency_key'],
                condition=models.Q(idempotency_key__gt=''),
                name='uniq_commission_tenant_idempotency',
            ),
        ]

    def clean(self):
        super().clean()
        if self.sale_value <= 0:
            raise ValidationError({'sale_value': 'Sale value must be positive.'})
        if self.commission_value <= 0:
            raise ValidationError({'commission_value': 'Commission value must be positive.'})
        if self.sale_id and self.tenant_id and self.sale.tenant_id != self.tenant_id:
            raise ValidationError({'sale': 'Sale must belong to the same tenant.'})
        if self.rule_id and self.rule.tenant_id != self.tenant_id:
            raise ValidationError({'rule': 'Commission rule must belong to the same tenant.'})


class PriceList(VersionedSalesModel):
    AUDIENCE_CHOICES = [
        ('retail', 'Varejo'),
        ('wholesale', 'Atacado'),
        ('vip', 'VIP'),
        ('partner', 'Parceiro'),
        ('custom', 'Personalizado'),
    ]

    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, default='')
    audience = models.CharField(max_length=20, choices=AUDIENCE_CHOICES)
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    valid_from = models.DateField(null=True, blank=True)
    valid_until = models.DateField(null=True, blank=True)
    priority = models.PositiveIntegerField(default=0)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['priority', 'name']

    def clean(self):
        super().clean()
        if self.valid_from and self.valid_until and self.valid_from > self.valid_until:
            raise ValidationError(
                {'valid_until': 'Valid until date must be after valid from date.'}
            )


class PriceListItem(VersionedSalesModel):
    price_list = models.ForeignKey(PriceList, on_delete=models.PROTECT, related_name='items')
    product = models.ForeignKey(
        'catalog.Product',
        on_delete=models.PROTECT,
        related_name='price_list_items',
    )
    price = models.DecimalField(max_digits=18, decimal_places=4)
    min_quantity = models.DecimalField(max_digits=18, decimal_places=6, default=1)
    max_quantity = models.DecimalField(
        max_digits=18,
        decimal_places=6,
        null=True,
        blank=True,
    )
    discount_percentage = models.DecimalField(max_digits=18, decimal_places=2, default=0)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['product__name']

    def clean(self):
        super().clean()
        if self.price <= 0:
            raise ValidationError({'price': 'Price must be positive.'})
        if self.min_quantity <= 0:
            raise ValidationError({'min_quantity': 'Minimum quantity must be positive.'})
        if self.max_quantity is not None and self.max_quantity < self.min_quantity:
            raise ValidationError(
                {'max_quantity': 'Maximum quantity must be greater than minimum.'}
            )
        if self.discount_percentage < 0 or self.discount_percentage > 100:
            raise ValidationError(
                {'discount_percentage': 'Discount percentage must be between 0 and 100.'}
            )
