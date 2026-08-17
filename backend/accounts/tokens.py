import secrets
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from accounts.models import OneTimeToken
from accounts.security import digest_value, secure_compare


def issue_token(*, purpose, user, ttl=None):
    secret = secrets.token_urlsafe(32)
    record = OneTimeToken.objects.create(
        user=user,
        purpose=purpose,
        digest=digest_value(secret),
        expires_at=timezone.now() + (ttl or timedelta(minutes=settings.AUTH_TOKEN_TTL_MINUTES)),
    )
    return f'{record.pk}.{secret}', record


def consume_token(raw, *, purpose):
    try:
        token_id, secret = raw.split('.', 1)
    except (AttributeError, ValueError):
        return None
    with transaction.atomic():
        try:
            record = OneTimeToken.objects.select_for_update().get(
                pk=token_id,
                purpose=purpose,
            )
        except (OneTimeToken.DoesNotExist, ValueError):
            return None
        if not record.is_usable or not secure_compare(record.digest, digest_value(secret)):
            return None
        record.consumed_at = timezone.now()
        record.save(update_fields=['consumed_at'])
        return record
