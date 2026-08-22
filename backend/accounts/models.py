import uuid

from django.conf import settings
from django.contrib.auth.base_user import BaseUserManager
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


class CustomUserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError('Email is required.')
        normalized_email = email.strip().casefold()
        username = extra_fields.pop('username', '') or uuid.uuid4().hex[:20]
        user = self.model(email=normalized_email, username=username, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', False)
        extra_fields.setdefault('is_superuser', False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True.')
        return self._create_user(email, password, **extra_fields)


class CustomUser(AbstractUser):
    email = models.EmailField(unique=True)
    email_verified_at = models.DateTimeField(null=True, blank=True)
    shortcuts = models.JSONField(
        default=dict,
        db_default={},
        blank=True,
        help_text='Custom keyboard shortcuts as JSON object',
    )

    objects = CustomUserManager()  # type: ignore[assignment]

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []

    def save(self, *args, **kwargs):
        self.email = self.email.strip().casefold()
        if not self.username:
            self.username = str(uuid.uuid4())[:20]
        super().save(*args, **kwargs)

    def __str__(self):
        return self.email


class OneTimeToken(models.Model):
    PURPOSES = [
        ('email_confirmation', 'Email confirmation'),
        ('password_reset', 'Password reset'),
        ('email_mfa', 'Email MFA'),
        ('invitation', 'Invitation'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        CustomUser,
        on_delete=models.CASCADE,
        related_name='one_time_tokens',
    )
    purpose = models.CharField(max_length=32, choices=PURPOSES)
    digest = models.CharField(max_length=64)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)
    attempt_count = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=['purpose', 'expires_at'])]

    def __str__(self):
        return f'{self.purpose} for {self.user_id}'

    @property
    def is_usable(self):
        return self.consumed_at is None and self.expires_at > timezone.now()


class MFADevice(models.Model):
    TYPES = [('totp', 'TOTP'), ('email', 'Email')]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='mfa_devices')
    tenant = models.ForeignKey('tenancy.Tenant', on_delete=models.CASCADE)
    method = models.CharField(max_length=16, choices=TYPES)
    encrypted_secret = models.TextField(blank=True, default='')
    verified_at = models.DateTimeField(null=True, blank=True)
    last_counter = models.BigIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'tenant', 'method'],
                name='uniq_user_tenant_mfa_method',
            ),
        ]

    def __str__(self):
        return f'{self.method} for {self.user_id}'


class RecoveryCode(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    device = models.ForeignKey(MFADevice, on_delete=models.CASCADE, related_name='recovery_codes')
    digest = models.CharField(max_length=64)
    consumed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'Recovery code for {self.device_id}'


class UserFavorite(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='favorites',
    )
    tenant = models.ForeignKey(
        'tenancy.Tenant',
        on_delete=models.CASCADE,
        editable=False,
    )
    entity_type = models.CharField(
        max_length=32,
        help_text='Type of entity: product, category, route, etc.',
    )
    entity_id = models.UUIDField(null=True, blank=True)
    label = models.CharField(max_length=200)
    route = models.CharField(max_length=200)
    position = models.PositiveIntegerField(default=0)
    icon = models.CharField(max_length=32, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['position']
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'tenant', 'entity_type', 'entity_id'],
                name='uniq_favorite_user_entity',
            ),
            models.UniqueConstraint(
                fields=['user', 'tenant', 'position'],
                name='uniq_favorite_user_position',
            ),
        ]

    def __str__(self):
        return f'{self.label} ({self.entity_type}) for user {self.user_id}'
