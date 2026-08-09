import pytest
from django.contrib.auth import get_user_model

from accounts.models import MFADevice
from accounts.services.mfa import consume_recovery_code
from tenancy.management.commands.seed_e2e import ensure_e2e_recovery_codes
from tenancy.models import Tenant

User = get_user_model()


@pytest.mark.django_db
def test_seed_provisions_two_independent_recovery_codes_for_vertical_e2e():
    user = User.objects.create_user(email='vertical-e2e@test.local', password='test-password')
    tenant = Tenant.objects.create(name='Vertical E2E', slug='vertical-e2e')
    device = MFADevice.objects.create(user=user, tenant=tenant, method='totp')

    ensure_e2e_recovery_codes(device)

    assert consume_recovery_code(device=device, code='e2e0000001')
    assert consume_recovery_code(device=device, code='e2e0000002')
    assert not consume_recovery_code(device=device, code='e2e0000001')
    assert not consume_recovery_code(device=device, code='e2e0000002')
