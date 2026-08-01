# Generated manually for Sprint 29 — ProductChannelProfile

import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('catalog', '0011_sprint28_label_template'),
        ('tenancy', '0007_sprint7_fiscal_models'),
    ]

    operations = [
        migrations.CreateModel(
            name='ProductChannelProfile',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('channel_slug', models.CharField(max_length=60)),
                ('title', models.CharField(blank=True, default='', max_length=200)),
                ('description', models.TextField(blank=True, default='')),
                ('list_price', models.DecimalField(blank=True, decimal_places=4, max_digits=18, null=True)),
                ('sale_price', models.DecimalField(blank=True, decimal_places=4, max_digits=18, null=True)),
                ('dimensions_json', models.JSONField(blank=True, default=dict)),
                ('weight_grams', models.PositiveIntegerField(blank=True, null=True)),
                ('status', models.CharField(choices=[('draft', 'Draft'), ('ready', 'Ready'), ('published', 'Published'), ('failed', 'Failed')], default='draft', max_length=20)),
                ('version', models.PositiveIntegerField(default=1)),
                ('published_at', models.DateTimeField(blank=True, null=True)),
                ('product', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='channel_profiles', to='catalog.product')),
                ('tenant', models.ForeignKey(editable=False, on_delete=django.db.models.deletion.CASCADE, to='tenancy.tenant')),
            ],
            options={
                'constraints': [models.UniqueConstraint(models.F('tenant'), models.F('product'), models.F('channel_slug'), name='uniq_channel_profile_prod_slug')],
            },
        ),
    ]
