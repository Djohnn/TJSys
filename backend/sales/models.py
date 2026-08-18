from django.core.exceptions import ValidationError
from django.db import models

from tenancy.managers import TenantManager
from tenancy.models import TenantScopedModel, TimeStampedModel


class VersionedSalesModel(TimeStampedModel, TenantScopedModel):
    version = models.PositiveIntegerField(default=1)

    class Meta:
        abstract = True


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
