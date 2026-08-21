from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from tenancy.managers import TenantManager
from tenancy.models import TenantScopedModel, TimeStampedModel


class VersionedModel(TimeStampedModel, TenantScopedModel):
    version = models.PositiveIntegerField(default=1)

    class Meta:
        abstract = True


class PipelineStage(VersionedModel):
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, default='')
    order = models.PositiveIntegerField(default=0)
    color = models.CharField(max_length=7, default='#3B82F6')
    is_won = models.BooleanField(default=False)
    is_lost = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['order', 'name']

    def clean(self):
        super().clean()
        if self.is_won and self.is_lost:
            raise ValidationError({'is_won': 'Stage cannot be both won and lost.'})


class Pipeline(VersionedModel):
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, default='')
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['name']

    def clean(self):
        super().clean()


class Opportunity(VersionedModel):
    STATUS_CHOICES = [
        ('open', 'Em aberto'),
        ('won', 'Ganha'),
        ('lost', 'Perdida'),
    ]

    pipeline = models.ForeignKey(Pipeline, on_delete=models.PROTECT, related_name='opportunities')
    stage = models.ForeignKey(PipelineStage, on_delete=models.PROTECT, related_name='opportunities')
    customer = models.ForeignKey(
        'people.Person',
        on_delete=models.PROTECT,
        related_name='opportunities',
    )
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='opportunities',
    )
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default='')
    value = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    currency = models.CharField(max_length=3, default='BRL')
    probability = models.PositiveIntegerField(default=0)
    expected_close_date = models.DateField(null=True, blank=True)
    actual_close_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')
    lost_reason = models.TextField(blank=True, default='')
    source = models.CharField(max_length=100, blank=True, default='')
    notes = models.TextField(blank=True, default='')
    converted_sale = models.ForeignKey(
        'sales.Sale',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='opportunities',
    )

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['-created_at']

    def clean(self):
        super().clean()
        if self.probability < 0 or self.probability > 100:
            raise ValidationError({'probability': 'Probability must be between 0 and 100.'})
        if self.customer_id and self.customer.tenant_id != self.tenant_id:
            raise ValidationError({'customer': 'Customer must belong to the same tenant.'})
        if self.pipeline_id and self.pipeline.tenant_id != self.tenant_id:
            raise ValidationError({'pipeline': 'Pipeline must belong to the same tenant.'})
        if self.stage_id and self.stage.tenant_id != self.tenant_id:
            raise ValidationError({'stage': 'Stage must belong to the same tenant.'})


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
