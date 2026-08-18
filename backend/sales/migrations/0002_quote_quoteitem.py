import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0001_initial'),
        ('tenancy', '0001_initial'),
        ('people', '0001_initial'),
        ('catalog', '0016_product_subcategory'),
    ]

    operations = [
        migrations.CreateModel(
            name='Quote',
            fields=[
                (
                    'id',
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveIntegerField(default=1)),
                ('status', models.CharField(max_length=20, default='draft')),
                ('quote_number', models.CharField(blank=True, default='', max_length=30)),
                ('valid_until', models.DateField(blank=True, null=True)),
                ('notes', models.TextField(blank=True, default='')),
                ('gross_total', models.DecimalField(decimal_places=2, default=0, max_digits=18)),
                ('discount_total', models.DecimalField(decimal_places=2, default=0, max_digits=18)),
                ('net_total', models.DecimalField(decimal_places=2, default=0, max_digits=18)),
                ('idempotency_key', models.CharField(blank=True, default='', max_length=100)),
                ('payload_hash', models.CharField(blank=True, default='', max_length=64)),
                (
                    'branch',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name='quotes',
                        to='tenancy.branch',
                    ),
                ),
                (
                    'converted_sale',
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name='converted_quotes',
                        to='sales.sale',
                    ),
                ),
                (
                    'customer',
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name='quotes',
                        to='people.person',
                    ),
                ),
                (
                    'operator',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name='quotes',
                        to='accounts.customuser',
                    ),
                ),
                (
                    'tenant',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='%(class)s_set',
                        to='tenancy.tenant',
                    ),
                ),
            ],
            options={
                'ordering': ['-created_at'],
                'constraints': [
                    models.UniqueConstraint(
                        fields=('tenant', 'quote_number'),
                        condition=models.Q(quote_number__gt=''),
                        name='uniq_quote_tenant_number',
                    ),
                    models.UniqueConstraint(
                        fields=('tenant', 'idempotency_key'),
                        condition=models.Q(idempotency_key__gt=''),
                        name='uniq_quote_tenant_idempotency',
                    ),
                ],
            },
        ),
        migrations.CreateModel(
            name='QuoteItem',
            fields=[
                (
                    'id',
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveIntegerField(default=1)),
                ('quantity', models.DecimalField(decimal_places=6, max_digits=18)),
                ('unit_price', models.DecimalField(decimal_places=4, max_digits=18)),
                ('discount', models.DecimalField(decimal_places=2, default=0, max_digits=18)),
                ('notes', models.TextField(blank=True, default='')),
                (
                    'product',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name='quote_items',
                        to='catalog.product',
                    ),
                ),
                (
                    'quote',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='items',
                        to='sales.quote',
                    ),
                ),
                (
                    'tenant',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='%(class)s_set',
                        to='tenancy.tenant',
                    ),
                ),
            ],
            options={
                'ordering': ['quote', 'created_at'],
            },
        ),
    ]
