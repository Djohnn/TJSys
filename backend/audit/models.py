import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


class AuditRecord(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    action = models.CharField(max_length=50)
    resource_type = models.CharField(max_length=100)
    resource_id = models.CharField(max_length=100, blank=True, default='')
    detail = models.JSONField(default=dict, blank=True)
    correlation_id = models.CharField(max_length=100, blank=True, default='')
    tenant_id = models.CharField(max_length=100, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'audit record'
        verbose_name_plural = 'audit records'

    def __str__(self):
        return f'{self.action} {self.resource_type} by {self.actor_id}'

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError('Audit records are immutable.')
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError('Audit records are immutable.')
