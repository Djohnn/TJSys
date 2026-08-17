from django.db import migrations


def set_kg_precision(apps, schema_editor):
    Unit = apps.get_model('catalog', 'Unit')
    Tenant = apps.get_model('tenancy', 'Tenant')
    connection = schema_editor.connection if schema_editor is not None else Unit._base_manager.db

    from django.db import connections

    database = connections[connection] if isinstance(connection, str) else connection
    with database.cursor() as cursor:
        for tenant_id in Tenant.objects.values_list('id', flat=True).iterator():
            cursor.execute(
                "SELECT set_config('app.current_tenant_id', %s, true)",
                [str(tenant_id)],
            )
            Unit._base_manager.filter(
                tenant_id=tenant_id,
                symbol__iexact='KG',
                precision=0,
            ).update(precision=3)
        cursor.execute("SELECT set_config('app.current_tenant_id', '', true)")


class Migration(migrations.Migration):
    dependencies = [('catalog', '0016_product_subcategory')]

    operations = [
        migrations.RunPython(set_kg_precision, migrations.RunPython.noop),
    ]
