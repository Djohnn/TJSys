import pytest
from django.db import DatabaseError, connection, transaction
from django.test import TestCase

from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Branch, Company


class TenantContext:
    def __init__(self, tenant_id):
        self.tenant_id = tenant_id
        self.token = None

    def __enter__(self):
        self.token = set_current_tenant_id(self.tenant_id)
        with connection.cursor() as cursor:
            cursor.execute('SET app.current_tenant_id = %s', [str(self.tenant_id)])
        return self

    def __exit__(self, exc_type, exc, traceback):
        reset_current_tenant_id(self.token)


@pytest.mark.django_db(transaction=True)
class TestApplicationIsolation:
    def test_default_manager_denies_queries_without_context(self, company_alpha):
        with connection.cursor() as cursor:
            cursor.execute("SET app.current_tenant_id = ''")
        assert Company.objects.count() == 0

    def test_default_manager_uses_current_tenant(
        self,
        tenant_alpha,
        tenant_beta,
        company_alpha,
        company_beta,
    ):
        with TenantContext(tenant_alpha.id):
            assert list(Company.objects.all()) == [company_alpha]
        with TenantContext(tenant_beta.id):
            assert list(Company.objects.all()) == [company_beta]

    def test_branch_inherits_tenant_from_company(self, tenant_alpha, company_alpha):
        with TenantContext(tenant_alpha.id):
            branch = Branch.objects.create(company=company_alpha, name='Auto Tenant Branch')
            assert branch.tenant_id == tenant_alpha.id


@pytest.mark.django_db(transaction=True)
class TestRLSIsolation:
    def test_rls_policies_exist_and_are_forced(self):
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
                       COUNT(p.policyname)
                FROM pg_class c
                LEFT JOIN pg_policies p ON p.tablename = c.relname
                WHERE c.relname IN ('tenancy_company', 'tenancy_branch')
                GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
                ORDER BY c.relname
                """
            )
            rows = cursor.fetchall()
        assert len(rows) == 2
        assert all(enabled and forced and policies >= 1 for _, enabled, forced, policies in rows)

    def test_rls_denies_read_without_context(self, company_alpha):
        with connection.cursor() as cursor:
            cursor.execute("SET app.current_tenant_id = ''")
            cursor.execute('SELECT COUNT(*) FROM tenancy_company')
            assert cursor.fetchone()[0] == 0

    def test_rls_filters_cross_tenant_reads(
        self,
        tenant_alpha,
        tenant_beta,
        company_alpha,
        company_beta,
    ):
        with connection.cursor() as cursor:
            cursor.execute('SET app.current_tenant_id = %s', [str(tenant_alpha.id)])
            cursor.execute('SELECT id FROM tenancy_company ORDER BY id')
            assert {row[0] for row in cursor.fetchall()} == {company_alpha.id}
            cursor.execute('SET app.current_tenant_id = %s', [str(tenant_beta.id)])
            cursor.execute('SELECT id FROM tenancy_company ORDER BY id')
            assert {row[0] for row in cursor.fetchall()} == {company_beta.id}

    def test_rls_blocks_cross_tenant_insert(self, tenant_alpha, tenant_beta):
        with connection.cursor() as cursor:
            cursor.execute('SET app.current_tenant_id = %s', [str(tenant_alpha.id)])
        with pytest.raises(DatabaseError), transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO tenancy_company
                        (id, tenant_id, name, is_active, created_at, updated_at)
                    VALUES (gen_random_uuid(), %s, 'Blocked', true, now(), now())
                    """,
                    [str(tenant_beta.id)],
                )


class TestPublicEndpoints(TestCase):
    def test_health_endpoint_public(self):
        response = self.client.get('/health/')
        self.assertEqual(response.status_code, 200)
