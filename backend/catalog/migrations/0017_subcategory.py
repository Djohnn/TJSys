import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('catalog', '0016_product_subcategory'),
        ('tenancy', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='SubCategory',
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
                ('name', models.CharField(max_length=120)),
                ('code', models.CharField(blank=True, default='', max_length=40)),
                ('is_active', models.BooleanField(default=True)),
                ('version', models.PositiveIntegerField(default=1)),
                (
                    'category',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='subcategories',
                        to='catalog.category',
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
                'ordering': ['category', 'name'],
                'constraints': [
                    models.UniqueConstraint(
                        fields=('tenant', 'category', 'name'),
                        name='uniq_subcategory_tenant_category_name',
                    ),
                    models.UniqueConstraint(
                        fields=('tenant', 'code'),
                        condition=models.Q(~models.Q(code='')),
                        name='uniq_subcategory_tenant_code',
                    ),
                ],
            },
        ),
    ]
