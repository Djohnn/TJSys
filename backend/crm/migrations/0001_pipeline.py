import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('people', '0001_initial'),
        ('sales', '0001_initial'),
        ('tenancy', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Pipeline',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveIntegerField(default=1)),
                ('name', models.CharField(max_length=100)),
                ('description', models.TextField(blank=True, default='')),
                ('is_default', models.BooleanField(default=False)),
                ('is_active', models.BooleanField(default=True)),
                ('tenant', models.ForeignKey(editable=False, on_delete=django.db.models.deletion.CASCADE, to='tenancy.tenant')),
            ],
            options={
                'ordering': ['name'],
            },
        ),
        migrations.CreateModel(
            name='PipelineStage',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveIntegerField(default=1)),
                ('name', models.CharField(max_length=100)),
                ('description', models.TextField(blank=True, default='')),
                ('order', models.PositiveIntegerField(default=0)),
                ('color', models.CharField(default='#3B82F6', max_length=7)),
                ('is_won', models.BooleanField(default=False)),
                ('is_lost', models.BooleanField(default=False)),
                ('is_active', models.BooleanField(default=True)),
                ('tenant', models.ForeignKey(editable=False, on_delete=django.db.models.deletion.CASCADE, to='tenancy.tenant')),
            ],
            options={
                'ordering': ['order', 'name'],
            },
        ),
        migrations.CreateModel(
            name='Opportunity',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveIntegerField(default=1)),
                ('title', models.CharField(max_length=200)),
                ('description', models.TextField(blank=True, default='')),
                ('value', models.DecimalField(decimal_places=2, default=0, max_digits=18)),
                ('currency', models.CharField(default='BRL', max_length=3)),
                ('probability', models.PositiveIntegerField(default=0)),
                ('expected_close_date', models.DateField(blank=True, null=True)),
                ('actual_close_date', models.DateField(blank=True, null=True)),
                ('status', models.CharField(choices=[('open', 'Em aberto'), ('won', 'Ganha'), ('lost', 'Perdida')], default='open', max_length=20)),
                ('lost_reason', models.TextField(blank=True, default='')),
                ('source', models.CharField(blank=True, default='', max_length=100)),
                ('notes', models.TextField(blank=True, default='')),
                ('assigned_to', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='opportunities', to=settings.AUTH_USER_MODEL)),
                ('converted_sale', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='opportunities', to='sales.sale')),
                ('customer', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='opportunities', to='people.person')),
                ('pipeline', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='opportunities', to='crm.pipeline')),
                ('stage', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='opportunities', to='crm.pipelinestage')),
                ('tenant', models.ForeignKey(editable=False, on_delete=django.db.models.deletion.CASCADE, to='tenancy.tenant')),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
    ]
