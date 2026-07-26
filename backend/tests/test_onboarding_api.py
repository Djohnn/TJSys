import re

import pytest
from django.contrib.auth import get_user_model
from django.core import mail
from django.db import connection

from accounts.services.onboarding import register_organization
from tenancy.models import Branch, Company, TenantMembership

User = get_user_model()


@pytest.mark.django_db(transaction=True)
def test_register_creates_complete_organization_atomically(client):
    response = client.post(
        '/api/v1/auth/register/',
        data={
            'email': ' Owner@Example.Test ',
            'password': 'A-strong-test-password-2026',
            'tenant_name': 'Casa Animal',
            'company_name': 'Casa Animal Comércio',
            'branch_name': 'Matriz',
        },
        content_type='application/json',
    )

    assert response.status_code == 202
    user = User.objects.get(email='owner@example.test')
    assert user.email_verified_at is None
    membership = TenantMembership.objects.get(user=user, role='admin')
    with connection.cursor() as cursor:
        cursor.execute('SET app.current_tenant_id = %s', [str(membership.tenant_id)])
    assert Company.all_objects.filter(tenant=membership.tenant).count() == 1
    assert Branch.all_objects.filter(tenant=membership.tenant).count() == 1
    assert len(mail.outbox) == 1
    assert 'A-strong-test-password-2026' not in mail.outbox[0].body


@pytest.mark.django_db(transaction=True)
def test_confirmation_token_is_single_use(client):
    client.post(
        '/api/v1/auth/register/',
        data={
            'email': 'confirm@example.test',
            'password': 'A-strong-test-password-2026',
            'tenant_name': 'Confirm Tenant',
            'company_name': 'Confirm Company',
            'branch_name': 'Confirm Branch',
        },
        content_type='application/json',
    )
    token = re.search(r'token=([^\s]+)', mail.outbox[0].body).group(1)

    first = client.post(
        '/api/v1/auth/email/confirm/',
        {'token': token},
        content_type='application/json',
    )
    second = client.post(
        '/api/v1/auth/email/confirm/',
        {'token': token},
        content_type='application/json',
    )

    assert first.status_code == 204
    assert second.status_code == 400
    assert User.objects.get(email='confirm@example.test').email_verified_at is not None


@pytest.mark.django_db(transaction=True)
def test_duplicate_email_uses_generic_accepted_response(client):
    User.objects.create_user(email='exists@example.test', password='test-password')
    response = client.post(
        '/api/v1/auth/register/',
        data={
            'email': 'exists@example.test',
            'password': 'A-strong-test-password-2026',
            'tenant_name': 'Ignored',
            'company_name': 'Ignored',
            'branch_name': 'Ignored',
        },
        content_type='application/json',
    )
    assert response.status_code == 202


@pytest.mark.django_db(transaction=True)
def test_onboarding_rolls_back_everything(monkeypatch):
    def fail_branch(*args, **kwargs):
        raise RuntimeError('forced rollback')

    monkeypatch.setattr(Branch.objects, 'create', fail_branch)
    with pytest.raises(RuntimeError, match='forced rollback'):
        register_organization(
            email='rollback-onboarding@test.local',
            password='A-strong-test-password-2026',
            tenant_name='Rollback Tenant',
            company_name='Rollback Company',
            branch_name='Rollback Branch',
        )
    assert not User.objects.filter(email='rollback-onboarding@test.local').exists()
