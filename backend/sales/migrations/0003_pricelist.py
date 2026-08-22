import django.db.models.deletion
import uuid
from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('catalog', '0001_initial'),
        ('sales', '0001_initial'),
        ('tenancy', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='PriceList',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveIntegerField(default=1)),
                ('name', models.CharField(max_length=100)),
                ('description', models.TextField(blank=True, default='')),
                ('audience', models.CharField(choices=[('retail', 'Varejo'), ('wholesale', 'Atacado'), ('vip', 'VIP'), ('partner', 'Parceiro'), ('custom', 'Personalizado')], max_length=20)),
                ('is_default', models.BooleanField(default=False)),
                ('is_active', models.BooleanField(default=True)),
                ('valid_from', models.DateField(blank=True, null=True)),
                ('valid_until', models.DateField(blank=True, null=True)),
                ('priority', models.PositiveIntegerField(default=0)),
                ('tenant', models.ForeignKey(editable=False, on_delete=django.db.models.deletion.CASCADE, to='tenancy.tenant')),
            ],
            options={
                'ordering': ['priority', 'name'],
            },
        ),
        migrations.CreateModel(
            name='PriceListItem',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveIntegerField(default=1)),
                ('price', models.DecimalField(decimal_places=4, max_digits=18)),
                ('min_quantity', models.DecimalField(decimal_places=6, default=1, max_digits=18)),
                ('max_quantity', models.DecimalField(blank=True, decimal_places=6, max_digits=18, null=True)),
                ('discount_percentage', models.DecimalField(decimal_places=2, default=0, max_digits=18)),
                ('price_list', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='items', to='sales.pricelist')),
                ('product', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='price_list_items', to='catalog.product')),
                ('tenant', models.ForeignKey(editable=False, on_delete=django.db.models.deletion.CASCADE, to='tenancy.tenant')),
            ],
            options={
                'ordering': ['product__name'],
            },
        ),
    ]
