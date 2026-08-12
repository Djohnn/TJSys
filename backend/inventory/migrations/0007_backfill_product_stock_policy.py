from decimal import Decimal

from django.db import migrations


def _set_tenant_context(schema_editor, tenant_id):
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(
            'SELECT set_config(%s, %s, false)',
            ['app.current_tenant_id', str(tenant_id)],
        )


def _clear_tenant_context(schema_editor):
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(
            'SELECT set_config(%s, %s, false)',
            ['app.current_tenant_id', ''],
        )


def backfill_product_stock_policies(apps, schema_editor):
    """Create a default-limit policy for every existing tracked product location.

    Balances already exist for products that track inventory; the policy is the
    operational counterpart (min 0, reorder 0, no max, negatives off). No extra
    movements are created and balances are never touched. Runs per tenant so the
    row-level security context is honored on read.
    """
    ProductStockPolicy = apps.get_model('inventory', 'ProductStockPolicy')
    Product = apps.get_model('catalog', 'Product')
    StockBalance = apps.get_model('inventory', 'StockBalance')
    StockLocation = apps.get_model('inventory', 'StockLocation')
    Tenant = apps.get_model('tenancy', 'Tenant')

    for tenant in Tenant.objects.order_by('id'):
        _set_tenant_context(schema_editor, tenant.id)
        try:
            tracked_ids = set(
                Product.objects.filter(
                    tenant_id=tenant.id,
                    tracks_inventory=True,
                ).values_list('id', flat=True)
            )
            rows = (
                StockBalance.objects.filter(
                    tenant_id=tenant.id,
                    product_id__in=tracked_ids,
                )
                .values('product_id', 'location_id')
                .order_by('product_id', 'location_id')
                .distinct()
            )
            for row in rows:
                location = StockLocation.objects.filter(
                    id=row['location_id'],
                    tenant_id=tenant.id,
                ).select_related('branch').first()
                if location is None:
                    continue
                ProductStockPolicy.objects.update_or_create(
                    tenant_id=tenant.id,
                    product_id=row['product_id'],
                    branch_id=location.branch_id,
                    location_id=location.id,
                    defaults={
                        'minimum_quantity': Decimal('0'),
                        'maximum_quantity': None,
                        'reorder_point': Decimal('0'),
                        'allow_negative': False,
                        'is_active': True,
                    },
                )
        finally:
            _clear_tenant_context(schema_editor)


def remove_backfilled_product_stock_policies(apps, schema_editor):
    """Reverse removes only untouched default policies; never movements or balances."""
    ProductStockPolicy = apps.get_model('inventory', 'ProductStockPolicy')
    Tenant = apps.get_model('tenancy', 'Tenant')

    for tenant_id in Tenant.objects.order_by('id').values_list('id', flat=True):
        _set_tenant_context(schema_editor, tenant_id)
        try:
            ProductStockPolicy.objects.filter(
                tenant_id=tenant_id,
                minimum_quantity=Decimal('0'),
                maximum_quantity__isnull=True,
                reorder_point=Decimal('0'),
                allow_negative=False,
                is_active=True,
            ).delete()
        finally:
            _clear_tenant_context(schema_editor)


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0006_add_product_stock_policy'),
    ]

    operations = [
        migrations.RunPython(
            backfill_product_stock_policies,
            remove_backfilled_product_stock_policies,
        ),
    ]
