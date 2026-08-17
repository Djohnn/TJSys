"""Read-only reconciliation audit for product stock policies."""

from django.core.management.base import BaseCommand, CommandError
from django.db import connection

from catalog.models import Product
from inventory.models import ProductStockPolicy, StockBalance
from tenancy.models import Tenant


class Command(BaseCommand):
    help = 'Audit product stock policy consistency without changing data.'

    def handle(self, *args, **options):
        findings: list[str] = []
        policies_count = 0
        tenants_count = 0

        for tenant in Tenant.objects.order_by('id'):
            tenants_count += 1
            with connection.cursor() as cursor:
                cursor.execute(
                    'SELECT set_config(%s, %s, false)',
                    ['app.current_tenant_id', str(tenant.id)],
                )

            policies = ProductStockPolicy.all_objects.filter(tenant=tenant)
            policies_count += policies.count()

            tracked = Product.all_objects.filter(tenant=tenant, tracks_inventory=True)
            tracked_balances = (
                StockBalance.all_objects.filter(tenant=tenant, product__in=tracked)
                .values_list('product_id', 'location_id')
                .distinct()
            )
            for product_id, location_id in tracked_balances:
                if not policies.filter(
                    product_id=product_id,
                    location_id=location_id,
                    is_active=True,
                ).exists():
                    findings.append(f'{tenant.id}:missing_policy:{product_id}:{location_id}')

            for policy in policies.select_related('product', 'location'):
                if policy.location.branch_id != policy.branch_id:
                    findings.append(f'{tenant.id}:branch_mismatch:{policy.id}')
                if policy.product.product_kind == 'servico' and policy.is_active:
                    findings.append(f'{tenant.id}:service_policy:{policy.id}')
                if (
                    policy.maximum_quantity is not None
                    and policy.maximum_quantity < policy.minimum_quantity
                ):
                    findings.append(f'{tenant.id}:max_lt_min:{policy.id}')

            for balance in StockBalance.all_objects.filter(
                tenant=tenant,
                quantity__lt=0,
            ):
                policy = policies.filter(
                    product_id=balance.product_id,
                    location_id=balance.location_id,
                    is_active=True,
                ).first()
                if not policy or not policy.allow_negative:
                    findings.append(
                        f'{tenant.id}:negative_without_permission:{balance.id}'
                    )

        with connection.cursor() as cursor:
            cursor.execute(
                'SELECT set_config(%s, %s, false)',
                ['app.current_tenant_id', ''],
            )

        if findings:
            raise CommandError(';'.join(findings))
        self.stdout.write(
            self.style.SUCCESS(
                f'product_stock_policy_audit tenants={tenants_count} '
                f'policies={policies_count} findings=0'
            )
        )
