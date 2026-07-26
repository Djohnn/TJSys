from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ('fiscal', '0003_repair_fiscal_product_config_active'),
    ]

    operations = [
        migrations.RunSQL(
            sql=[
                (
                    'ALTER TABLE fiscal_fiscalemitter '
                    'ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true'
                ),
                (
                    'CREATE UNIQUE INDEX IF NOT EXISTS '
                    'uniq_active_fiscal_emitter_provider_branch '
                    'ON fiscal_fiscalemitter (tenant_id, branch_id, provider) '
                    'WHERE is_active'
                ),
            ],
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
