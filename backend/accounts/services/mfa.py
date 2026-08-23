import secrets
from datetime import timedelta

import pyotp
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from accounts.models import MFADevice, OneTimeToken, RecoveryCode
from accounts.security import decrypt_secret, digest_value, encrypt_secret, secure_compare


def begin_totp_enrollment(*, user, tenant):
    secret = pyotp.random_base32()
    device, _ = MFADevice.objects.update_or_create(
        user=user,
        tenant=tenant,
        method='totp',
        defaults={
            'encrypted_secret': encrypt_secret(secret),
            'verified_at': None,
            'last_counter': None,
        },
    )
    uri = pyotp.TOTP(secret).provisioning_uri(name=user.email, issuer_name='Zyrp')
    return uri, device


def confirm_totp(*, device, code):
    with transaction.atomic():
        device = MFADevice.objects.select_for_update().get(pk=device.pk)
        totp = pyotp.TOTP(decrypt_secret(device.encrypted_secret))
        counter = totp.timecode(timezone.now())
        if device.last_counter is not None and counter <= device.last_counter:
            return False
        if not totp.verify(code, for_time=timezone.now(), valid_window=1):
            return False
        device.last_counter = counter
        device.verified_at = device.verified_at or timezone.now()
        device.save(update_fields=['last_counter', 'verified_at'])
        return True


def issue_email_challenge(*, user):
    cooldown = timezone.now() - timedelta(seconds=settings.EMAIL_MFA_RESEND_COOLDOWN_SECONDS)
    if OneTimeToken.objects.filter(
        user=user,
        purpose='email_mfa',
        created_at__gt=cooldown,
    ).exists():
        raise ValueError('Email MFA resend cooldown is active.')
    code = f'{secrets.randbelow(1_000_000):06d}'
    challenge = OneTimeToken.objects.create(
        user=user,
        purpose='email_mfa',
        digest=digest_value(code),
        expires_at=timezone.now() + timedelta(minutes=settings.EMAIL_MFA_TTL_MINUTES),
    )
    return code, challenge


def verify_email_challenge(*, challenge_id, code):
    with transaction.atomic():
        try:
            challenge = OneTimeToken.objects.select_for_update().get(
                pk=challenge_id,
                purpose='email_mfa',
            )
        except OneTimeToken.DoesNotExist:
            return False
        if not challenge.is_usable or challenge.attempt_count >= settings.EMAIL_MFA_MAX_ATTEMPTS:
            return False
        if not secure_compare(challenge.digest, digest_value(code)):
            challenge.attempt_count += 1
            challenge.save(update_fields=['attempt_count'])
            return False
        challenge.consumed_at = timezone.now()
        challenge.save(update_fields=['consumed_at'])
        return True


def regenerate_recovery_codes(*, device, count=10):
    with transaction.atomic():
        device.recovery_codes.all().delete()
        codes = [secrets.token_hex(5) for _ in range(count)]
        RecoveryCode.objects.bulk_create(
            [RecoveryCode(device=device, digest=digest_value(code)) for code in codes],
        )
        return codes


def consume_recovery_code(*, device, code):
    candidate = digest_value(code)
    with transaction.atomic():
        record = (
            RecoveryCode.objects.select_for_update()
            .filter(
                device=device,
                digest=candidate,
                consumed_at__isnull=True,
            )
            .first()
        )
        if record is None:
            return False
        record.consumed_at = timezone.now()
        record.save(update_fields=['consumed_at'])
        return True
