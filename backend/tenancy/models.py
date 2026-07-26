import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from tenancy.managers import TenantManager

ROLE_CHOICES = [
    ('admin', 'Admin'),
    ('manager', 'Manager'),
    ('operator', 'Operator'),
]


class TimeStampedModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class TenantScopedModel(models.Model):
    tenant = models.ForeignKey(
        'tenancy.Tenant',
        on_delete=models.CASCADE,
        editable=False,
    )

    class Meta:
        abstract = True


class Tenant(TimeStampedModel):
    name = models.CharField(max_length=200)
    slug = models.SlugField(unique=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class Company(TimeStampedModel, TenantScopedModel):
    name = models.CharField(max_length=200)
    cnpj = models.CharField(max_length=18, blank=True, default='')
    ie = models.CharField('Inscrição Estadual', max_length=20, blank=True, default='')
    address_json = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        verbose_name_plural = 'companies'
        ordering = ['name']
        unique_together = ('tenant', 'name')

    def __str__(self):
        return f'{self.name} [{self.tenant.name}]'


class Branch(TimeStampedModel, TenantScopedModel):
    company = models.ForeignKey(
        Company,
        on_delete=models.CASCADE,
        related_name='branches',
    )
    name = models.CharField(max_length=200)
    is_active = models.BooleanField(default=True)
    ie = models.CharField('Inscrição Estadual', max_length=20, blank=True, default='')
    address_json = models.JSONField(default=dict, blank=True)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['name']
        unique_together = ('company', 'name')

    def __str__(self):
        return f'{self.name} @ {self.company.name}'

    def save(self, *args, **kwargs):
        if not self.tenant_id and self.company_id:
            self.tenant = self.company.tenant
        elif self.company_id and self.tenant_id != self.company.tenant_id:
            raise ValidationError({'tenant': 'Branch tenant must match company tenant.'})
        super().save(*args, **kwargs)


class TenantMembership(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='tenant_memberships',
    )
    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name='memberships',
    )
    role = models.CharField(
        max_length=20,
        choices=ROLE_CHOICES,
        default='operator',
    )
    is_active = models.BooleanField(default=True)
    invited_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'tenant')
        verbose_name_plural = 'tenant memberships'

    def __str__(self):
        return f'{self.user.email} @ {self.tenant.name}'


class TenantMFAPolicy(models.Model):
    tenant = models.OneToOneField(
        Tenant,
        on_delete=models.CASCADE,
        related_name='mfa_policy',
    )
    allow_totp = models.BooleanField(default=True)
    allow_email = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    def clean(self):
        if not self.allow_totp and not self.allow_email:
            raise ValidationError('At least one MFA method must remain enabled.')

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return f'MFA policy for {self.tenant}'


class UserBranch(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='user_branches',
    )
    branch = models.ForeignKey(
        Branch,
        on_delete=models.CASCADE,
        related_name='user_branches',
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ('user', 'branch')

    def __str__(self):
        return f'{self.user.email} → {self.branch.name}'

    def save(self, *args, **kwargs):
        self.clean()
        return super().save(*args, **kwargs)

    def clean(self):
        if self.user_id and self.branch_id:
            has_membership = TenantMembership.objects.filter(
                user_id=self.user_id,
                tenant_id=self.branch.tenant_id,
                is_active=True,
            ).exists()
            if not has_membership:
                raise ValidationError(
                    {'user': 'User needs an active membership in the branch tenant.'}
                )


class Invitation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='invitations')
    email = models.EmailField()
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    token_digest = models.CharField(max_length=64)
    expires_at = models.DateTimeField()
    accepted_at = models.DateTimeField(null=True, blank=True)
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='sent_invitations',
    )
    branches = models.ManyToManyField(Branch, blank=True, related_name='invitations')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.email} invited to {self.tenant}'


class Device(TimeStampedModel, TenantScopedModel):
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('inactive', 'Inactive'),
        ('revoked', 'Revoked'),
    ]

    name = models.CharField(max_length=100)
    device_id = models.CharField(max_length=100)
    key_hash = models.CharField(max_length=128)
    branch = models.ForeignKey(
        Branch,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='devices',
    )
    platform = models.CharField(max_length=50, blank=True, default='')
    app_version = models.CharField(max_length=30, blank=True, default='')
    os_version = models.CharField(max_length=50, blank=True, default='')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    last_seen_at = models.DateTimeField(null=True, blank=True)
    registered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='registered_devices',
    )

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'device_id'],
                name='uniq_device_tenant_deviceid',
            ),
        ]

    def __str__(self):
        return f'{self.name} ({self.device_id}) [{self.tenant.name}]'
