from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from tenancy.managers import TenantManager
from tenancy.models import TenantScopedModel, TimeStampedModel


class VersionedSalesModel(TimeStampedModel, TenantScopedModel):
    version = models.PositiveIntegerField(default=1)

    class Meta:
        abstract = True


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
