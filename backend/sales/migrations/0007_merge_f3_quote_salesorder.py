from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0002_quote_quoteitem'),
        ('sales', '0002_salesorder_salesorderitem'),
        ('sales', '0006_enable_sales_rls'),
    ]

    operations = []
