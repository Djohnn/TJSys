from io import StringIO

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from tenancy.models import Tenant


@pytest.mark.django_db(transaction=True)
def test_seed_requires_password_from_environment(monkeypatch):
    monkeypatch.delenv('SEED_ADMIN_PASSWORD', raising=False)

    with pytest.raises(CommandError, match='SEED_ADMIN_PASSWORD'):
        call_command('seed_tenants')


@pytest.mark.django_db(transaction=True)
def test_seed_creates_two_tenants_without_printing_password(monkeypatch):
    password = 'local-test-password-only'
    monkeypatch.setenv('SEED_ADMIN_PASSWORD', password)
    output = StringIO()

    call_command('seed_tenants', stdout=output)

    assert (
        Tenant.objects.filter(
            slug__in=['casa-de-racao-alpha', 'pet-shop-beta'],
        ).count()
        == 2
    )
    assert password not in output.getvalue()
    assert 'credenciais' in output.getvalue()
