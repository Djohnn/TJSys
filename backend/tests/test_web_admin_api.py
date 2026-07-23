import uuid

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.utils import timezone

from accounts.models import MFADevice
from tenancy.models import Branch, Company, Device, Invitation, Tenant, TenantMembership

User = get_user_model()


def _login(client, user, tenant):
    client.force_login(user)
    session = client.session
    session['mfa_tenant_id'] = str(tenant.id)
    session['mfa_method'] = 'totp'
    session.save()


def _set_context(tenant_id):
    from django.db import connection
    value = str(tenant_id) if tenant_id else ''
    with connection.cursor() as cursor:
        cursor.execute('SET app.current_tenant_id = %s', [value])


# =============================================================================
# Company pagination
# =============================================================================

@pytest.mark.django_db
def test_company_list_paginated(client):
    admin = User.objects.create_user(email='paginate@test.local', password='test-password')
    tenant = Tenant.objects.create(name='Paginate Tenant', slug='paginate-tenant')
    TenantMembership.objects.create(user=admin, tenant=tenant, role='admin')
    from accounts.models import MFADevice
    MFADevice.objects.create(user=admin, tenant=tenant, method='totp', verified_at=timezone.now())
    client.force_login(admin)
    session = client.session
    session['mfa_tenant_id'] = str(tenant.id)
    session['mfa_method'] = 'totp'
    session.save()

    with connection.cursor() as cursor:
        cursor.execute("SET app.current_tenant_id = %s", [str(tenant.id)])
    for i in range(26):
        Company.all_objects.create(tenant=tenant, name=f'Company {i:02d}')

    response = client.get('/api/v1/companies/', HTTP_X_TENANT_ID=str(tenant.id))
    assert response.status_code == 200
    data = response.json()
    assert 'count' in data
    assert 'next' in data
    assert 'results' in data
    assert data['count'] == 26
    assert len(data['results']) == 25


# =============================================================================
# Branch CRUD
# =============================================================================

@pytest.mark.django_db
def test_branch_create_and_detail(client):
    admin = User.objects.create_user(email='branch-admin@test.local', password='test-password')
    tenant = Tenant.objects.create(name='Branch Tenant', slug='branch-tenant')
    TenantMembership.objects.create(user=admin, tenant=tenant, role='admin')
    from accounts.models import MFADevice
    MFADevice.objects.create(user=admin, tenant=tenant, method='totp', verified_at=timezone.now())
    client.force_login(admin)
    session = client.session
    session['mfa_tenant_id'] = str(tenant.id)
    session['mfa_method'] = 'totp'
    session.save()

    with connection.cursor() as cursor:
        cursor.execute("SET app.current_tenant_id = %s", [str(tenant.id)])
    company = Company.all_objects.create(tenant=tenant, name='Branch Test Co')

    create_resp = client.post(
        '/api/v1/branches/',
        {'company': str(company.id), 'name': 'New Branch'},
        content_type='application/json',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert create_resp.status_code == 201
    branch_id = create_resp.json()['id']

    detail_resp = client.get(
        f'/api/v1/branches/{branch_id}/',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert detail_resp.status_code == 200
    assert detail_resp.json()['name'] == 'New Branch'
    assert detail_resp.json()['company_name'] == 'Branch Test Co'


@pytest.mark.django_db
def test_branch_update(client):
    admin = User.objects.create_user(email='branch-upd@test.local', password='test-password')
    tenant = Tenant.objects.create(name='Branch Upd Tenant', slug='branch-upd-tenant')
    TenantMembership.objects.create(user=admin, tenant=tenant, role='admin')
    from accounts.models import MFADevice
    MFADevice.objects.create(user=admin, tenant=tenant, method='totp', verified_at=timezone.now())
    client.force_login(admin)
    session = client.session
    session['mfa_tenant_id'] = str(tenant.id)
    session['mfa_method'] = 'totp'
    session.save()

    with connection.cursor() as cursor:
        cursor.execute("SET app.current_tenant_id = %s", [str(tenant.id)])
    company = Company.all_objects.create(tenant=tenant, name='Branch Upd Co')
    branch = Branch.all_objects.create(tenant=tenant, company=company, name='Original')

    resp = client.patch(
        f'/api/v1/branches/{branch.id}/', {'name': 'Updated Name'},
        content_type='application/json', HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert resp.status_code == 200
    assert resp.json()['name'] == 'Updated Name'


@pytest.mark.django_db
def test_branch_cross_tenant_404(client):
    admin = User.objects.create_user(email='cross-branch@test.local', password='test-password')
    tenant_a = Tenant.objects.create(name='Cross A', slug='cross-a')
    tenant_b = Tenant.objects.create(name='Cross B', slug='cross-b')
    TenantMembership.objects.create(user=admin, tenant=tenant_a, role='admin')
    from accounts.models import MFADevice
    MFADevice.objects.create(user=admin, tenant=tenant_a, method='totp', verified_at=timezone.now())
    client.force_login(admin)
    session = client.session
    session['mfa_tenant_id'] = str(tenant_a.id)
    session['mfa_method'] = 'totp'
    session.save()

    with connection.cursor() as cursor:
        cursor.execute("SET app.current_tenant_id = %s", [str(tenant_b.id)])
    company_b = Company.all_objects.create(tenant=tenant_b, name='Cross B Co')
    branch_b = Branch.all_objects.create(tenant=tenant_b, company=company_b, name='Cross B Branch')

    response = client.get(
        f'/api/v1/branches/{branch_b.id}/',
        HTTP_X_TENANT_ID=str(tenant_a.id),
    )
    assert response.status_code == 404


# =============================================================================
# Device list and revoke
# =============================================================================

@pytest.mark.django_db
def test_device_list(client):
    admin = User.objects.create_user(email='dev-list@test.local', password='test-password')
    tenant = Tenant.objects.create(name='Dev List Tenant', slug='dev-list-tenant')
    TenantMembership.objects.create(user=admin, tenant=tenant, role='admin')
    from accounts.models import MFADevice
    MFADevice.objects.create(user=admin, tenant=tenant, method='totp', verified_at=timezone.now())
    client.force_login(admin)
    session = client.session
    session['mfa_tenant_id'] = str(tenant.id)
    session['mfa_method'] = 'totp'
    session.save()

    with connection.cursor() as cursor:
        cursor.execute("SET app.current_tenant_id = %s", [str(tenant.id)])
    company = Company.all_objects.create(tenant=tenant, name='Dev List Co')
    branch = Branch.all_objects.create(tenant=tenant, company=company, name='Dev List Branch')
    for i in range(3):
        Device.all_objects.create(
            tenant=tenant, name=f'Device {i}', device_id=f'dev-{i}',
            key_hash='abc', branch=branch, status='active',
        )

    response = client.get('/api/v1/devices/list/', HTTP_X_TENANT_ID=str(tenant.id))
    assert response.status_code == 200
    data = response.json()
    assert 'results' in data
    assert len(data['results']) == 3
    for dev in data['results']:
        assert 'key_hash' not in dev


@pytest.mark.django_db
def test_device_revoke(client):
    admin = User.objects.create_user(email='dev-revoke@test.local', password='test-password')
    tenant = Tenant.objects.create(name='Dev Revoke Tenant', slug='dev-revoke-tenant')
    TenantMembership.objects.create(user=admin, tenant=tenant, role='admin')
    from accounts.models import MFADevice
    MFADevice.objects.create(user=admin, tenant=tenant, method='totp', verified_at=timezone.now())
    client.force_login(admin)
    session = client.session
    session['mfa_tenant_id'] = str(tenant.id)
    session['mfa_method'] = 'totp'
    session.save()

    with connection.cursor() as cursor:
        cursor.execute("SET app.current_tenant_id = %s", [str(tenant.id)])
    company = Company.all_objects.create(tenant=tenant, name='Revoke Co')
    branch = Branch.all_objects.create(tenant=tenant, company=company, name='Revoke Branch')
    device = Device.all_objects.create(
        tenant=tenant, name='Revocable', device_id='rev-001',
        key_hash='abc', branch=branch, status='active',
    )

    resp = client.post(
        f'/api/v1/devices/{device.id}/revoke/',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert resp.status_code == 200
    device.refresh_from_db()
    assert device.status == 'inactive'


# =============================================================================
# Invitation status filter
# =============================================================================

@pytest.mark.django_db
def test_invitation_status_filter(client):
    admin = User.objects.create_user(email='inv-filter@test.local', password='test-password')
    tenant = Tenant.objects.create(name='Inv Filter Tenant', slug='inv-filter-tenant')
    TenantMembership.objects.create(user=admin, tenant=tenant, role='admin')
    from accounts.models import MFADevice
    MFADevice.objects.create(user=admin, tenant=tenant, method='totp', verified_at=timezone.now())
    client.force_login(admin)
    session = client.session
    session['mfa_tenant_id'] = str(tenant.id)
    session['mfa_method'] = 'totp'
    session.save()

    with connection.cursor() as cursor:
        cursor.execute("SET app.current_tenant_id = %s", [str(tenant.id)])
    for i in range(3):
        Invitation.objects.create(
            tenant=tenant, email=f'pending{i}@test.local', role='operator',
            token_digest='abc', expires_at=timezone.now() + timezone.timedelta(days=1),
            invited_by=admin,
        )

    response = client.get(
        '/api/v1/invitations/?status=pending',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert response.status_code == 200
    data = response.json()
    assert 'results' in data
    assert len(data['results']) == 3


# =============================================================================
# Role denial
# =============================================================================

@pytest.mark.django_db
def test_role_denial_operator_cannot_manage_users(client):
    operator = User.objects.create_user(email='op-deny@test.local', password='test-password')
    tenant = Tenant.objects.create(name='Deny Tenant', slug='deny-tenant')
    TenantMembership.objects.create(user=operator, tenant=tenant, role='operator')
    from accounts.models import MFADevice
    MFADevice.objects.create(user=operator, tenant=tenant, method='totp', verified_at=timezone.now())
    client.force_login(operator)
    session = client.session
    session['mfa_tenant_id'] = str(tenant.id)
    session['mfa_method'] = 'totp'
    session.save()

    response = client.post(
        '/api/v1/invitations/',
        {'email': 'newguy@test.local', 'role': 'operator'},
        content_type='application/json',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert response.status_code == 403


# =============================================================================
# Membership list paginated
# =============================================================================

@pytest.mark.django_db
def test_membership_list_paginated(client):
    admin = User.objects.create_user(email='mem-list@test.local', password='test-password')
    tenant = Tenant.objects.create(name='Mem List Tenant', slug='mem-list-tenant')
    TenantMembership.objects.create(user=admin, tenant=tenant, role='admin')
    from accounts.models import MFADevice
    MFADevice.objects.create(user=admin, tenant=tenant, method='totp', verified_at=timezone.now())
    client.force_login(admin)
    session = client.session
    session['mfa_tenant_id'] = str(tenant.id)
    session['mfa_method'] = 'totp'
    session.save()

    with connection.cursor() as cursor:
        cursor.execute("SET app.current_tenant_id = %s", [str(tenant.id)])
    for i in range(5):
        u = User.objects.create_user(email=f'member{i}@test.local', password='pass123')
        TenantMembership.objects.create(user=u, tenant=tenant, role='operator')

    response = client.get('/api/v1/memberships/', HTTP_X_TENANT_ID=str(tenant.id))
    assert response.status_code == 200
    data = response.json()
    assert 'results' in data
    assert len(data['results']) >= 5
