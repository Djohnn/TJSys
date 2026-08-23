import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('catalog', '0001_initial'),
        ('inventory', '0001_initial'),
        ('tenancy', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='ReplenishmentRule',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now, editable=False)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveIntegerField(default=1)),
                ('trigger_type', models.CharField(choices=[('min', 'Estoque Minimo'), ('periodic', 'Periodico'), ('demand', 'Demanda')], max_length=20)),
                ('min_quantity', models.DecimalField(decimal_places=6, default=0, max_digits=18)),
                ('max_quantity', models.DecimalField(decimal_places=6, default=0, max_digits=18)),
                ('reorder_quantity', models.DecimalField(decimal_places=6, default=0, max_digits=18)),
                ('is_active', models.BooleanField(default=True)),
                ('location', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='replenishment_rules', to='inventory.stocklocation')),
                ('product', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='replenishment_rules', to='catalog.product')),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='%(class)s_set', to='tenancy.tenant')),
            ],
            options={
                'ordering': ['product__name', 'location__name'],
            },
        ),
        migrations.CreateModel(
            name='ReplenishmentOrder',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now, editable=False)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveIntegerField(default=1)),
                ('status', models.CharField(choices=[('draft', 'Rascunho'), ('pending', 'Pendente'), ('approved', 'Aprovado'), ('completed', 'Concluido'), ('cancelled', 'Cancelado')], default='draft', max_length=20)),
                ('quantity', models.DecimalField(decimal_places=6, max_digits=18)),
                ('notes', models.TextField(blank=True, default='')),
                ('approved_at', models.DateTimeField(blank=True, null=True)),
                ('completed_at', models.DateTimeField(blank=True, null=True)),
                ('approved_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='replenishment_approvals', to=settings.AUTH_USER_MODEL)),
                ('rule', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='orders', to='inventory.replenishmentrule')),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='%(class)s_set', to='tenancy.tenant')),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
    ]
