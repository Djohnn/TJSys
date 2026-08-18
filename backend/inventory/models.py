from django.core.exceptions import ValidationError
from django.db import models

from tenancy.managers import TenantManager
from tenancy.models import TenantScopedModel, TimeStampedModel


class VersionedInventoryModel(TimeStampedModel, TenantScopedModel):
    version = models.PositiveIntegerField(default=1)

    class Meta:
        abstract = True


class MovementReason(VersionedInventoryModel):
    DIRECTION_CHOICES = [
        ('in', 'Entrada'),
        ('out', 'Saida'),
        ('transfer', 'Transferencia'),
    ]

    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, default='')
    direction = models.CharField(max_length=20, choices=DIRECTION_CHOICES)
    requires_authorization = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['name']

    def clean(self):
        super().clean()
