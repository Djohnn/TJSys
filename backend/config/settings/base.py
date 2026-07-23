import base64
import hashlib
from pathlib import Path

from decouple import config

BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = config('SECRET_KEY', default='django-insecure-dev-key-not-for-production')
DEBUG = config('DEBUG', default=False, cast=bool)
ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='localhost,127.0.0.1').split(',')
CSRF_TRUSTED_ORIGINS = [
    origin.strip()
    for origin in config(
        'CSRF_TRUSTED_ORIGINS',
        default='http://localhost:5173,http://127.0.0.1:5173',
    ).split(',')
    if origin.strip()
]

DJANGO_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'django.contrib.sites',
]

THIRD_PARTY_APPS = [
    'rest_framework',
    'django_filters',
    'corsheaders',
    'drf_spectacular',
]

LOCAL_APPS = [
    'core',
    'accounts',
    'tenancy',
    'audit',
    'outbox',
    'catalog',
    'inventory',
    'sales',
    'fiscal',
    'financial',
    'purchasing',
    'monitoring',
    'people',
    'payments',
    'platform_admin',
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'tenancy.authentication.DeviceJWTAuthentication',
        'rest_framework.authentication.SessionAuthentication',
        'rest_framework.authentication.BasicAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
    ],
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 25,
    'MAX_PAGE_SIZE': 100,
    'DEFAULT_THROTTLE_RATES': {
        'auth_register': '5/hour',
        'auth_login': '10/minute',
        'auth_password': '5/hour',
        'auth_mfa': '10/minute',
    },
}

MIDDLEWARE = [
    'config.middleware.CorrelationIDMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'config.tenant_middleware.TenantMiddleware',
    'config.log_context.RequestContextLogMiddleware',
    'monitoring.middleware.MetricsMiddleware',
]

CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in config(
        'CORS_ALLOWED_ORIGINS',
        default='http://localhost:5173,http://127.0.0.1:5173',
    ).split(',')
    if origin.strip()
]
CORS_ALLOW_CREDENTIALS = True

SPECTACULAR_SETTINGS = {
    'TITLE': 'Zyrp API',
    'VERSION': '1.0.0',
}

CSRF_FAILURE_VIEW = 'config.views.csrf_failure'

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

LANGUAGE_CODE = 'pt-br'
TIME_ZONE = 'America/Sao_Paulo'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

SITE_ID = 1

AUTH_USER_MODEL = 'accounts.CustomUser'

DEFAULT_FROM_EMAIL = config('DEFAULT_FROM_EMAIL', default='no-reply@zyrp.local')
EMAIL_BACKEND = config(
    'EMAIL_BACKEND', default='django.core.mail.backends.console.EmailBackend',
)
AUTH_TOKEN_TTL_MINUTES = config('AUTH_TOKEN_TTL_MINUTES', default=30, cast=int)
EMAIL_MFA_TTL_MINUTES = config('EMAIL_MFA_TTL_MINUTES', default=10, cast=int)
EMAIL_MFA_MAX_ATTEMPTS = config('EMAIL_MFA_MAX_ATTEMPTS', default=5, cast=int)
EMAIL_MFA_RESEND_COOLDOWN_SECONDS = config(
    'EMAIL_MFA_RESEND_COOLDOWN_SECONDS', default=60, cast=int,
)
_DEV_MFA_KEY = base64.urlsafe_b64encode(
    hashlib.sha256(b'zyrp-local-development-only').digest(),
).decode()
MFA_ENCRYPTION_KEY = config('MFA_ENCRYPTION_KEY', default=_DEV_MFA_KEY)

LOG_LEVEL = config('LOG_LEVEL', default='INFO')

PLUGNOTAS_API_KEY = config('PLUGNOTAS_API_KEY', default='')
FISCAL_PROVIDERS = {
    'plugnotas': {
        'class': 'fiscal.adapters.plugnotas.PlugNotasAdapter',
        'api_key': PLUGNOTAS_API_KEY,
    },
}

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'filters': {
        'thread_local': {
            '()': 'config.log_context.ThreadLocalFilter',
        },
    },
    'formatters': {
        'json': {
            'format': (
                '{"timestamp":"%(asctime)s"'
                ',"level":"%(levelname)s"'
                ',"name":"%(name)s"'
                ',"correlation_id":"%(correlation_id)s"'
                ',"tenant_id":"%(tenant_id)s"'
                ',"user":"%(user)s"'
                ',"message":"%(message)s"}'
            ),
            'datefmt': '%Y-%m-%dT%H:%M:%S%z',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'filters': ['thread_local'],
            'formatter': 'json',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': LOG_LEVEL,
    },
    'loggers': {
        'django': {'level': 'INFO', 'handlers': ['console'], 'propagate': False},
        'django.server': {'level': 'WARNING', 'handlers': ['console'], 'propagate': False},
        'django.request': {'level': 'ERROR', 'handlers': ['console'], 'propagate': False},
    },
}

LOG_LEVEL = config('LOG_LEVEL', default='INFO')
