import os

from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.local')

app = Celery('tjsys')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()

try:
    from fiscal.tasks import BEAT_SCHEDULE
except ImportError:
    BEAT_SCHEDULE = {}

app.conf.beat_schedule = {
    **getattr(app.conf, 'beat_schedule', {}),
    **BEAT_SCHEDULE,
}
