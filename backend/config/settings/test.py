from decouple import config

from .base import *

DEBUG = False

TEST_RUNNER = 'django.test.runner.DiscoverRunner'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': config('POSTGRES_DB', default='tjsys_test'),
        'USER': config('POSTGRES_TEST_USER', default='tjsys_test'),
        'PASSWORD': config('POSTGRES_TEST_PASSWORD', default='tjsys_test_dev'),
        'HOST': config('POSTGRES_HOST', default='127.0.0.1'),
        'PORT': config('POSTGRES_PORT', default='5433'),
        'OPTIONS': {'connect_timeout': 5},
        'TEST': {'NAME': config('POSTGRES_TEST_DB', default='test_tjsys')},
    },
}

PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']

CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
    },
}

EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
