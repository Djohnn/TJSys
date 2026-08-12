from decimal import Decimal

import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

from tenancy.context import reset_current_tenant_id, set_current_tenant_id


@pytest.mark.django_db(transaction=True)
def test_refund_reason_migration_backfills_legacy_refunds():
    """Given a refund created at sales 0004, when 0005 runs, then it receives the legacy reason."""
    historical_target = [('sales', '0004_sale_customer')]
    migrated_target = [('sales', '0005_salerefund_reason')]
    executor = MigrationExecutor(connection)
    tenant_token = None

    try:
        executor.migrate(historical_target)
        historical_apps = executor.loader.project_state(historical_target).apps

        Tenant = historical_apps.get_model('tenancy', 'Tenant')
        Company = historical_apps.get_model('tenancy', 'Company')
        Branch = historical_apps.get_model('tenancy', 'Branch')
        User = historical_apps.get_model('accounts', 'CustomUser')
        CashSession = historical_apps.get_model('sales', 'CashSession')
        Sale = historical_apps.get_model('sales', 'Sale')
        SaleRefund = historical_apps.get_model('sales', 'SaleRefund')

        assert 'reason' not in {field.name for field in SaleRefund._meta.fields}

        tenant = Tenant.objects.create(name='Legacy Refund', slug='legacy-refund')
        tenant_token = set_current_tenant_id(tenant.id)
        with connection.cursor() as cursor:
            cursor.execute('SET app.current_tenant_id = %s', [str(tenant.id)])

        user = User.objects.create(
            username='legacy-refund-user',
            email='legacy-refund@example.test',
            password='!',
        )
        company = Company.objects.create(tenant=tenant, name='Legacy Refund Co')
        branch = Branch.objects.create(tenant=tenant, company=company, name='Legacy Refund Branch')
        cash_session = CashSession.objects.create(
            tenant=tenant,
            branch=branch,
            operator=user,
            opening_amount=Decimal('0'),
        )
        sale = Sale.objects.create(
            tenant=tenant,
            branch=branch,
            cash_session=cash_session,
            operator=user,
        )
        legacy_refund = SaleRefund.objects.create(
            tenant=tenant,
            sale=sale,
            method='cash',
            amount=Decimal('10.00'),
        )

        executor.loader.build_graph()
        executor.migrate(migrated_target)
        migrated_apps = executor.loader.project_state(migrated_target).apps
        MigratedSaleRefund = migrated_apps.get_model('sales', 'SaleRefund')

        migrated_refund = MigratedSaleRefund.objects.get(pk=legacy_refund.pk)
        assert migrated_refund.reason == 'Legacy refund'
    finally:
        if tenant_token is not None:
            reset_current_tenant_id(tenant_token)
            with connection.cursor() as cursor:
                cursor.execute('RESET app.current_tenant_id')
        executor.loader.build_graph()
        executor.migrate(migrated_target)
