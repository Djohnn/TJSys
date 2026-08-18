from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from tenancy.managers import TenantManager
from tenancy.models import TenantScopedModel, TimeStampedModel


class VersionedInventoryModel(TimeStampedModel, TenantScopedModel):
    version = models.PositiveIntegerField(default=1)

    class Meta:
        abstract = True


class ReplenishmentRule(VersionedInventoryModel):
    TRIGGER_CHOICES = [
        ('min', 'Estoque Minimo'),
        ('periodic', 'Periodico'),
        ('demand', 'Demanda'),
    ]

    product = models.ForeignKey(
        'catalog.Product',
        on_delete=models.PROTECT,
        related_name='replenishment_rules',
    )
    location = models.ForeignKey(
        'inventory.StockLocation',
        on_delete=models.PROTECT,
        related_name='replenishment_rules',
    )
    trigger_type = models.CharField(max_length=20, choices=TRIGGER_CHOICES)
    min_quantity = models.DecimalField(max_digits=18, decimal_places=6, default=0)
    max_quantity = models.DecimalField(max_digits=18, decimal_places=6, default=0)
    reorder_quantity = models.DecimalField(max_digits=18, decimal_places=6, default=0)
    is_active = models.BooleanField(default=True)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['product__name', 'location__name']

    def clean(self):
        super().clean()
        if self.min_quantity < 0:
            raise ValidationError({'min_quantity': 'Minimum quantity cannot be negative.'})
        if self.max_quantity < self.min_quantity:
            raise ValidationError({'max_quantity': 'Maximum quantity must be greater than minimum.'})
        if self.reorder_quantity <= 0:
            raise ValidationError({'reorder_quantity': 'Reorder quantity must be positive.'})
        if self.product_id and self.product.tenant_id != self.tenant_id:
            raise ValidationError({'product': 'Product must belong to the same tenant.'})
        if self.location_id and self.location.tenant_id != self.tenant_id:
            raise ValidationError({'location': 'Location must belong to the same tenant.'})


class ReplenishmentOrder(VersionedInventoryModel):
    STATUS_CHOICES = [
        ('draft', 'Rascunho'),
        ('pending', 'Pendente'),
        ('approved', 'Aprovado'),
        ('completed', 'Concluido'),
        ('cancelled', 'Cancelado'),
    ]

    rule = models.ForeignKey(ReplenishmentRule, on_delete=models.PROTECT, related_name='orders')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    quantity = models.DecimalField(max_digits=18, decimal_places=6)
    notes = models.TextField(blank=True, default='')
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='replenishment_approvals',
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['-created_at']

    def clean(self):
        super().clean()
        if self.quantity <= 0:
            raise ValidationError({'quantity': 'Quantity must be positive.'})
        if self.rule_id and self.rule.tenant_id != self.tenant_id:
            raise ValidationError({'rule': 'Rule must belong to the same tenant.'})
