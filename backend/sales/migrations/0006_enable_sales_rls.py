from django.db import migrations

SALES_RLS_TABLES = (
    'sales_cashsession',
    'sales_cashmovement',
    'sales_sale',
    'sales_saleitem',
    'sales_salepayment',
    'sales_salereturn',
    'sales_salereturnitem',
    'sales_salerefund',
    'sales_salecancellation',
)


def enable_sales_rls(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    with schema_editor.connection.cursor() as cursor:
        for table in SALES_RLS_TABLES:
            policy = f'{table}_tenant_isolation'
            cursor.execute(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY')
            cursor.execute(f'ALTER TABLE "{table}" FORCE ROW LEVEL SECURITY')
            cursor.execute(f'DROP POLICY IF EXISTS "{policy}" ON "{table}"')
            cursor.execute(
                f'''
                CREATE POLICY "{policy}" ON "{table}"
                FOR ALL
                USING (
                    NULLIF(current_setting('app.current_tenant_id', true), '')::uuid = tenant_id
                )
                WITH CHECK (
                    NULLIF(current_setting('app.current_tenant_id', true), '')::uuid = tenant_id
                )
                '''
            )


def disable_sales_rls(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    with schema_editor.connection.cursor() as cursor:
        for table in reversed(SALES_RLS_TABLES):
            policy = f'{table}_tenant_isolation'
            cursor.execute(f'DROP POLICY IF EXISTS "{policy}" ON "{table}"')
            cursor.execute(f'ALTER TABLE "{table}" NO FORCE ROW LEVEL SECURITY')
            cursor.execute(f'ALTER TABLE "{table}" DISABLE ROW LEVEL SECURITY')


class Migration(migrations.Migration):
    dependencies = [
        ('sales', '0005_salerefund_reason'),
    ]

    operations = [
        migrations.RunPython(enable_sales_rls, disable_sales_rls),
    ]
