from django.db import models
from django.core.exceptions import ValidationError

from tenancy.managers import TenantManager
from tenancy.models import TenantScopedModel, TimeStampedModel


class Channel(TenantScopedModel, TimeStampedModel):
    TYPE_CHOICES = [
        ('ecommerce', 'E-commerce'),
        ('marketplace', 'Marketplace'),
        ('pos', 'PDV'),
        ('api', 'API'),
    ]

    STATUS_CHOICES = [
        ('active', 'Ativo'),
        ('inactive', 'Inativo'),
        ('pending', 'Pendente'),
    ]

    name = models.CharField(max_length=100)
    slug = models.SlugField(max_length=60)
    channel_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='ecommerce')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    description = models.TextField(blank=True, default='')
    base_url = models.URLField(blank=True, default='')
    api_key = models.CharField(max_length=255, blank=True, default='')
    api_secret = models.CharField(max_length=255, blank=True, default='')
    webhook_url = models.URLField(blank=True, default='')
    config_json = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'slug'],
                name='uniq_channel_tenant_slug',
            ),
        ]

    def __str__(self):
        return f'{self.name} [{self.channel_type}]'

    def clean(self):
        super().clean()
        errors = {}
        if self.slug and not self.slug.isalnum():
            errors['slug'] = 'Slug must be alphanumeric.'
        if errors:
            raise ValidationError(errors)


class Marketplace(TenantScopedModel, TimeStampedModel):
    COMMISSION_CHOICES = [
        ('percentage', 'Porcentagem'),
        ('fixed', 'Fixo'),
    ]

    STATUS_CHOICES = [
        ('active', 'Ativo'),
        ('inactive', 'Inativo'),
        ('pending', 'Pendente'),
    ]

    channel = models.ForeignKey(
        Channel,
        on_delete=models.CASCADE,
        related_name='marketplaces',
    )
    name = models.CharField(max_length=100)
    slug = models.SlugField(max_length=60)
    marketplace_id = models.CharField(max_length=100, blank=True, default='')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    commission_type = models.CharField(max_length=20, choices=COMMISSION_CHOICES, default='percentage')
    commission_value = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    fee_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    fee_fixed = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    config_json = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'channel', 'slug'],
                name='uniq_marketplace_tenant_channel_slug',
            ),
        ]

    def __str__(self):
        return f'{self.name} [{self.channel.name}]'

    def clean(self):
        super().clean()
        errors = {}
        if self.channel_id and self.channel.tenant_id != self.tenant_id:
            errors['channel'] = 'Channel must belong to the same tenant.'
        if self.commission_value < 0:
            errors['commission_value'] = 'Commission value cannot be negative.'
        if self.fee_percentage < 0:
            errors['fee_percentage'] = 'Fee percentage cannot be negative.'
        if self.fee_fixed < 0:
            errors['fee_fixed'] = 'Fee fixed cannot be negative.'
        if errors:
            raise ValidationError(errors)


class OnlineOrder(TenantScopedModel, TimeStampedModel):
    STATUS_CHOICES = [
        ('pending', 'Pendente'),
        ('confirmed', 'Confirmado'),
        ('processing', 'Processando'),
        ('shipped', 'Enviado'),
        ('delivered', 'Entregue'),
        ('cancelled', 'Cancelado'),
        ('refunded', 'Reembolsado'),
    ]

    PAYMENT_STATUS_CHOICES = [
        ('pending', 'Pendente'),
        ('approved', 'Aprovado'),
        ('rejected', 'Rejeitado'),
        ('refunded', 'Reembolsado'),
    ]

    channel = models.ForeignKey(
        Channel,
        on_delete=models.PROTECT,
        related_name='online_orders',
    )
    marketplace = models.ForeignKey(
        Marketplace,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='online_orders',
    )
    sale = models.ForeignKey(
        'sales.Sale',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='online_orders',
    )
    external_order_id = models.CharField(max_length=100)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    payment_status = models.CharField(max_length=20, choices=PAYMENT_STATUS_CHOICES, default='pending')
    customer_name = models.CharField(max_length=200)
    customer_email = models.EmailField(blank=True, default='')
    customer_phone = models.CharField(max_length=20, blank=True, default='')
    shipping_address = models.JSONField(default=dict, blank=True)
    billing_address = models.JSONField(default=dict, blank=True)
    subtotal = models.DecimalField(max_digits=18, decimal_places=2)
    shipping_cost = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=18, decimal_places=2)
    currency = models.CharField(max_length=3, default='BRL')
    notes = models.TextField(blank=True, default='')
    shipped_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    idempotency_key = models.CharField(max_length=100, blank=True, default='')
    payload_hash = models.CharField(max_length=64, blank=True, default='')

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'channel', 'external_order_id'],
                name='uniq_online_order_tenant_channel_external',
            ),
            models.UniqueConstraint(
                fields=['tenant', 'idempotency_key'],
                condition=~models.Q(idempotency_key=''),
                name='uniq_online_order_idempotency_tenant',
            ),
        ]

    def __str__(self):
        return f'ORDER-{self.external_order_id} [{self.status}]'

    def clean(self):
        super().clean()
        errors = {}
        if self.channel_id and self.channel.tenant_id != self.tenant_id:
            errors['channel'] = 'Channel must belong to the same tenant.'
        if self.marketplace_id and self.marketplace.tenant_id != self.tenant_id:
            errors['marketplace'] = 'Marketplace must belong to the same tenant.'
        if self.sale_id and self.sale.tenant_id != self.tenant_id:
            errors['sale'] = 'Sale must belong to the same tenant.'
        if self.subtotal < 0:
            errors['subtotal'] = 'Subtotal cannot be negative.'
        if self.shipping_cost < 0:
            errors['shipping_cost'] = 'Shipping cost cannot be negative.'
        if self.discount_amount < 0:
            errors['discount_amount'] = 'Discount amount cannot be negative.'
        if self.tax_amount < 0:
            errors['tax_amount'] = 'Tax amount cannot be negative.'
        if self.total_amount < 0:
            errors['total_amount'] = 'Total amount cannot be negative.'
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        if not self._state.adding:
            current = OnlineOrder.all_objects.get(pk=self.pk)
            if current.status in ('cancelled', 'refunded'):
                raise ValidationError('Cancelled or refunded orders are immutable.')
        self.total_amount = self.subtotal + self.shipping_cost - self.discount_amount + self.tax_amount
        super().save(*args, **kwargs)
