import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True
    dependencies = [
        ('tenancy', '0006_device'),
    ]
    operations = [
        migrations.CreateModel(
            name='PDVSyncBatch',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('batch_hash', models.CharField(max_length=64)),
                ('received_at', models.DateTimeField(auto_now_add=True)),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('device', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='pdv_sync_batches', to='tenancy.device')),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='pdv_sync_batches', to='tenancy.tenant')),
            ],
        ),
        migrations.CreateModel(
            name='PDVSyncEvent',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('event_id', models.UUIDField()),
                ('local_sequence', models.PositiveBigIntegerField()),
                ('event_type', models.CharField(max_length=80)),
                ('event_version', models.PositiveIntegerField(default=1)),
                ('idempotency_key', models.CharField(max_length=255)),
                ('occurred_at', models.DateTimeField()),
                ('payload', models.JSONField()),
                ('payload_hash', models.CharField(max_length=64)),
                ('status', models.CharField(choices=[('accepted', 'Accepted'), ('conflict_requires_review', 'Conflict requires review'), ('failed', 'Failed')], max_length=32)),
                ('result', models.JSONField(blank=True, default=dict)),
                ('error_code', models.CharField(blank=True, default='', max_length=80)),
                ('error_detail', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('batch', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='events', to='pdv.pdvsyncbatch')),
                ('device', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='pdv_sync_events', to='tenancy.device')),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='pdv_sync_events', to='tenancy.tenant')),
            ],
            options={'ordering': ['local_sequence']},
        ),
        migrations.CreateModel(
            name='PDVSyncConflict',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('code', models.CharField(max_length=80)),
                ('detail', models.TextField()),
                ('context', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('resolved_at', models.DateTimeField(blank=True, null=True)),
                ('resolution', models.JSONField(blank=True, null=True)),
                ('event', models.OneToOneField(on_delete=django.db.models.deletion.PROTECT, related_name='conflict', to='pdv.pdvsyncevent')),
            ],
        ),
        migrations.AddConstraint(
            model_name='pdvsyncbatch',
            constraint=models.UniqueConstraint(fields=('tenant', 'device', 'batch_hash'), name='uniq_pdv_batch_hash'),
        ),
        migrations.AddConstraint(
            model_name='pdvsyncevent',
            constraint=models.UniqueConstraint(fields=('device', 'event_id'), name='uniq_pdv_event_device_id'),
        ),
        migrations.AddConstraint(
            model_name='pdvsyncevent',
            constraint=models.UniqueConstraint(fields=('device', 'local_sequence'), name='uniq_pdv_event_sequence'),
        ),
        migrations.AddConstraint(
            model_name='pdvsyncevent',
            constraint=models.UniqueConstraint(fields=('tenant', 'device', 'idempotency_key'), name='uniq_pdv_event_idempotency'),
        ),
    ]
