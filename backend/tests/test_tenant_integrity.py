import pytest
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import DatabaseError, connection, transaction

from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Branch, TenantMembership, UserBranch

User = get_user_model()


def set_context(tenant_id):
    token = set_current_tenant_id(tenant_id)
    with connection.cursor() as cursor:
        cursor.execute('SET app.current_tenant_id = %s', [str(tenant_id)])
    return token


@pytest.mark.django_db(transaction=True)
class TestTenantOrganizationIntegrity:
    def test_branch_rejects_tenant_different_from_company(
        self,
        tenant_alpha,
        tenant_beta,
        company_alpha,
    ):
        token = set_context(tenant_alpha.id)
        try:
            with pytest.raises(ValidationError):
                Branch.objects.create(
                    tenant=tenant_beta,
                    company=company_alpha,
                    name='Invalid Branch',
                )
        finally:
            reset_current_tenant_id(token)

    def test_database_trigger_rejects_inconsistent_branch(
        self,
        tenant_alpha,
        tenant_beta,
        company_alpha,
    ):
        token = set_context(tenant_beta.id)
        try:
            with pytest.raises(DatabaseError), transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        INSERT INTO tenancy_branch
                            (id, tenant_id, company_id, name, is_active, created_at, updated_at)
                        VALUES (gen_random_uuid(), %s, %s, 'Invalid Raw', true, now(), now())
                        """,
                        [str(tenant_beta.id), str(company_alpha.id)],
                    )
        finally:
            reset_current_tenant_id(token)

    def test_user_branch_requires_active_membership(
        self,
        tenant_alpha,
        tenant_beta,
        branch_alpha,
    ):
        user_b = User.objects.create_user(
            username='integrity-b',
            email='integrity-b@test.local',
            password='pass123',
        )
        TenantMembership.objects.create(user=user_b, tenant=tenant_beta, role='operator')

        with pytest.raises(ValidationError):
            UserBranch.objects.create(user=user_b, branch=branch_alpha)

    def test_user_branch_accepts_matching_membership(
        self,
        user_alpha,
        branch_alpha,
    ):
        link = UserBranch.objects.create(user=user_alpha, branch=branch_alpha)
        assert link.pk is not None
