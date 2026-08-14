import re
from contextlib import contextmanager
from uuid import uuid4

import pyotp
import pytest
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone
from rest_framework.settings import api_settings

from accounts.models import MFADevice
from accounts.security import decrypt_secret
from accounts.throttles import LoginThrottle, MFAThrottle
from tenancy.models import Tenant, TenantMembership, TenantMFAPolicy

User = get_user_model()


@contextmanager
def _temporary_throttle_rate(scope, rate, throttle_class):
    """Apply one throttle rate locally and restore DRF/cache state after the scenario."""
    original_rates = throttle_class.THROTTLE_RATES
    framework_settings = {
        **settings.REST_FRAMEWORK,
        'DEFAULT_THROTTLE_RATES': {
            **settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'],
            scope: rate,
        },
    }
    cache.clear()
    try:
        with override_settings(REST_FRAMEWORK=framework_settings):
            api_settings.reload()
            throttle_class.THROTTLE_RATES = api_settings.DEFAULT_THROTTLE_RATES
            yield
    finally:
        throttle_class.THROTTLE_RATES = original_rates
        api_settings.reload()
        cache.clear()


@pytest.fixture
def pre_mfa(client):
    user = User.objects.create_user(email='mfa-api@test.local', password='valid-password')
    user.email_verified_at = timezone.now()
    user.save(update_fields=['email_verified_at'])
    tenant = Tenant.objects.create(name='MFA API', slug='mfa-api')
    TenantMembership.objects.create(user=user, tenant=tenant, role='admin')
    TenantMFAPolicy.objects.create(tenant=tenant)
    response = client.post(
        '/api/v1/auth/login/',
        {'email': user.email, 'password': 'valid-password'},
        content_type='application/json',
    )
    assert response.status_code == 202
    return client, user, tenant


@pytest.mark.django_db
def test_totp_enrollment_completes_login(pre_mfa):
    client, user, tenant = pre_mfa
    enrollment = client.post(
        '/api/v1/auth/mfa/totp/enroll/',
        {'tenant_id': str(tenant.id)},
        content_type='application/json',
    )
    assert enrollment.status_code == 201
    device = MFADevice.objects.get(pk=enrollment.json()['device_id'])
    code = pyotp.TOTP(decrypt_secret(device.encrypted_secret)).now()
    confirmation = client.post(
        '/api/v1/auth/mfa/totp/confirm/',
        {'device_id': str(device.id), 'code': code},
        content_type='application/json',
    )
    assert confirmation.status_code == 204
    assert client.session['_auth_user_id'] == str(user.id)


@pytest.mark.django_db(transaction=True)
def test_email_mfa_completes_login(pre_mfa):
    client, user, tenant = pre_mfa
    sent = client.post(
        '/api/v1/auth/mfa/email/send/',
        {'tenant_id': str(tenant.id)},
        content_type='application/json',
    )
    assert sent.status_code == 202
    code = re.search(r'code=([0-9]{6})', mail.outbox[-1].body).group(1)
    confirmed = client.post(
        '/api/v1/auth/mfa/challenge/',
        {'challenge_id': sent.json()['challenge_id'], 'code': code},
        content_type='application/json',
    )
    assert confirmed.status_code == 204
    assert client.session['_auth_user_id'] == str(user.id)


@pytest.mark.django_db(transaction=True)
def test_test_configuration_allows_pre_mfa_login_after_ten_anonymous_attempts(client, request):
    """Given ten anonymous failures, a valid pre-MFA login shall still return 202 in tests."""
    cache.clear()
    request.addfinalizer(cache.clear)
    rates = settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']
    assert rates['auth_login'] == '1000/minute'
    assert rates['auth_mfa'] == '1000/minute'

    # Given ten earlier anonymous login attempts from the shared test-client address
    for attempt in range(10):
        invalid_login = client.post(
            '/api/v1/auth/login/',
            {'email': 'missing@test.local', 'password': 'valid-password'},
            content_type='application/json',
        )
        assert invalid_login.status_code == 401, f'anonymous attempt {attempt + 1}'

    # And an email-verified user with an MFA-enabled tenant
    user = User.objects.create_user(email='throttle-mfa@test.local', password='valid-password')
    user.email_verified_at = timezone.now()
    user.save(update_fields=['email_verified_at'])
    tenant = Tenant.objects.create(name='Throttle MFA', slug='throttle-mfa')
    TenantMembership.objects.create(user=user, tenant=tenant, role='admin')
    TenantMFAPolicy.objects.create(tenant=tenant)

    # When the user creates a pre-MFA session
    pre_mfa_login = client.post(
        '/api/v1/auth/login/',
        {'email': user.email, 'password': 'valid-password'},
        content_type='application/json',
    )

    # Then the test configuration does not leak the production anonymous quota
    assert pre_mfa_login.status_code == 202


@pytest.mark.django_db(transaction=True)
def test_login_throttle_blocks_eleventh_pre_mfa_login_at_production_rate(client):
    """Given the production login rate, the eleventh anonymous login shall return 429."""
    with _temporary_throttle_rate('auth_login', '10/minute', LoginThrottle):
        assert LoginThrottle.THROTTLE_RATES['auth_login'] == '10/minute'
        for attempt in range(10):
            invalid_login = client.post(
                '/api/v1/auth/login/',
                {'email': 'missing@test.local', 'password': 'valid-password'},
                content_type='application/json',
            )
            assert invalid_login.status_code == 401, f'anonymous attempt {attempt + 1}'

        user = User.objects.create_user(
            email='production-rate@test.local', password='valid-password',
        )
        user.email_verified_at = timezone.now()
        user.save(update_fields=['email_verified_at'])
        tenant = Tenant.objects.create(name='Production rate', slug='production-rate')
        TenantMembership.objects.create(user=user, tenant=tenant, role='admin')
        TenantMFAPolicy.objects.create(tenant=tenant)

        blocked_pre_mfa_login = client.post(
            '/api/v1/auth/login/',
            {'email': user.email, 'password': 'valid-password'},
            content_type='application/json',
        )

    assert blocked_pre_mfa_login.status_code == 429


@pytest.mark.django_db
def test_mfa_throttle_blocks_third_pre_session_totp_confirmation(pre_mfa):
    """Given the MFA rate, the third pre-session TOTP confirmation shall return 429."""
    client, _user, _tenant = pre_mfa
    payload = {'device_id': str(uuid4()), 'code': '000000'}

    with _temporary_throttle_rate('auth_mfa', '2/minute', MFAThrottle):
        assert MFAThrottle.THROTTLE_RATES['auth_mfa'] == '2/minute'
        for attempt in range(2):
            invalid_confirmation = client.post(
                '/api/v1/auth/mfa/totp/confirm/',
                payload,
                content_type='application/json',
            )
            assert invalid_confirmation.status_code == 400, f'MFA attempt {attempt + 1}'

        blocked_confirmation = client.post(
            '/api/v1/auth/mfa/totp/confirm/',
            payload,
            content_type='application/json',
        )

    assert blocked_confirmation.status_code == 429
