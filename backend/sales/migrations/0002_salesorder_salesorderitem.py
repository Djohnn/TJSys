import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0002_quote_quoteitem'),
        ('tenancy', '0001_initial'),
        ('people', '0001_initial'),
        ('catalog', '0016_product_subcategory'),
    ]

    operations = [
        migrations.CreateModel(
            name='SalesOrder',
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
                ('order_number', models.CharField(blank=True, default='', max_length=30)),
                ('expected_date', models.DateField(blank=True, null=True)),
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
                        related_name='sales_orders',
                        to='tenancy.branch',
                    ),
                ),
                (
                    'converted_sale',
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name='converted_orders',
                        to='sales.sale',
                    ),
                ),
                (
                    'customer',
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name='sales_orders',
                        to='people.person',
                    ),
                ),
                (
                    'operator',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name='sales_orders',
                        to='accounts.customuser',
                    ),
                ),
                (
                    'quote',
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name='sales_orders',
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
                'ordering': ['-created_at'],
                'constraints': [
                    models.UniqueConstraint(
                        fields=('tenant', 'order_number'),
                        condition=models.Q(order_number__gt=''),
                        name='uniq_salesorder_tenant_number',
                    ),
                    models.UniqueConstraint(
                        fields=('tenant', 'idempotency_key'),
                        condition=models.Q(idempotency_key__gt=''),
                        name='uniq_salesorder_tenant_idempotency',
                    ),
                ],
            },
        ),
        migrations.CreateModel(
            name='SalesOrderItem',
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
                    'order',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='items',
                        to='sales.salesorder',
                    ),
                ),
                (
                    'product',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name='sales_order_items',
                        to='catalog.product',
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
                'ordering': ['order', 'created_at'],
            },
        ),
    ]
