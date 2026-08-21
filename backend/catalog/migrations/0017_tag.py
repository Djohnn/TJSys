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
            name='Tag',
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
                ('name', models.CharField(max_length=80)),
                ('color', models.CharField(blank=True, default='#6B7280', max_length=7)),
                ('is_active', models.BooleanField(default=True)),
                ('version', models.PositiveIntegerField(default=1)),
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
                'ordering': ['name'],
                'constraints': [
                    models.UniqueConstraint(
                        fields=('tenant', 'name'),
                        condition=models.Q(is_active=True),
                        name='uniq_tag_tenant_name_active',
                    ),
                ],
            },
        ),
    ]
