import hashlib

from django.core.exceptions import ValidationError
from django.db import models

from tenancy.models import TimeStampedModel


class Plan(TimeStampedModel):
    PLAN_FREE = 'free'
    PLAN_STARTER = 'starter'
    PLAN_PROFESSIONAL = 'professional'
    PLAN_ENTERPRISE = 'enterprise'

    PLAN_CHOICES = [
        (PLAN_FREE, 'Free'),
        (PLAN_STARTER, 'Starter'),
        (PLAN_PROFESSIONAL, 'Professional'),
        (PLAN_ENTERPRISE, 'Enterprise'),
    ]

    code = models.CharField(max_length=40, unique=True)
    name = models.CharField(max_length=200)
    capabilities = models.JSONField(default=dict, blank=True)
    limits = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)
    is_public = models.BooleanField(default=False)
    trial_days = models.PositiveIntegerField(default=0)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['sort_order', 'code']

    def __str__(self):
        return self.name


class Subscription(TimeStampedModel):
    STATUS_ACTIVE = 'active'
    STATUS_SUSPENDED = 'suspended'
    STATUS_CANCELLED = 'cancelled'
    STATUS_TRIAL = 'trial'

    STATUS_CHOICES = [
        (STATUS_ACTIVE, 'Ativa'),
        (STATUS_SUSPENDED, 'Suspensa'),
        (STATUS_CANCELLED, 'Cancelada'),
        (STATUS_TRIAL, 'Trial'),
    ]

    tenant = models.ForeignKey(
        'tenancy.Tenant',
        on_delete=models.PROTECT,
        related_name='subscriptions',
    )
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT, related_name='subscriptions')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_ACTIVE)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['-start_date']
        constraints = [
            models.UniqueConstraint(
                fields=['tenant'],
                condition=models.Q(is_active=True),
                name='uniq_active_subscription_per_tenant',
            ),
        ]

    def clean(self):
        if self.plan_id and not Plan.objects.filter(pk=self.plan_id, is_active=True).exists():
            raise ValidationError('Plan must be active.')

    def __str__(self):
        return f'{self.tenant.slug} → {self.plan.code} [{self.status}]'


class TenantEntitlement(TimeStampedModel):
    tenant = models.ForeignKey(
        'tenancy.Tenant',
        on_delete=models.CASCADE,
        related_name='entitlements',
    )
    capability = models.CharField(max_length=100)
    is_enabled = models.BooleanField(default=True)
    limit_value = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        ordering = ['capability']
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'capability'],
                name='uniq_tenant_capability',
            ),
        ]

    def __str__(self):
        return f'{self.tenant.slug}:{self.capability}={self.is_enabled}'


class FeatureFlag(TimeStampedModel):
    code = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True, default='')
    is_globally_enabled = models.BooleanField(default=False)
    rollout_percentage = models.PositiveIntegerField(default=0)
    tenant_overrides = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['code']

    def is_enabled_for(self, tenant_id: str) -> bool:
        str_tid = str(tenant_id)
        if str_tid in self.tenant_overrides:
            return bool(self.tenant_overrides[str_tid])
        if self.rollout_percentage >= 100:
            return True
        if self.rollout_percentage > 0:
            digest = hashlib.sha256(f'{self.code}:{str_tid}'.encode()).digest()
            bucket = int.from_bytes(digest[:8], byteorder='big') % 100
            return bucket < self.rollout_percentage
        return self.is_globally_enabled

    def __str__(self):
        return self.code


class PlatformAdminAudit(TimeStampedModel):
    ACTION_CHOICES = [
        ('plan.created', 'Plano criado'),
        ('plan.updated', 'Plano atualizado'),
        ('plan.deleted', 'Plano removido'),
        ('subscription.created', 'Assinatura criada'),
        ('subscription.updated', 'Assinatura alterada'),
        ('subscription.deleted', 'Assinatura removida'),
        ('subscription.suspended', 'Assinatura suspensa'),
        ('subscription.activated', 'Assinatura ativada'),
        ('subscription.cancelled', 'Assinatura cancelada'),
        ('entitlement.updated', 'Entitlement atualizado'),
        ('entitlement.deleted', 'Entitlement removido'),
        ('feature_flag.updated', 'Feature flag alterada'),
        ('feature_flag.deleted', 'Feature flag removida'),
        ('support_access.granted', 'Acesso suporte concedido'),
        ('support_access.revoked', 'Acesso suporte revogado'),
        ('support_access.deleted', 'Solicitação de suporte removida'),
    ]

    actor = models.ForeignKey(
        'accounts.CustomUser',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    action = models.CharField(max_length=50, choices=ACTION_CHOICES)
    target_tenant = models.ForeignKey(
        'tenancy.Tenant',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    detail = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.action} by {self.actor_id} at {self.created_at}'


class SupportAccessRequest(TimeStampedModel):
    STATUS_PENDING = 'pending'
    STATUS_APPROVED = 'approved'
    STATUS_EXPIRED = 'expired'
    STATUS_REVOKED = 'revoked'

    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pendente'),
        (STATUS_APPROVED, 'Aprovado'),
        (STATUS_EXPIRED, 'Expirado'),
        (STATUS_REVOKED, 'Revogado'),
    ]

    requester = models.ForeignKey(
        'accounts.CustomUser',
        on_delete=models.PROTECT,
        related_name='support_requests',
    )
    target_tenant = models.ForeignKey(
        'tenancy.Tenant',
        on_delete=models.PROTECT,
        related_name='support_requests',
    )
    reason = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    approved_by = models.ForeignKey(
        'accounts.CustomUser',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_support_requests',
    )
    expires_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    revoked_by = models.ForeignKey(
        'accounts.CustomUser',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='revoked_support_requests',
    )

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Support-{str(self.id)[:8]} → {self.target_tenant_id} [{self.status}]'
