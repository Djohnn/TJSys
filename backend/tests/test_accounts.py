import pytest
from django.contrib.auth import get_user_model

User = get_user_model()


@pytest.mark.django_db
class TestCustomUserManager:
    def test_create_user_normalizes_email_and_generates_username(self):
        user = User.objects.create_user(
            email='  ADMIN@Example.COM  ',
            password='safe-local-password',
        )
        assert user.email == 'admin@example.com'
        assert user.username
        assert user.check_password('safe-local-password')

    def test_create_user_requires_email(self):
        with pytest.raises(ValueError):
            User.objects.create_user(email='', password='password')

    def test_create_superuser_sets_required_flags(self):
        user = User.objects.create_superuser(
            email='ROOT@example.com',
            password='safe-local-password',
        )
        assert user.email == 'root@example.com'
        assert user.is_staff is True
        assert user.is_superuser is True
