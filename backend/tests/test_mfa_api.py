import re

import pyotp
import pytest
from django.contrib.auth import get_user_model
from django.core import mail
from django.utils import timezone

from accounts.models import MFADevice
from accounts.security import decrypt_secret
from tenancy.models import Tenant, TenantMembership, TenantMFAPolicy

User = get_user_model()


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
