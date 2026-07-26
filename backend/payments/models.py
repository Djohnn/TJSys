from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q

from tenancy.managers import TenantManager
from tenancy.models import TenantScopedModel, TimeStampedModel


class PaymentModel(TimeStampedModel, TenantScopedModel):
    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        abstract = True


class PaymentProviderConfig(PaymentModel):
    provider = models.CharField(max_length=40)
    secret = models.CharField(max_length=255)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'provider'],
                condition=Q(is_active=True),
                name='uniq_active_payment_provider_tenant',
            )
        ]

    def __str__(self):
        return f'{self.provider} [{self.tenant_id}]'


class PaymentIntent(PaymentModel):
    STATUS_CHOICES = [
        ('pending', 'Pendente'),
        ('authorized', 'Autorizada'),
        ('captured', 'Capturada'),
        ('cancelled', 'Cancelada'),
        ('failed', 'Falhou'),
        ('refunded', 'Estornada'),
    ]
    provider_config = models.ForeignKey(
        PaymentProviderConfig, on_delete=models.PROTECT, related_name='intents'
    )
    sale = models.ForeignKey(
        'sales.Sale',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='payment_intents',
    )
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    currency = models.CharField(max_length=3, default='BRL')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    idempotency_key = models.CharField(max_length=100)
    provider_reference = models.CharField(max_length=100, blank=True, default='')

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'idempotency_key'], name='uniq_payment_intent_idempotency'
            ),
            models.UniqueConstraint(
                fields=['tenant', 'provider_reference'],
                condition=Q(provider_reference__gt=''),
                name='uniq_payment_intent_provider_ref',
            ),
        ]

    def clean(self):
        if self.provider_config_id and self.provider_config.tenant_id != self.tenant_id:
            raise ValidationError('Provider config must belong to the same tenant.')
        if self.sale_id and self.sale.tenant_id != self.tenant_id:
            raise ValidationError('Sale must belong to the same tenant.')


class PaymentTransaction(PaymentModel):
    TYPE_CHOICES = [
        ('authorization', 'Autorização'),
        ('capture', 'Captura'),
        ('cancel', 'Cancelamento'),
        ('refund', 'Estorno'),
    ]
    STATUS_CHOICES = [('pending', 'Pendente'), ('succeeded', 'Sucesso'), ('failed', 'Falhou')]
    intent = models.ForeignKey(PaymentIntent, on_delete=models.PROTECT, related_name='transactions')
    transaction_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='succeeded')
    gross_amount = models.DecimalField(max_digits=18, decimal_places=2)
    fee_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    net_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    provider_reference = models.CharField(max_length=100)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'provider_reference'],
                name='uniq_payment_transaction_provider_ref',
            )
        ]

    def save(self, *args, **kwargs):
        if not self.net_amount:
            self.net_amount = self.gross_amount - self.fee_amount
        return super().save(*args, **kwargs)


class PaymentWebhookEvent(PaymentModel):
    provider = models.CharField(max_length=40)
    external_id = models.CharField(max_length=100)
    payload = models.JSONField(default=dict)
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'provider', 'external_id'], name='uniq_payment_webhook_event'
            )
        ]


class PaymentReconciliationBatch(PaymentModel):
    STATUS_CHOICES = [('draft', 'Rascunho'), ('confirmed', 'Confirmado')]
    provider = models.CharField(max_length=40)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    confirmed_at = models.DateTimeField(null=True, blank=True)


class PaymentReconciliationItem(PaymentModel):
    STATUS_CHOICES = [('matched', 'Conciliado'), ('divergent', 'Divergente')]
    batch = models.ForeignKey(
        PaymentReconciliationBatch, on_delete=models.CASCADE, related_name='items'
    )
    transaction = models.ForeignKey(
        PaymentTransaction,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='reconciliation_items',
    )
    provider_reference = models.CharField(max_length=100)
    gross_amount = models.DecimalField(max_digits=18, decimal_places=2)
    fee_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    settled_amount = models.DecimalField(max_digits=18, decimal_places=2)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='matched')

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['batch', 'provider_reference'], name='uniq_reconciliation_item_ref'
            )
        ]

    @property
    def expected_net_amount(self):
        return self.gross_amount - self.fee_amount

    @property
    def difference_amount(self):
        return self.settled_amount - self.expected_net_amount
