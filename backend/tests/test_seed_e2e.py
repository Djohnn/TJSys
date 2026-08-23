import os
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.core.management.base import CommandError
from django.db import transaction
from django.test import TestCase, override_settings

from accounts.models import MFADevice, RecoveryCode
from tenancy.management.commands.seed_e2e import (
    R9_MAX_GENERATIONS,
    Command,
    r9_cancel_sale_key_for_generation,
    r9_refund_sale_key_for_generation,
    r9_sale_key_for_generation,
)
from tenancy.models import Tenant

User = get_user_model()


class SeedE2ECommandTest(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='E2E Test Fixture', slug='e2e-fixture')
        self.user = User.objects.create_user(email='seed-fixture@example.test')
        self.device = MFADevice.objects.create(
            user=self.user,
            tenant=self.tenant,
            method='totp',
        )
        self.command = Command()

    @override_settings(SECRET_KEY='not-an-e2e-secret')
    def test_given_incompatible_environment_when_handle_then_fails_before_mutation(self):
        """Given ambiente comum, When executa seed, Then falha antes de mutar."""
        before_users = User.objects.count()
        with (
            patch.dict(
                os.environ,
                {
                    'E2E_SEED': '0',
                    'DJANGO_SETTINGS_MODULE': 'config.settings.test',
                },
                clear=False,
            ),
            patch.object(Command, '_seed', autospec=True) as seed,
        ):
            with pytest.raises(CommandError, match='E2E_SEED=1'):
                self.command.handle()

        seed.assert_not_called()
        assert User.objects.count() == before_users

    def test_given_existing_codes_when_reseed_then_keeps_exactly_ten_fixed_rows(self):
        """Given códigos antigos, When reseed, Then ficam dez códigos fixos."""
        RecoveryCode.objects.bulk_create(
            [RecoveryCode(device=self.device, digest=f'old-{index}') for index in range(3)]
        )

        self.command._replace_fixed_recovery_codes(self.device, 'fixed-digest')
        self.command._replace_fixed_recovery_codes(self.device, 'fixed-digest')

        codes = list(RecoveryCode.objects.filter(device=self.device))
        assert len(codes) == 10
        assert {code.digest for code in codes} == {'fixed-digest'}

    def test_given_recovery_delete_when_transaction_fails_then_previous_rows_survive(self):
        """Given delete de recovery, When transação falha, Then estado anterior permanece."""
        old_digests = {f'old-{index}' for index in range(3)}
        RecoveryCode.objects.bulk_create(
            [RecoveryCode(device=self.device, digest=digest) for digest in old_digests]
        )

        with pytest.raises(RuntimeError, match='rollback sentinel'):
            with transaction.atomic():
                self.command._replace_fixed_recovery_codes(self.device, 'new-digest')
                raise RuntimeError('rollback sentinel')

        assert (
            set(RecoveryCode.objects.filter(device=self.device).values_list('digest', flat=True))
            == old_digests
        )

    def test_given_sixteen_generations_when_next_key_requested_then_no_seventeenth_exists(self):
        """Given limite R9, When pede próxima geração, Then falha sem chave 17."""
        assert r9_sale_key_for_generation(R9_MAX_GENERATIONS - 1).endswith('-15')
        with pytest.raises(CommandError, match='resete o banco E2E dedicado'):
            r9_sale_key_for_generation(R9_MAX_GENERATIONS)

    def test_cancel_sale_generation_uses_the_same_fail_closed_limit(self):
        """Given a cancelled cancel-sale, the next key remains bounded."""
        assert r9_cancel_sale_key_for_generation(0) == 'e2e-r9-cancel-sale'
        assert r9_cancel_sale_key_for_generation(R9_MAX_GENERATIONS - 1).endswith('-15')
        with pytest.raises(CommandError, match='resete o banco E2E dedicado'):
            r9_cancel_sale_key_for_generation(R9_MAX_GENERATIONS)

    def test_refund_sale_generation_uses_the_same_fail_closed_limit(self):
        """Given repeated partial refunds, the dedicated sale key stays bounded."""
        assert r9_refund_sale_key_for_generation(0) == 'e2e-r9-refund-sale'
        assert r9_refund_sale_key_for_generation(R9_MAX_GENERATIONS - 1).endswith('-15')
        with pytest.raises(CommandError, match='resete o banco E2E dedicado'):
            r9_refund_sale_key_for_generation(R9_MAX_GENERATIONS)
