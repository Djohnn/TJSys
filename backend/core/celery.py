import os

from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.local')

app = Celery('zyrp')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()

# Keep task names as strings so importing ``core`` during Django app loading
# does not import ORM-backed task modules before the app registry is ready.
app.conf.beat_schedule = {
    **getattr(app.conf, 'beat_schedule', {}),
    'poll-fiscal-documents': {
        'task': 'fiscal.tasks.poll_fiscal_documents',
        'schedule': 30.0,
    },
}
