import os

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.development')
import django

django.setup()
from django.contrib.auth import get_user_model
from django.utils import timezone

User = get_user_model()
for u in User.objects.all():
    if u.email_verified_at is None:
        u.email_verified_at = timezone.now()
        u.save(update_fields=['email_verified_at'])
        print(f'Fixed: {u.email}')
print('Done')
