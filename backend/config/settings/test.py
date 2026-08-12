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

# Run Celery tasks synchronously during tests
CELERY_TASK_ALWAYS_EAGER = True
CELERY_BROKER_URL = config('CELERY_BROKER_URL', default='redis://127.0.0.1:6380/1')
CELERY_RESULT_BACKEND = config('CELERY_RESULT_BACKEND', default='redis://127.0.0.1:6380/2')

# Configure default Celery app for eager mode
import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.test')
import django
django.setup()
from celery import current_app
current_app.conf.update(task_always_eager=True, broker_url=CELERY_BROKER_URL)
