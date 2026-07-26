import re

import pytest
from django.contrib.auth import get_user_model
from django.core import mail
from django.test import Client

User = get_user_model()


@pytest.mark.django_db(transaction=True)
def test_password_recovery_is_generic_and_single_use(client):
    user = User.objects.create_user(email='reset@test.local', password='old-password')
    prior_session = Client()
    prior_session.force_login(user)
    existing = client.post(
        '/api/v1/auth/password/forgot/',
        {'email': user.email},
        content_type='application/json',
    )
    missing = client.post(
        '/api/v1/auth/password/forgot/',
        {'email': 'missing@test.local'},
        content_type='application/json',
    )
    assert existing.status_code == missing.status_code == 202
    assert existing.json() == missing.json()
    token = re.search(r'token=([^\s]+)', mail.outbox[0].body).group(1)
    payload = {'token': token, 'password': 'New-strong-password-2026'}
    assert (
        client.post(
            '/api/v1/auth/password/reset/',
            payload,
            content_type='application/json',
        ).status_code
        == 204
    )
    assert (
        client.post(
            '/api/v1/auth/password/reset/',
            payload,
            content_type='application/json',
        ).status_code
        == 400
    )
    user.refresh_from_db()
    assert user.check_password('New-strong-password-2026')
    assert prior_session.get('/api/v1/auth/me/').status_code == 401
