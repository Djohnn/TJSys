from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from tenancy.managers import TenantManager
from tenancy.models import TenantScopedModel, TimeStampedModel


class VersionedModel(TimeStampedModel, TenantScopedModel):
    version = models.PositiveIntegerField(default=1)

    class Meta:
        abstract = True


class CustomerHistoryEntry(VersionedModel):
    EVENT_TYPES = [
        ('sale', 'Venda'),
        ('return', 'Devolução'),
        ('payment', 'Pagamento'),
        ('activity', 'Atividade'),
        ('note', 'Nota'),
        ('communication', 'Comunicação'),
        ('opportunity', 'Oportunidade'),
    ]

    customer = models.ForeignKey(
        'people.Person',
        on_delete=models.PROTECT,
        related_name='history_entries',
    )
    event_type = models.CharField(max_length=20, choices=EVENT_TYPES)
    reference_id = models.UUIDField(null=True, blank=True)
    reference_model = models.CharField(max_length=100, blank=True, default='')
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default='')
    amount = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='history_entries',
    )

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['-created_at']
        verbose_name_plural = 'Customer history entries'

    def clean(self):
        super().clean()
        if self.customer_id and self.customer.tenant_id != self.tenant_id:
            raise ValidationError({'customer': 'Customer must belong to the same tenant.'})
