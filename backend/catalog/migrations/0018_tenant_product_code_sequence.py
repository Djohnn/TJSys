import uuid

import django.db.models.deletion
from django.db import migrations, models


def enable_rls(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    with schema_editor.connection.cursor() as cursor:
        cursor.execute('ALTER TABLE catalog_tenantproductcodesequence ENABLE ROW LEVEL SECURITY;')
        cursor.execute('ALTER TABLE catalog_tenantproductcodesequence FORCE ROW LEVEL SECURITY;')
        cursor.execute('DROP POLICY IF EXISTS tenant_product_code_sequence_policy ON catalog_tenantproductcodesequence;')
        cursor.execute('''
            CREATE POLICY tenant_product_code_sequence_policy ON catalog_tenantproductcodesequence
            FOR ALL USING (tenant_id::text = current_setting('app.current_tenant_id', TRUE))
            WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', TRUE));
        ''')


def disable_rls(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    with schema_editor.connection.cursor() as cursor:
        cursor.execute('DROP POLICY IF EXISTS tenant_product_code_sequence_policy ON catalog_tenantproductcodesequence;')
        cursor.execute('ALTER TABLE catalog_tenantproductcodesequence DISABLE ROW LEVEL SECURITY;')


class Migration(migrations.Migration):
    dependencies = [('catalog', '0017_normalize_known_unit_precision')]

    operations = [
        migrations.CreateModel(
            name='TenantProductCodeSequence',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('next_value', models.PositiveBigIntegerField(default=0)),
                ('tenant', models.ForeignKey(editable=False, on_delete=django.db.models.deletion.CASCADE, to='tenancy.tenant')),
            ],
            options={
                'constraints': [
                    models.UniqueConstraint(fields=('tenant',), name='uniq_tenant_product_code_sequence'),
                    models.CheckConstraint(condition=models.Q(('next_value__gte', 0), ('next_value__lt', 10000000000)), name='product_code_sequence_range'),
                ],
            },
        ),
        migrations.RunPython(enable_rls, disable_rls),
    ]
