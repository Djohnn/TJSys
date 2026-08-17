import uuid

from django.db import models


class OutboxMessage(models.Model):
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('PUBLISHED', 'Published'),
        ('FAILED', 'Failed'),
        ('DEAD_LETTER', 'Dead Letter'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event_type = models.CharField(max_length=100)
    event_version = models.CharField(max_length=10, default='1')
    aggregate_type = models.CharField(max_length=100)
    aggregate_id = models.CharField(max_length=100)
    payload = models.JSONField()
    correlation_id = models.CharField(max_length=100, blank=True, default='')
    tenant_id = models.CharField(max_length=100, blank=True, default='')
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='PENDING',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    published_at = models.DateTimeField(null=True, blank=True)
    retry_count = models.IntegerField(default=0)
    last_error = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['created_at']
        verbose_name = 'outbox message'
        verbose_name_plural = 'outbox messages'

    def __str__(self):
        return f'{self.event_type} [{self.status}]'


class OutboxDelivery(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    message = models.ForeignKey(
        OutboxMessage,
        on_delete=models.CASCADE,
        related_name='deliveries',
    )
    handler = models.CharField(max_length=150)
    result = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['message', 'handler'],
                name='uniq_outbox_message_handler',
            ),
        ]

    def __str__(self):
        return f'{self.message_id} -> {self.handler}'
