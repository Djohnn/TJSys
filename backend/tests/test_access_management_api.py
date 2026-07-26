import pytest
from django.contrib.auth import get_user_model
from django.db import connection, transaction
from django.utils import timezone

from accounts.models import MFADevice
from tenancy.models import Branch, Company, Tenant, TenantMembership

User = get_user_model()


@pytest.mark.django_db
def test_admin_without_mfa_is_blocked(client):
    admin = User.objects.create_user(email='no-mfa@test.local', password='test-password')
    tenant = Tenant.objects.create(name='No MFA Tenant', slug='no-mfa-tenant')
    TenantMembership.objects.create(user=admin, tenant=tenant, role='admin')
    MFADevice.objects.create(
        user=admin,
        tenant=tenant,
        method='totp',
        verified_at=timezone.now(),
    )
    client.force_login(admin)
    response = client.get(
        '/api/v1/memberships/',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert response.status_code == 403


@pytest.mark.django_db
def test_admin_updates_membership_and_policy(client):
    admin = User.objects.create_user(email='access-admin@test.local', password='test-password')
    member = User.objects.create_user(email='access-member@test.local', password='test-password')
    tenant = Tenant.objects.create(name='Access Tenant', slug='access-tenant')
    TenantMembership.objects.create(user=admin, tenant=tenant, role='admin')
    MFADevice.objects.create(
        user=admin,
        tenant=tenant,
        method='totp',
        verified_at=timezone.now(),
    )
    membership = TenantMembership.objects.create(user=member, tenant=tenant, role='operator')
    client.force_login(admin)
    session = client.session
    session['mfa_tenant_id'] = str(tenant.id)
    session['mfa_method'] = 'totp'
    session.save()

    changed = client.patch(
        f'/api/v1/memberships/{membership.id}/',
        {'role': 'manager'},
        content_type='application/json',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    policy = client.patch(
        '/api/v1/security/mfa-policy/',
        {'allow_totp': True, 'allow_email': False},
        content_type='application/json',
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert changed.status_code == 200
    assert changed.json()['role'] == 'manager'
    assert policy.status_code == 200
    assert policy.json() == {'allow_totp': True, 'allow_email': False}


@pytest.mark.django_db
def test_other_tenant_membership_returns_404(client):
    admin = User.objects.create_user(email='idor-admin@test.local', password='test-password')
    other = User.objects.create_user(email='idor-other@test.local', password='test-password')
    tenant_a = Tenant.objects.create(name='Tenant A access', slug='tenant-a-access')
    tenant_b = Tenant.objects.create(name='Tenant B access', slug='tenant-b-access')
    TenantMembership.objects.create(user=admin, tenant=tenant_a, role='admin')
    target = TenantMembership.objects.create(user=other, tenant=tenant_b, role='operator')
    client.force_login(admin)
    session = client.session
    session['mfa_tenant_id'] = str(tenant_a.id)
    session['mfa_method'] = 'totp'
    session.save()
    response = client.patch(
        f'/api/v1/memberships/{target.id}/',
        {'role': 'manager'},
        content_type='application/json',
        HTTP_X_TENANT_ID=str(tenant_a.id),
    )
    assert response.status_code == 404


@pytest.mark.django_db(transaction=True)
def test_invalid_branch_scope_does_not_partially_update_membership(client):
    admin = User.objects.create_user(email='scope-admin@test.local', password='test-password')
    member = User.objects.create_user(email='scope-member@test.local', password='test-password')
    tenant = Tenant.objects.create(name='Scope Tenant', slug='scope-tenant')
    other_tenant = Tenant.objects.create(name='Other Scope Tenant', slug='other-scope-tenant')
    TenantMembership.objects.create(user=admin, tenant=tenant, role='admin')
    membership = TenantMembership.objects.create(user=member, tenant=tenant, role='operator')
    with transaction.atomic():
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT set_config('app.current_tenant_id', %s, true)",
                [str(other_tenant.id)],
            )
        other_company = Company.all_objects.create(tenant=other_tenant, name='Other Company')
        other_branch = Branch.all_objects.create(
            tenant=other_tenant,
            company=other_company,
            name='Other Branch',
        )
    client.force_login(admin)
    session = client.session
    session['mfa_tenant_id'] = str(tenant.id)
    session['mfa_method'] = 'totp'
    session.save()

    response = client.patch(
        f'/api/v1/memberships/{membership.id}/',
        {'role': 'manager', 'branch_ids': [str(other_branch.id)]},
        content_type='application/json',
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    membership.refresh_from_db()
    assert response.status_code == 400
    assert membership.role == 'operator'
