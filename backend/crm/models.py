from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from tenancy.managers import TenantManager
from tenancy.models import TenantScopedModel, TimeStampedModel


class VersionedModel(TimeStampedModel, TenantScopedModel):
    version = models.PositiveIntegerField(default=1)

    class Meta:
        abstract = True


class ActivityType(VersionedModel):
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, default='')
    color = models.CharField(max_length=7, default='#3B82F6')
    icon = models.CharField(max_length=50, blank=True, default='')
    is_active = models.BooleanField(default=True)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['name']

    def clean(self):
        super().clean()


class Activity(VersionedModel):
    STATUS_CHOICES = [
        ('pending', 'Pendente'),
        ('completed', 'Concluída'),
        ('cancelled', 'Cancelada'),
    ]

    activity_type = models.ForeignKey(ActivityType, on_delete=models.PROTECT, related_name='activities')
    customer = models.ForeignKey(
        'people.Person',
        on_delete=models.PROTECT,
        related_name='activities',
    )
    opportunity = models.ForeignKey(
        'crm.Opportunity',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='activities',
    )
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='activities',
    )
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default='')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    due_date = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True, default='')
    reminder_date = models.DateTimeField(null=True, blank=True)
    is_recurring = models.BooleanField(default=False)
    recurrence_interval = models.CharField(max_length=20, blank=True, default='')

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['-due_date', '-created_at']

    def clean(self):
        super().clean()
        if self.customer_id and self.customer.tenant_id != self.tenant_id:
            raise ValidationError({'customer': 'Customer must belong to the same tenant.'})
        if self.opportunity_id and self.opportunity.tenant_id != self.tenant_id:
            raise ValidationError({'opportunity': 'Opportunity must belong to the same tenant.'})
