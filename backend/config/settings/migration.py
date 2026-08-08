from decouple import config

from .local import *

DATABASES['default']['USER'] = config('POSTGRES_USER', default='tjsys')
DATABASES['default']['PASSWORD'] = config('POSTGRES_PASSWORD', default='tjsys')
