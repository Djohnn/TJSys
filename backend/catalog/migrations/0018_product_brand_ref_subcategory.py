from django.db import migrations, models
import django.db.models.deletion


def backfill_brand_refs(apps, schema_editor):
    Product = apps.get_model('catalog', 'Product')
    Brand = apps.get_model('catalog', 'Brand')
    for product in Product.objects.exclude(brand='').iterator():
        brand, _ = Brand.objects.get_or_create(
            tenant_id=product.tenant_id,
            name=product.brand,
            defaults={'is_active': True, 'version': 1},
        )
        Product.objects.filter(pk=product.pk).update(brand_ref_id=brand.pk)


class Migration(migrations.Migration):
    dependencies = [('catalog', '0017_tenant_product_code_sequence')]

    operations = [
        migrations.AddField(
            model_name='product',
            name='brand_ref',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='products', to='catalog.brand'),
        ),
        migrations.AddField(
            model_name='product',
            name='subcategory',
            field=models.CharField(blank=True, default='', max_length=120),
        ),
        migrations.RunPython(backfill_brand_refs, migrations.RunPython.noop),
    ]
