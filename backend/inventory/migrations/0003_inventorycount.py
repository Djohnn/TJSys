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
            name='InventoryCount',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now, editable=False)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveIntegerField(default=1)),
                ('status', models.CharField(choices=[('draft', 'Rascunho'), ('in_progress', 'Em andamento'), ('completed', 'Concluido'), ('cancelled', 'Cancelado')], default='draft', max_length=20)),
                ('notes', models.TextField(blank=True, default='')),
                ('started_at', models.DateTimeField(blank=True, null=True)),
                ('completed_at', models.DateTimeField(blank=True, null=True)),
                ('counted_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='inventory_counts', to=settings.AUTH_USER_MODEL)),
                ('location', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='inventory_counts', to='inventory.stocklocation')),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='%(class)s_set', to='tenancy.tenant')),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='InventoryCountItem',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now, editable=False)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveIntegerField(default=1)),
                ('system_quantity', models.DecimalField(decimal_places=6, max_digits=18)),
                ('counted_quantity', models.DecimalField(blank=True, decimal_places=6, max_digits=18, null=True)),
                ('difference', models.DecimalField(blank=True, decimal_places=6, max_digits=18, null=True)),
                ('notes', models.TextField(blank=True, default='')),
                ('count', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='items', to='inventory.inventorycount')),
                ('product', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='inventory_count_items', to='catalog.product')),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='%(class)s_set', to='tenancy.tenant')),
            ],
            options={
                'ordering': ['product__name'],
            },
        ),
    ]
