from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0009_remove_productstockcontrolcommand_idx_pscc_tenant_corr_and_more'),
        ('inventory', '0003_storagetype'),
        ('inventory', '0003_movementreason'),
        ('inventory', '0003_replenishment'),
        ('inventory', '0003_inventorycount'),
    ]

    operations = []
