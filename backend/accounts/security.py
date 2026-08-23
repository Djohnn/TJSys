import hashlib
import hmac

from cryptography.fernet import Fernet
from django.conf import settings


def digest_value(value):
    return hmac.new(
        settings.SECRET_KEY.encode(),
        value.encode(),
        hashlib.sha256,
    ).hexdigest()


def secure_compare(left, right):
    return hmac.compare_digest(left, right)


def encrypt_secret(value):
    return Fernet(settings.MFA_ENCRYPTION_KEY.encode()).encrypt(value.encode()).decode()


def decrypt_secret(value):
    return Fernet(settings.MFA_ENCRYPTION_KEY.encode()).decrypt(value.encode()).decode()
