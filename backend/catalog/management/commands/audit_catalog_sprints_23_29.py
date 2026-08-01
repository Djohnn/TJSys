"""Read-only reconciliation audit for Catalog Sprints 23–29."""

from django.core.management.base import BaseCommand, CommandError
from django.db import connection
from django.db.models import Count, F

from catalog.models import Product, ProductChannelProfile, ProductImage
from tenancy.models import Tenant


class Command(BaseCommand):
    help = 'Audit catalog consistency without changing data.'

    def handle(self, *args, **options):
        findings: list[str] = []
        for tenant in Tenant.objects.order_by('id'):
            with connection.cursor() as cursor:
                cursor.execute(
                    'SELECT set_config(%s, %s, false)',
                    ['app.current_tenant_id', str(tenant.id)],
                )

            multiple_primary = (
                ProductImage.all_objects.filter(tenant=tenant, is_primary=True)
                .values('product_id')
                .annotate(total=Count('id'))
                .filter(total__gt=1)
            )
            if multiple_primary.exists():
                findings.append(f'{tenant.id}:multiple_primary_images')

            products = Product.all_objects.filter(tenant=tenant)
            images = ProductImage.all_objects.filter(tenant=tenant)
            profiles = ProductChannelProfile.all_objects.filter(tenant=tenant)
            if products.exclude(base_unit__tenant_id=F('tenant_id')).exists():
                findings.append(f'{tenant.id}:cross_tenant_base_unit')
            if images.exclude(product__tenant_id=F('tenant_id')).exists():
                findings.append(f'{tenant.id}:cross_tenant_product_image')
            if profiles.exclude(product__tenant_id=F('tenant_id')).exists():
                findings.append(f'{tenant.id}:cross_tenant_channel_profile')
            if products.filter(product_kind='servico', tracks_inventory=True).exists():
                findings.append(f'{tenant.id}:service_tracks_inventory')

        with connection.cursor() as cursor:
            cursor.execute('SELECT set_config(%s, %s, false)', ['app.current_tenant_id', ''])

        if findings:
            raise CommandError(';'.join(findings))
        self.stdout.write(self.style.SUCCESS('catalog_audit inconsistencies=0'))
