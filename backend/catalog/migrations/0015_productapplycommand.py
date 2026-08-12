import uuid

from django.db import migrations, models
import django.db.models.deletion


TABLE = 'catalog_productapplycommand'
POLICY = f'{TABLE}_tenant_isolation'


def enable_rls(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(f'ALTER TABLE "{TABLE}" ENABLE ROW LEVEL SECURITY')
        cursor.execute(f'ALTER TABLE "{TABLE}" FORCE ROW LEVEL SECURITY')
        cursor.execute(
            f'''CREATE POLICY "{POLICY}" ON "{TABLE}"
            USING (tenant_id::text = current_setting('app.current_tenant_id', true)
                   AND current_setting('app.current_tenant_id', true) <> '')
            WITH CHECK (tenant_id::text = current_setting('app.current_tenant_id', true)
                        AND current_setting('app.current_tenant_id', true) <> '')'''
        )


def disable_rls(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(f'DROP POLICY IF EXISTS "{POLICY}" ON "{TABLE}"')
        cursor.execute(f'ALTER TABLE "{TABLE}" NO FORCE ROW LEVEL SECURITY')
        cursor.execute(f'ALTER TABLE "{TABLE}" DISABLE ROW LEVEL SECURITY')


class Migration(migrations.Migration):
    dependencies = [
        ('catalog', '0014_productimage_file_alter_productimage_object_key'),
        ('tenancy', '0007_sprint7_fiscal_models'),
    ]

    operations = [
        migrations.CreateModel(
            name='ProductApplyCommand',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('command_id', models.CharField(max_length=80)),
                ('payload_hash', models.CharField(max_length=64)),
                ('response_json', models.JSONField(blank=True, default=dict)),
                ('correlation_id', models.UUIDField()),
                ('tenant', models.ForeignKey(editable=False, on_delete=django.db.models.deletion.CASCADE, to='tenancy.tenant')),
            ],
            options={
                'constraints': [models.UniqueConstraint(fields=('tenant', 'command_id'), name='uniq_product_apply_command_tenant_id')],
            },
        ),
        migrations.RunPython(enable_rls, disable_rls),
    ]
