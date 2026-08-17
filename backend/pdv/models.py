import uuid

from django.db import models

from tenancy.models import Device, Tenant


class PDVSyncBatch(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='pdv_sync_batches')
    device = models.ForeignKey(Device, on_delete=models.PROTECT, related_name='pdv_sync_batches')
    batch_hash = models.CharField(max_length=64)
    received_at = models.DateTimeField(auto_now_add=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'device', 'batch_hash'],
                name='uniq_pdv_batch_hash',
            ),
        ]

    def __str__(self):
        return f'{self.device_id}:{self.batch_hash}'


class PDVSyncEvent(models.Model):
    STATUS_CHOICES = [
        ('accepted', 'Accepted'),
        ('conflict_requires_review', 'Conflict requires review'),
        ('failed', 'Failed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    batch = models.ForeignKey(PDVSyncBatch, on_delete=models.PROTECT, related_name='events')
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='pdv_sync_events')
    device = models.ForeignKey(Device, on_delete=models.PROTECT, related_name='pdv_sync_events')
    event_id = models.UUIDField()
    local_sequence = models.PositiveBigIntegerField()
    event_type = models.CharField(max_length=80)
    event_version = models.PositiveIntegerField(default=1)
    idempotency_key = models.CharField(max_length=255)
    occurred_at = models.DateTimeField()
    payload = models.JSONField()
    payload_hash = models.CharField(max_length=64)
    status = models.CharField(max_length=32, choices=STATUS_CHOICES)
    result = models.JSONField(default=dict, blank=True)
    error_code = models.CharField(max_length=80, blank=True, default='')
    error_detail = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['device', 'event_id'], name='uniq_pdv_event_device_id'),
            models.UniqueConstraint(
                fields=['device', 'local_sequence'], name='uniq_pdv_event_sequence'
            ),
            models.UniqueConstraint(
                fields=['tenant', 'device', 'idempotency_key'],
                name='uniq_pdv_event_idempotency',
            ),
        ]
        ordering = ['local_sequence']

    def __str__(self):
        return f'{self.device_id}:{self.event_id}'


class PDVSyncConflict(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event = models.OneToOneField(PDVSyncEvent, on_delete=models.PROTECT, related_name='conflict')
    code = models.CharField(max_length=80)
    detail = models.TextField()
    context = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolution = models.JSONField(null=True, blank=True)

    def __str__(self):
        return f'{self.event.event_id}:{self.code}'
