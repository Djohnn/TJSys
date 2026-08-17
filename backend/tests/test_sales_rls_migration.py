from decimal import Decimal

import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

from tenancy.context import reset_current_tenant_id, set_current_tenant_id

SALES_RLS_TABLES = (
    'sales_cashsession',
    'sales_cashmovement',
    'sales_sale',
    'sales_saleitem',
    'sales_salepayment',
    'sales_salereturn',
    'sales_salereturnitem',
    'sales_salerefund',
    'sales_salecancellation',
)


def _sales_rls_state():
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
                   COUNT(p.policyname)
            FROM pg_class c
            LEFT JOIN pg_policies p ON p.tablename = c.relname
            WHERE c.relname = ANY(%s)
            GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
            ORDER BY c.relname
            """,
            [list(SALES_RLS_TABLES)],
        )
        return cursor.fetchall()


def _sales_rls_policies():
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT tablename, policyname, cmd, qual, with_check
            FROM pg_policies
            WHERE tablename = ANY(%s)
            ORDER BY tablename
            """,
            [list(SALES_RLS_TABLES)],
        )
        return cursor.fetchall()


def _set_tenant(tenant_id):
    token = set_current_tenant_id(tenant_id)
    with connection.cursor() as cursor:
        cursor.execute('SET app.current_tenant_id = %s', [str(tenant_id)])
    return token


def _reset_tenant(token):
    reset_current_tenant_id(token)
    with connection.cursor() as cursor:
        cursor.execute('RESET app.current_tenant_id')


@pytest.mark.django_db(transaction=True)
def test_sales_rls_migration_enforces_tenant_isolation():
    """Given sales 0005, when 0006 runs, then all sales facts enforce tenant RLS."""
    historical_target = [('sales', '0005_salerefund_reason')]
    migrated_target = [('sales', '0006_enable_sales_rls')]
    executor = MigrationExecutor(connection)
    tenant_token = None

    try:
        executor.migrate(historical_target)
        historical_apps = executor.loader.project_state(historical_target).apps

        states_before = _sales_rls_state()
        assert len(states_before) == len(SALES_RLS_TABLES)
        assert all(
            not enabled and not forced and policies == 0
            for _, enabled, forced, policies in states_before
        ), states_before

        Tenant = historical_apps.get_model('tenancy', 'Tenant')
        Company = historical_apps.get_model('tenancy', 'Company')
        Branch = historical_apps.get_model('tenancy', 'Branch')
        User = historical_apps.get_model('accounts', 'CustomUser')
        CashSession = historical_apps.get_model('sales', 'CashSession')
        Sale = historical_apps.get_model('sales', 'Sale')
        SaleReturn = historical_apps.get_model('sales', 'SaleReturn')

        tenant_a = Tenant.objects.create(name='Sales RLS A', slug='sales-rls-a')
        tenant_b = Tenant.objects.create(name='Sales RLS B', slug='sales-rls-b')

        def create_sale_return(tenant, suffix):
            nonlocal tenant_token
            tenant_token = _set_tenant(tenant.id)
            user = User.objects.create(
                username=f'sales-rls-{suffix}',
                email=f'sales-rls-{suffix}@example.test',
                password='!',
            )
            company = Company.objects.create(tenant=tenant, name=f'Sales RLS Co {suffix}')
            branch = Branch.objects.create(
                tenant=tenant,
                company=company,
                name=f'Sales RLS Branch {suffix}',
            )
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
                gross_total=Decimal('10.00'),
                net_total=Decimal('10.00'),
            )
            sale_return = SaleReturn.objects.create(
                tenant=tenant,
                sale=sale,
                reason=f'Return {suffix}',
                status='completed',
            )
            _reset_tenant(tenant_token)
            tenant_token = None
            return sale_return

        return_a = create_sale_return(tenant_a, 'a')
        return_b = create_sale_return(tenant_b, 'b')

        executor.loader.build_graph()
        executor.migrate(migrated_target)
        migrated_apps = executor.loader.project_state(migrated_target).apps
        MigratedSaleReturn = migrated_apps.get_model('sales', 'SaleReturn')

        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT current_user, rolsuper, rolbypassrls
                FROM pg_roles
                WHERE rolname = current_user
                """
            )
            role, is_superuser, bypasses_rls = cursor.fetchone()
            cursor.execute(
                """
                SELECT pg_get_userbyid(relowner) = current_user
                FROM pg_class
                WHERE relname = ANY(%s)
                """,
                [list(SALES_RLS_TABLES)],
            )
            ownership = cursor.fetchall()

        assert role
        assert is_superuser is False
        assert bypasses_rls is False
        assert len(ownership) == len(SALES_RLS_TABLES)
        assert all(is_owner for (is_owner,) in ownership)

        states_after = _sales_rls_state()
        assert len(states_after) == len(SALES_RLS_TABLES)
        assert all(
            enabled and forced and policies == 1 for _, enabled, forced, policies in states_after
        ), states_after

        policies = _sales_rls_policies()
        assert [policy[1] for policy in policies] == [
            f'{table}_tenant_isolation' for table in sorted(SALES_RLS_TABLES)
        ]
        assert all(command == 'ALL' for _, _, command, _, _ in policies)
        assert all('current_setting' in using and 'tenant_id' in using for *_, using, _ in policies)
        assert all(
            'current_setting' in with_check and 'tenant_id' in with_check
            for *_, with_check in policies
        )

        tenant_token = _set_tenant(tenant_a.id)
        assert MigratedSaleReturn.objects.filter(pk=return_a.pk).exists() is True
        assert MigratedSaleReturn.objects.filter(pk=return_b.pk).exists() is False
        assert set(MigratedSaleReturn.objects.values_list('tenant_id', flat=True)) == {tenant_a.id}
        _reset_tenant(tenant_token)
        tenant_token = None

        executor.loader.build_graph()
        executor.migrate(historical_target)

        states_reversed = _sales_rls_state()
        assert len(states_reversed) == len(SALES_RLS_TABLES)
        assert all(
            not enabled and not forced and policies == 0
            for _, enabled, forced, policies in states_reversed
        ), states_reversed
    finally:
        if tenant_token is not None:
            _reset_tenant(tenant_token)
        executor.loader.build_graph()
        executor.migrate(migrated_target)
