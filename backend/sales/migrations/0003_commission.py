import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('catalog', '0001_initial'),
        ('sales', '0001_initial'),
        ('tenancy', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='CommissionRule',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveIntegerField(default=1)),
                ('name', models.CharField(max_length=100)),
                ('description', models.TextField(blank=True, default='')),
                ('rule_type', models.CharField(choices=[('percentage', 'Percentual'), ('fixed', 'Fixo')], max_length=20)),
                ('value', models.DecimalField(decimal_places=4, max_digits=18)),
                ('min_sale_value', models.DecimalField(decimal_places=2, default=0, max_digits=18)),
                ('max_sale_value', models.DecimalField(blank=True, decimal_places=2, max_digits=18, null=True)),
                ('is_active', models.BooleanField(default=True)),
                ('category', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='commission_rules', to='catalog.category')),
                ('product', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='commission_rules', to='catalog.product')),
                ('tenant', models.ForeignKey(editable=False, on_delete=django.db.models.deletion.CASCADE, to='tenancy.tenant')),
            ],
            options={
                'ordering': ['name'],
            },
        ),
        migrations.CreateModel(
            name='Commission',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveIntegerField(default=1)),
                ('status', models.CharField(choices=[('pending', 'Pendente'), ('approved', 'Aprovada'), ('paid', 'Paga'), ('cancelled', 'Cancelada')], default='pending', max_length=20)),
                ('sale_value', models.DecimalField(decimal_places=2, max_digits=18)),
                ('commission_value', models.DecimalField(decimal_places=2, max_digits=18)),
                ('notes', models.TextField(blank=True, default='')),
                ('approved_at', models.DateTimeField(blank=True, null=True)),
                ('paid_at', models.DateTimeField(blank=True, null=True)),
                ('idempotency_key', models.CharField(blank=True, default='', max_length=100)),
                ('payload_hash', models.CharField(blank=True, default='', max_length=64)),
                ('operator', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='commissions', to=settings.AUTH_USER_MODEL)),
                ('rule', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='commissions', to='sales.commissionrule')),
                ('sale', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='commissions', to='sales.sale')),
                ('tenant', models.ForeignKey(editable=False, on_delete=django.db.models.deletion.CASCADE, to='tenancy.tenant')),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddConstraint(
            model_name='commission',
            constraint=models.UniqueConstraint(
                condition=models.Q(idempotency_key__gt=''),
                fields=['tenant', 'idempotency_key'],
                name='uniq_commission_tenant_idempotency',
            ),
        ),
    ]
