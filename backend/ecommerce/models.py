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
