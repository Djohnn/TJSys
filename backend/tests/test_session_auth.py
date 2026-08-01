import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from tenancy.models import Tenant, TenantMembership

User = get_user_model()


@pytest.mark.django_db
def test_login_requires_csrf_when_checks_are_enforced():
    from django.test import Client

    client = Client(enforce_csrf_checks=True)
    denied = client.post(
        '/api/v1/auth/login/',
        {'email': 'nobody@test.local', 'password': 'wrong'},
        content_type='application/json',
    )
    csrf = client.get('/api/v1/auth/csrf/').json()['csrf_token']
    accepted = client.post(
        '/api/v1/auth/login/',
        {'email': 'nobody@test.local', 'password': 'wrong'},
        content_type='application/json',
        HTTP_X_CSRFTOKEN=csrf,
    )
    assert denied.status_code == 403
    assert accepted.status_code == 401


@pytest.mark.django_db
def test_login_is_generic_and_requires_verified_email(client):
    user = User.objects.create_user(email='login@test.local', password='valid-password')
    missing = client.post(
        '/api/v1/auth/login/',
        {'email': 'missing@test.local', 'password': 'wrong'},
        content_type='application/json',
    )
    wrong = client.post(
        '/api/v1/auth/login/',
        {'email': user.email, 'password': 'wrong'},
        content_type='application/json',
    )
    unverified = client.post(
        '/api/v1/auth/login/',
        {'email': user.email, 'password': 'valid-password'},
        content_type='application/json',
    )
    assert missing.status_code == wrong.status_code == 401
    assert missing.json()['detail'] == wrong.json()['detail']
    assert unverified.status_code == 403


@pytest.mark.django_db
def test_verified_login_creates_only_pre_mfa_session(client):
    user = User.objects.create_user(email='verified@test.local', password='valid-password')
    user.email_verified_at = timezone.now()
    user.save(update_fields=['email_verified_at'])

    response = client.post(
        '/api/v1/auth/login/',
        {'email': user.email, 'password': 'valid-password'},
        content_type='application/json',
    )

    assert response.status_code == 202
    assert client.session['pre_mfa_user_id'] == str(user.id)
    assert '_auth_user_id' not in client.session


@pytest.mark.django_db
def test_verified_login_returns_default_active_mfa_tenant(client):
    user = User.objects.create_user(email='tenant-login@test.local', password='valid-password')
    user.email_verified_at = timezone.now()
    user.save(update_fields=['email_verified_at'])
    tenant = Tenant.objects.create(name='Tenant Login', slug='tenant-login')
    TenantMembership.objects.create(user=user, tenant=tenant, role='admin')

    response = client.post(
        '/api/v1/auth/login/',
        {'email': user.email, 'password': 'valid-password'},
        content_type='application/json',
    )

    assert response.status_code == 202
    assert response.json()['mfa_tenant_id'] == str(tenant.id)


@pytest.mark.django_db
def test_logout_flushes_authenticated_session(client):
    user = User.objects.create_user(email='logout@test.local', password='valid-password')
    client.force_login(user)
    response = client.post('/api/v1/auth/logout/')
    assert response.status_code == 204
    assert '_auth_user_id' not in client.session
