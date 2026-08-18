from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from tenancy.managers import TenantManager
from tenancy.models import TenantScopedModel, TimeStampedModel


class VersionedInventoryModel(TimeStampedModel, TenantScopedModel):
    version = models.PositiveIntegerField(default=1)

    class Meta:
        abstract = True


class InventoryCount(VersionedInventoryModel):
    STATUS_CHOICES = [
        ('draft', 'Rascunho'),
        ('in_progress', 'Em andamento'),
        ('completed', 'Concluido'),
        ('cancelled', 'Cancelado'),
    ]

    location = models.ForeignKey(
        'inventory.StockLocation',
        on_delete=models.PROTECT,
        related_name='inventory_counts',
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    notes = models.TextField(blank=True, default='')
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    counted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='inventory_counts',
    )

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['-created_at']

    def clean(self):
        super().clean()
        if self.location_id and self.location.tenant_id != self.tenant_id:
            raise ValidationError({'location': 'Location must belong to the same tenant.'})


class InventoryCountItem(VersionedInventoryModel):
    count = models.ForeignKey(InventoryCount, on_delete=models.PROTECT, related_name='items')
    product = models.ForeignKey(
        'catalog.Product',
        on_delete=models.PROTECT,
        related_name='inventory_count_items',
    )
    system_quantity = models.DecimalField(max_digits=18, decimal_places=6)
    counted_quantity = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)
    difference = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)
    notes = models.TextField(blank=True, default='')

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['product__name']

    def clean(self):
        super().clean()
        if self.system_quantity < 0:
            raise ValidationError({'system_quantity': 'System quantity cannot be negative.'})
        if self.counted_quantity is not None and self.counted_quantity < 0:
            raise ValidationError({'counted_quantity': 'Counted quantity cannot be negative.'})
        if self.count_id and self.count.tenant_id != self.tenant_id:
            raise ValidationError({'count': 'Count must belong to the same tenant.'})
        if self.product_id and self.product.tenant_id != self.tenant_id:
            raise ValidationError({'product': 'Product must belong to the same tenant.'})
