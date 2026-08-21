import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('catalog', '0001_initial'),
        ('people', '0001_initial'),
        ('sales', '0001_initial'),
        ('tenancy', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Consignment',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now, editable=False)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveIntegerField(default=1)),
                ('status', models.CharField(choices=[('draft', 'Rascunho'), ('active', 'Ativo'), ('closed', 'Fechado'), ('cancelled', 'Cancelado')], default='draft', max_length=20)),
                ('consignment_number', models.CharField(max_length=50, unique=True)),
                ('expected_return_date', models.DateField(blank=True, null=True)),
                ('actual_return_date', models.DateField(blank=True, null=True)),
                ('notes', models.TextField(blank=True, default='')),
                ('gross_total', models.DecimalField(decimal_places=2, default=0, max_digits=18)),
                ('discount_total', models.DecimalField(decimal_places=2, default=0, max_digits=18)),
                ('net_total', models.DecimalField(decimal_places=2, default=0, max_digits=18)),
                ('idempotency_key', models.CharField(blank=True, default='', max_length=100)),
                ('payload_hash', models.CharField(blank=True, default='', max_length=64)),
                ('branch', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='consignments', to='tenancy.branch')),
                ('converted_sale', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='consignments', to='sales.sale')),
                ('customer', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='consignments', to='people.person')),
                ('operator', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='consignments', to=settings.AUTH_USER_MODEL)),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='%(class)s_set', to='tenancy.tenant')),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='ConsignmentItem',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now, editable=False)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveIntegerField(default=1)),
                ('quantity', models.DecimalField(decimal_places=6, max_digits=18)),
                ('returned_quantity', models.DecimalField(decimal_places=6, default=0, max_digits=18)),
                ('factor', models.DecimalField(decimal_places=6, default=1, max_digits=18)),
                ('unit_price', models.DecimalField(decimal_places=4, max_digits=18)),
                ('discount_amount', models.DecimalField(decimal_places=2, default=0, max_digits=18)),
                ('line_total', models.DecimalField(decimal_places=2, max_digits=18)),
                ('notes', models.TextField(blank=True, default='')),
                ('consignment', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='items', to='sales.consignment')),
                ('product', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='consignment_items', to='catalog.product')),
                ('unit', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='consignment_items', to='catalog.unit')),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='%(class)s_set', to='tenancy.tenant')),
            ],
            options={
                'ordering': ['created_at'],
            },
        ),
        migrations.AddConstraint(
            model_name='consignment',
            constraint=models.UniqueConstraint(
                condition=models.Q(idempotency_key__gt=''),
                fields=['tenant', 'idempotency_key'],
                name='uniq_consignment_tenant_idempotency',
            ),
        ),
    ]
