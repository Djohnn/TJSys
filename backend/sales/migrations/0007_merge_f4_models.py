from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ('sales', '0006_enable_sales_rls'),
        ('sales', '0003_commission'),
        ('sales', '0003_consignment'),
        ('sales', '0003_pricelist'),
    ]

    operations = []
