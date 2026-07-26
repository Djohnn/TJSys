from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from accounts.security import decrypt_secret, digest_value, encrypt_secret, secure_compare
from accounts.tokens import consume_token, issue_token

User = get_user_model()


def test_digest_and_encryption_do_not_store_plaintext(settings):
    value = 'temporary-value-for-test'
    assert digest_value(value) == digest_value(value)
    assert digest_value(value) != value
    encrypted = encrypt_secret(value)
    assert value not in encrypted
    assert decrypt_secret(encrypted) == value
    assert secure_compare(digest_value(value), digest_value(value))


@pytest.mark.django_db(transaction=True)
def test_one_time_token_cannot_be_consumed_twice():
    user = User.objects.create_user(email='token@test.local', password='test-password')
    raw, record = issue_token(purpose='email_confirmation', user=user)

    consumed = consume_token(raw, purpose='email_confirmation')

    assert consumed is not None
    assert consumed.pk == record.pk
    assert consume_token(raw, purpose='email_confirmation') is None


@pytest.mark.django_db(transaction=True)
def test_expired_or_tampered_token_is_rejected():
    user = User.objects.create_user(email='expired@test.local', password='test-password')
    raw, record = issue_token(
        purpose='password_reset',
        user=user,
        ttl=timedelta(minutes=1),
    )
    type(record).objects.filter(pk=record.pk).update(
        expires_at=timezone.now() - timedelta(seconds=1),
    )

    assert consume_token(raw, purpose='password_reset') is None
    assert consume_token(f'{raw}tampered', purpose='password_reset') is None
    assert consume_token(raw, purpose='wrong_purpose') is None
