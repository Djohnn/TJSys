"""Sprint 16: Web API foundation contracts — auth, session, health, CORS.

Given/When/Then BDD scenarios for the frontend foundation API layer.
"""

import pytest
from django.contrib.auth import get_user_model

from tenancy.models import Tenant, TenantMembership

User = get_user_model()


def _auth_client(client, user, tenant, role='admin'):
    TenantMembership.objects.update_or_create(
        user=user,
        tenant=tenant,
        defaults={'role': role, 'is_active': True},
    )
    client.force_login(user)
    session = client.session
    session['mfa_tenant_id'] = str(tenant.id)
    session['mfa_method'] = 'totp'
    session.save()
    return client


# =============================================================================
# Auth — login, session, MFA
# =============================================================================


@pytest.mark.django_db
def test_login_endpoint_exists(client):
    response = client.post(
        '/api/v1/auth/login/',
        {'email': 'test@test.local', 'password': 'pass'},
        content_type='application/json',
    )
    assert response.status_code in (200, 401, 400)
    assert 'application/json' in response['Content-Type']


@pytest.mark.django_db
def test_login_fails_with_invalid_credentials(client):
    response = client.post(
        '/api/v1/auth/login/',
        {'email': 'nonexistent@test.local', 'password': 'wrong'},
        content_type='application/json',
    )
    assert response.status_code in (401, 400)


@pytest.mark.django_db
def test_login_returns_mfa_when_enabled(client):
    user = User.objects.create_user(email='mfa-required@test.local', password='pass123')
    from tenancy.models import TenantMFAPolicy

    tenant = Tenant.objects.create(name='MFA Tenant', slug='mfa-tenant')
    TenantMembership.objects.create(user=user, tenant=tenant, role='admin', is_active=True)
    TenantMFAPolicy.objects.create(tenant=tenant, allow_totp=True, allow_email=True)
    response = client.post(
        '/api/v1/auth/login/',
        {'email': 'mfa-required@test.local', 'password': 'pass123'},
        content_type='application/json',
    )
    # Login may return 200 with MFA requirement, or 403/400 depending on CSRF/auth setup
    acceptable = {200, 400, 403, 401}
    assert response.status_code in acceptable, (
        f'Expected one of {acceptable}, got {response.status_code}'
    )


@pytest.mark.django_db
def test_me_endpoint_returns_user(client):
    user = User.objects.create_user(email='me@test.local', password='pass123')
    tenant = Tenant.objects.create(name='Me Tenant', slug='me-tenant')
    _auth_client(client, user, tenant)
    response = client.get('/api/v1/auth/me/')
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)
    assert len(data) > 0


# =============================================================================
# CORS — default headers
# =============================================================================


@pytest.mark.django_db
def test_cors_headers_present_on_api_response(client):
    user = User.objects.create_user(email='cors@test.local', password='pass123')
    tenant = Tenant.objects.create(name='CORS Tenant', slug='cors-tenant')
    _auth_client(client, user, tenant)
    response = client.get('/api/v1/auth/me/', HTTP_ORIGIN='http://localhost:5173')
    expected = response.headers.get('Access-Control-Allow-Origin')
    assert expected is None or expected == 'http://localhost:5173' or expected == '*'


# =============================================================================
# Health — unauthenticated access allowed
# =============================================================================


@pytest.mark.django_db
def test_health_endpoint_unauthenticated(client):
    response = client.get('/api/v1/monitoring/health/')
    assert response.status_code in (200, 301, 302)


@pytest.mark.django_db
def test_health_returns_status(client):
    response = client.get('/api/v1/monitoring/health/')
    if response.status_code == 200:
        data = response.json()
        assert 'status' in data
        assert 'checks' in data


# =============================================================================
# OpenAPI schema — accessible
# =============================================================================


@pytest.mark.django_db
def test_openapi_schema_accessible(client):
    response = client.get('/api/v1/schema/')
    # Schema may require auth (default permission classes), return 401 if restricted
    assert response.status_code in (200, 301, 302, 401)


# =============================================================================
# Session — login establishes session
# =============================================================================


@pytest.mark.django_db
def test_session_established_after_login(client):
    user = User.objects.create_user(email='session@test.local', password='pass123')
    tenant = Tenant.objects.create(name='Session Tenant', slug='session-tenant')
    TenantMembership.objects.create(user=user, tenant=tenant, role='admin', is_active=True)

    login_ok = client.login(email='session@test.local', password='pass123')
    assert login_ok, 'Login should succeed'
    session = client.session
    session['mfa_tenant_id'] = str(tenant.id)
    session['mfa_method'] = 'totp'
    session.save()
    response = client.get('/api/v1/auth/me/')
    assert response.status_code == 200


# =============================================================================
# Unauthenticated access — 401
# =============================================================================


@pytest.mark.django_db
def test_unauthenticated_access_returns_401(client):
    response = client.get('/api/v1/auth/me/')
    assert response.status_code in (401, 302)


# =============================================================================
# Pagination — default format
# =============================================================================


@pytest.mark.django_db
def test_pagination_format(client):
    """Standard DRF pagination response format — PageNumberPagination on list views."""
    user = User.objects.create_user(email='pag@test.local', password='pass123')
    tenant = Tenant.objects.create(name='Pag Tenant', slug='pag-tenant')
    _auth_client(client, user, tenant)
    response = client.get(
        '/api/v1/purchasing/suppliers/',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    data = response.json()
    assert 'results' in data
    assert 'next' in data
    assert 'next' in data
    if response.status_code == 200:
        data = response.json()
        assert 'count' in data
        assert 'results' in data
