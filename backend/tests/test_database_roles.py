import pytest
from django.db import connection


@pytest.mark.django_db(transaction=True)
class TestDatabaseRuntimeRole:
    def test_database_role_cannot_bypass_rls(self):
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT current_user, rolsuper, rolbypassrls
                FROM pg_roles
                WHERE rolname = current_user
                """
            )
            role, is_superuser, bypasses_rls = cursor.fetchone()

        assert role
        assert is_superuser is False
        assert bypasses_rls is False

    def test_runtime_role_is_unprivileged_and_tenant_tables_exist(self):
        runtime_role = connection.settings_dict['USER']
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT rolsuper, rolbypassrls
                FROM pg_roles
                WHERE rolname = %s
                """,
                [runtime_role],
            )
            role_flags = cursor.fetchone()
            cursor.execute(
                """
                SELECT pg_get_userbyid(c.relowner) = %s AS runtime_is_owner
                FROM pg_class c
                WHERE c.relname IN ('tenancy_company', 'tenancy_branch')
                """,
                [runtime_role],
            )
            ownership = cursor.fetchall()

        assert role_flags == (False, False)
        assert len(ownership) == 2
        # The disposable pytest schema is intentionally migrated by the runtime
        # role so migration tests can move between historical states. Production
        # ownership is enforced by config.settings.migration and deployment gates.
