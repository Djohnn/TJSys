from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from tenancy.managers import TenantManager
from tenancy.models import TenantScopedModel, TimeStampedModel


class VersionedSalesModel(TimeStampedModel, TenantScopedModel):
    version = models.PositiveIntegerField(default=1)

    class Meta:
        abstract = True


class Consignment(VersionedSalesModel):
    STATUS_CHOICES = [
        ('draft', 'Rascunho'),
        ('active', 'Ativo'),
        ('closed', 'Fechado'),
        ('cancelled', 'Cancelado'),
    ]

    branch = models.ForeignKey(
        'tenancy.Branch',
        on_delete=models.PROTECT,
        related_name='consignments',
    )
    operator = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='consignments',
    )
    customer = models.ForeignKey(
        'people.Person',
        on_delete=models.PROTECT,
        related_name='consignments',
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
        'sales.Sale',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='consignments',
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
    product = models.ForeignKey(
        'catalog.Product',
        on_delete=models.PROTECT,
        related_name='consignment_items',
    )
    unit = models.ForeignKey(
        'catalog.Unit',
        on_delete=models.PROTECT,
        related_name='consignment_items',
    )
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
        if self.returned_quantity < 0:
            raise ValidationError({'returned_quantity': 'Returned quantity cannot be negative.'})
        if self.returned_quantity > self.quantity:
            raise ValidationError({'returned_quantity': 'Returned quantity cannot exceed original quantity.'})
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
            raise ValidationError({'max_sale_value': 'Maximum sale value must be greater than minimum.'})


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
            raise ValidationError({'valid_until': 'Valid until date must be after valid from date.'})


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
            raise ValidationError({'max_quantity': 'Maximum quantity must be greater than minimum.'})
        if self.discount_percentage < 0 or self.discount_percentage > 100:
            raise ValidationError({'discount_percentage': 'Discount percentage must be between 0 and 100.'})
