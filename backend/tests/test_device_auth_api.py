import hashlib
import uuid

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.test import Client
from rest_framework_simplejwt.exceptions import AuthenticationFailed
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from tenancy.authentication import DeviceJWTAuthentication
from tenancy.models import Branch, Company, Device, Tenant, TenantMembership

User = get_user_model()


def _set_tenant_context(tenant):
    with connection.cursor() as cursor:
        cursor.execute(
            'SELECT set_config(%s, %s, false)',
            ['app.current_tenant_id', str(tenant.id) if tenant else ''],
        )


def _tenant_setup(*, email='device-user@test.local', active_user=True, device_status='active'):
    tenant = Tenant.objects.create(
        name=f'Device Tenant {uuid.uuid4()}',
        slug=f'device-{uuid.uuid4()}',
    )
    user = User.objects.create_user(email=email, password='pass123')
    user.is_active = active_user
    user.save(update_fields=['is_active'])
    TenantMembership.objects.create(user=user, tenant=tenant, role='admin', is_active=True)

    _set_tenant_context(tenant)
    company = Company.objects.create(tenant=tenant, name='Device Company')
    branch = Branch.objects.create(tenant=tenant, company=company, name='Device Branch')
    device = Device.objects.create(
        tenant=tenant,
        branch=branch,
        name='PDV Caixa 01',
        device_id=f'pdv-{uuid.uuid4()}',
        key_hash=hashlib.sha256(b'valid-device-key').hexdigest(),
        status=device_status,
        registered_by=user if active_user else None,
    )
    _set_tenant_context(None)
    return tenant, user, branch, device


def _access_token_for(device):
    refresh = RefreshToken()
    refresh['device_id'] = str(device.id)
    refresh['tenant_id'] = str(device.tenant_id)
    refresh['branch_id'] = str(device.branch_id) if device.branch_id else None
    return str(refresh.access_token), str(refresh)


def _device_claims(device):
    return {
        'device_id': str(device.id),
        'tenant_id': str(device.tenant_id),
        'branch_id': str(device.branch_id) if device.branch_id else None,
    }


@pytest.mark.django_db
def test_device_jwt_requires_device_id_claim():
    with pytest.raises(AuthenticationFailed, match='No device_id'):
        DeviceJWTAuthentication().get_user({})


@pytest.mark.django_db
def test_device_jwt_rejects_invalid_uuid_claim():
    with pytest.raises(AuthenticationFailed, match='Invalid device_id format'):
        DeviceJWTAuthentication().get_user({'device_id': 'not-a-uuid'})


@pytest.mark.django_db
def test_device_jwt_rejects_unknown_device():
    with pytest.raises(AuthenticationFailed, match='Device not found'):
        DeviceJWTAuthentication().get_user({'device_id': str(uuid.uuid4())})


@pytest.mark.django_db
def test_device_jwt_returns_registered_active_user():
    _, user, _, device = _tenant_setup()

    authenticated = DeviceJWTAuthentication().get_user(_device_claims(device))

    assert authenticated == user


@pytest.mark.django_db
def test_device_jwt_falls_back_to_active_tenant_member():
    tenant, user, _, device = _tenant_setup(active_user=False)
    fallback = User.objects.create_user(email='fallback-device@test.local', password='pass123')
    TenantMembership.objects.create(user=fallback, tenant=tenant, role='manager', is_active=True)

    authenticated = DeviceJWTAuthentication().get_user(_device_claims(device))

    assert authenticated == fallback
    assert authenticated != user


@pytest.mark.django_db
def test_device_jwt_rejects_device_without_active_user_or_member():
    tenant, _, _, device = _tenant_setup(active_user=False)
    TenantMembership.objects.filter(tenant=tenant).update(is_active=False)

    with pytest.raises(AuthenticationFailed, match='Device has no registered user'):
        DeviceJWTAuthentication().get_user(_device_claims(device))


@pytest.mark.django_db
def test_device_validate_rejects_invalid_api_key(client):
    response = client.post(
        '/api/v1/devices/validate/',
        {'api_key': 'wrong'},
        content_type='application/json',
    )

    assert response.status_code == 401
    assert response.json()['code'] == 'invalid_api_key'


@pytest.mark.django_db
def test_device_validate_rejects_inactive_device(client):
    _tenant_setup(device_status='inactive')

    response = client.post(
        '/api/v1/devices/validate/',
        {'api_key': 'valid-device-key'},
        content_type='application/json',
    )

    assert response.status_code == 403
    assert response.json()['code'] == 'device_inactive'


@pytest.mark.django_db
def test_device_validate_returns_tokens_for_active_device(client):
    tenant, _, branch, device = _tenant_setup()

    response = client.post(
        '/api/v1/devices/validate/',
        {'api_key': 'valid-device-key'},
        content_type='application/json',
    )

    assert response.status_code == 200
    body = response.json()
    assert body['device_id'] == str(device.id)
    assert body['tenant_id'] == str(tenant.id)
    assert body['branch_id'] == str(branch.id)
    assert body['token']
    assert body['refresh_token']


@pytest.mark.django_db
def test_device_validate_ignores_session_cookie_and_does_not_require_csrf(client):
    tenant, user, branch, device = _tenant_setup(email='csrf-device@test.local')
    client = Client(enforce_csrf_checks=True)
    client.force_login(user)

    response = client.post(
        '/api/v1/devices/validate/',
        {'api_key': 'valid-device-key'},
        content_type='application/json',
        HTTP_ORIGIN='http://127.0.0.1:5173',
    )

    assert response.status_code == 200
    body = response.json()
    assert body['device_id'] == str(device.id)
    assert body['tenant_id'] == str(tenant.id)
    assert body['branch_id'] == str(branch.id)


@pytest.mark.django_db
def test_device_register_creates_pending_device_and_audit(client):
    from audit.models import AuditRecord

    tenant, user, branch, _ = _tenant_setup(email='register-device@test.local')
    client.force_login(user)
    session = client.session
    session['mfa_tenant_id'] = str(tenant.id)
    session['mfa_method'] = 'totp'
    session.save()

    response = client.post(
        '/api/v1/devices/',
        {
            'name': 'PDV Balcao',
            'branch': str(branch.id),
            'platform': 'windows',
            'app_version': '0.1.0',
            'os_version': 'Windows 11',
        },
        content_type='application/json',
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 201, response.json()
    created = Device.all_objects.get(name='PDV Balcao')
    assert created.tenant == tenant
    assert created.registered_by == user
    assert created.key_hash == 'pending'
    assert created.device_id.startswith('pdv_')
    assert AuditRecord.objects.filter(
        action='device.registered',
        resource_id=str(created.id),
        tenant_id=str(tenant.id),
    ).exists()


@pytest.mark.django_db
def test_device_register_preserves_explicit_device_id(client):
    tenant, user, branch, _ = _tenant_setup(email='explicit-device@test.local')
    client.force_login(user)
    session = client.session
    session['mfa_tenant_id'] = str(tenant.id)
    session['mfa_method'] = 'totp'
    session.save()

    response = client.post(
        '/api/v1/devices/',
        {
            'name': 'PDV Estoque',
            'device_id': 'pdv-explicit-001',
            'branch': str(branch.id),
            'platform': 'windows',
        },
        content_type='application/json',
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 201
    assert Device.all_objects.get(name='PDV Estoque').device_id == 'pdv-explicit-001'


@pytest.mark.django_db
def test_device_refresh_requires_refresh_token(client):
    _tenant_setup()

    response = client.post(
        '/api/v1/devices/refresh/',
        {},
        content_type='application/json',
    )

    assert response.status_code == 400
    assert response.json()['code'] == 'refresh_token_required'


@pytest.mark.django_db
def test_device_refresh_rejects_invalid_refresh_token(client):
    _tenant_setup()

    response = client.post(
        '/api/v1/devices/refresh/',
        {'refresh_token': 'invalid-token'},
        content_type='application/json',
    )

    assert response.status_code == 401
    assert response.json()['code'] == 'invalid_refresh_token'


@pytest.mark.django_db
def test_device_refresh_returns_new_tokens_without_valid_access_token(client):
    tenant, _, branch, device = _tenant_setup()
    _, refresh_token = _access_token_for(device)

    # Given a signed refresh token and an unusable access token
    response = client.post(
        '/api/v1/devices/refresh/',
        {'refresh_token': refresh_token},
        content_type='application/json',
        HTTP_AUTHORIZATION='Bearer access-expirado-ou-invalido',
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 200
    body = response.json()
    assert body['device_id'] == str(device.id)
    assert body['tenant_id'] == str(tenant.id)
    assert body['branch_id'] == str(branch.id)
    assert body['token']
    assert body['refresh_token']


@pytest.mark.django_db
def test_device_refresh_rejects_inactive_device(client):
    _, _, _, device = _tenant_setup()
    _, refresh_token = _access_token_for(device)
    device.status = 'revoked'
    device.save(update_fields=['status'])

    response = client.post(
        '/api/v1/devices/refresh/',
        {'refresh_token': refresh_token},
        content_type='application/json',
    )

    assert response.status_code == 401
    assert response.json()['code'] == 'device_not_found'


@pytest.mark.django_db
def test_device_refresh_rejects_token_scoped_to_another_tenant(client):
    tenant_a, _, _, device_a = _tenant_setup(email='refresh-a@test.local')
    tenant_b, _, _, _ = _tenant_setup(email='refresh-b@test.local')
    refresh = RefreshToken()
    refresh['device_id'] = str(device_a.id)
    refresh['tenant_id'] = str(tenant_b.id)
    refresh['branch_id'] = str(device_a.branch_id)

    # When the signed claims pair a device with a tenant that does not own it
    response = client.post(
        '/api/v1/devices/refresh/',
        {'refresh_token': str(refresh)},
        content_type='application/json',
        HTTP_X_TENANT_ID=str(tenant_a.id),
    )

    # Then the endpoint must not disclose or renew the other tenant's device
    assert response.status_code == 401
    assert response.json()['code'] == 'device_not_found'


@pytest.mark.django_db
def test_device_refresh_rejects_token_without_tenant_scope(client):
    _, _, _, device = _tenant_setup()
    refresh = RefreshToken()
    refresh['device_id'] = str(device.id)

    # When a signed refresh token lacks the tenant scope
    response = client.post(
        '/api/v1/devices/refresh/',
        {'refresh_token': str(refresh)},
        content_type='application/json',
    )

    # Then it is invalid for device authentication
    assert response.status_code == 401
    assert response.json()['code'] == 'invalid_refresh_token'


@pytest.mark.django_db
def test_device_refresh_rejects_malformed_device_id_claim(client):
    # Given
    tenant, _, _, _ = _tenant_setup()
    refresh = RefreshToken()
    refresh['device_id'] = 'device-id-malformado'
    refresh['tenant_id'] = str(tenant.id)

    # When
    response = client.post(
        '/api/v1/devices/refresh/',
        {'refresh_token': str(refresh)},
        content_type='application/json',
    )

    # Then
    assert response.status_code == 401
    assert response.json()['code'] == 'invalid_refresh_token'


@pytest.mark.django_db
def test_device_refresh_rejects_malformed_tenant_id_claim(client):
    # Given
    _, _, _, device = _tenant_setup()
    refresh = RefreshToken()
    refresh['device_id'] = str(device.id)
    refresh['tenant_id'] = 'tenant-id-malformado'

    # When
    response = client.post(
        '/api/v1/devices/refresh/',
        {'refresh_token': str(refresh)},
        content_type='application/json',
    )

    # Then
    assert response.status_code == 401
    assert response.json()['code'] == 'invalid_refresh_token'


@pytest.mark.django_db
def test_device_refresh_rejects_device_from_inactive_tenant(client):
    # Given
    tenant, _, _, device = _tenant_setup()
    _, refresh_token = _access_token_for(device)
    tenant.is_active = False
    tenant.save(update_fields=['is_active'])

    # When
    response = client.post(
        '/api/v1/devices/refresh/',
        {'refresh_token': refresh_token},
        content_type='application/json',
    )

    # Then
    assert response.status_code == 401
    assert response.json()['code'] == 'device_not_found'


@pytest.mark.django_db
def test_device_refresh_ignores_tenant_and_branch_from_request(client):
    # Given
    tenant, _, branch, device = _tenant_setup(email='refresh-source@test.local')
    other_tenant, _, other_branch, _ = _tenant_setup(email='refresh-other@test.local')
    _, refresh_token = _access_token_for(device)

    # When
    response = client.post(
        '/api/v1/devices/refresh/',
        {
            'refresh_token': refresh_token,
            'tenant_id': str(other_tenant.id),
            'branch_id': str(other_branch.id),
        },
        content_type='application/json',
        HTTP_X_TENANT_ID=str(other_tenant.id),
    )

    # Then
    assert response.status_code == 200
    body = response.json()
    assert body['device_id'] == str(device.id)
    assert body['tenant_id'] == str(tenant.id)
    assert body['branch_id'] == str(branch.id)


@pytest.mark.django_db
def test_device_access_token_cannot_switch_tenant_after_refresh(client):
    # Given a device user who is also a member of another tenant
    tenant, user, branch, device = _tenant_setup(email='device-bound@test.local')
    other_tenant, _, _, _ = _tenant_setup(email='device-other@test.local')
    TenantMembership.objects.create(
        user=user,
        tenant=other_tenant,
        role='admin',
        is_active=True,
    )
    _, refresh_token = _access_token_for(device)
    refresh_response = client.post(
        '/api/v1/devices/refresh/',
        {'refresh_token': refresh_token},
        content_type='application/json',
    )
    access_token = refresh_response.json()['token']

    # When the same access token is sent with the correct and a different tenant header
    correct_tenant = client.get(
        '/api/v1/devices/list/',
        HTTP_AUTHORIZATION=f'Bearer {access_token}',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    wrong_tenant = client.get(
        '/api/v1/devices/list/',
        HTTP_AUTHORIZATION=f'Bearer {access_token}',
        HTTP_X_TENANT_ID=str(other_tenant.id),
    )
    correct_tenant_again = client.get(
        '/api/v1/devices/list/',
        HTTP_AUTHORIZATION=f'Bearer {access_token}',
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    # Then only the tenant bound to the signed token is accepted and request context recovers
    assert refresh_response.status_code == 200
    assert correct_tenant.status_code == 200
    assert wrong_tenant.status_code in {401, 403}
    assert correct_tenant_again.status_code == 200
    claims = AccessToken(access_token)
    assert claims['tenant_id'] == str(tenant.id)
    assert claims['branch_id'] == str(branch.id)


@pytest.mark.django_db
def test_device_access_token_rejects_branch_claim_not_owned_by_device(client):
    # Given a signed access token whose branch claim differs from the device FK
    tenant, _, _, device = _tenant_setup(email='device-branch@test.local')
    _, _, other_branch, _ = _tenant_setup(email='device-branch-other@test.local')
    refresh = RefreshToken()
    refresh['device_id'] = str(device.id)
    refresh['tenant_id'] = str(tenant.id)
    refresh['branch_id'] = str(other_branch.id)

    # When it reaches a protected route
    response = client.get(
        '/api/v1/devices/list/',
        HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}',
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    # Then authentication is rejected before tenant data can be read
    assert response.status_code in {401, 403}


@pytest.mark.django_db
def test_device_access_token_rejects_tenant_claim_not_owned_by_device(client):
    # Given a signed access token whose tenant claim differs from the device tenant
    tenant, _, _, device = _tenant_setup(email='device-tenant@test.local')
    other_tenant, _, _, _ = _tenant_setup(email='device-tenant-other@test.local')
    refresh = RefreshToken()
    refresh['device_id'] = str(device.id)
    refresh['tenant_id'] = str(other_tenant.id)
    refresh['branch_id'] = str(device.branch_id)

    # When it reaches a protected route using the device's real tenant header
    response = client.get(
        '/api/v1/devices/list/',
        HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}',
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    # Then authentication is rejected before tenant data can be read
    assert response.status_code in {401, 403}


@pytest.mark.django_db
def test_device_refresh_rotates_and_rejects_reuse_of_previous_token(client):
    # Given a valid single-use device refresh token
    tenant, _, branch, device = _tenant_setup(email='device-rotation@test.local')
    _, original_refresh = _access_token_for(device)

    # When it is rotated, reused, and the newly issued token is rotated
    first = client.post(
        '/api/v1/devices/refresh/',
        {'refresh_token': original_refresh},
        content_type='application/json',
    )
    reused = client.post(
        '/api/v1/devices/refresh/',
        {'refresh_token': original_refresh},
        content_type='application/json',
    )
    second = client.post(
        '/api/v1/devices/refresh/',
        {'refresh_token': first.json()['refresh_token']},
        content_type='application/json',
    )

    # Then only the unused tokens work and device scope remains unchanged
    assert first.status_code == 200
    assert reused.status_code == 401
    assert reused.json()['code'] == 'invalid_refresh_token'
    assert second.status_code == 200
    body = second.json()
    assert body['device_id'] == str(device.id)
    assert body['tenant_id'] == str(tenant.id)
    assert body['branch_id'] == str(branch.id)
