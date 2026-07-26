from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ('fiscal', '0002_add_purchase_fields_to_fiscaldocument'),
    ]

    operations = [
        migrations.RunSQL(
            sql=[
                (
                    'ALTER TABLE fiscal_fiscalproductconfig '
                    'ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true'
                ),
                (
                    'CREATE UNIQUE INDEX IF NOT EXISTS '
                    'uniq_active_fiscal_product_config '
                    'ON fiscal_fiscalproductconfig (tenant_id, product_id) '
                    'WHERE is_active'
                ),
            ],
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
