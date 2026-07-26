import pytest
from django.core.exceptions import ValidationError

from platform_admin.models import FeatureFlag, Plan, Subscription


@pytest.mark.django_db
class TestPlanModel:
    def test_create_plan(self):
        plan = Plan.objects.create(
            code='test-plan',
            name='Test Plan',
            capabilities={'purchasing': True, 'sales': True},
            limits={'max_users': 5},
        )
        assert plan.code == 'test-plan'
        assert plan.capabilities['purchasing'] is True
        assert plan.limits['max_users'] == 5

    def test_plan_code_unique(self):
        Plan.objects.create(code='dup', name='First')
        with pytest.raises(Exception):
            Plan.objects.create(code='dup', name='Second')

    def test_plan_str(self):
        plan = Plan.objects.create(code='pro', name='Professional')
        assert str(plan) == 'Professional'

    def test_plan_defaults(self):
        plan = Plan.objects.create(code='free', name='Free')
        assert plan.is_active is True
        assert plan.capabilities == {}
        assert plan.limits == {}


@pytest.mark.django_db
class TestSubscriptionModel:
    def test_create_subscription(self, tenant_alpha):
        plan = Plan.objects.create(code='starter', name='Starter')
        sub = Subscription.objects.create(
            tenant=tenant_alpha,
            plan=plan,
            start_date='2026-07-01',
        )
        assert sub.status == 'active'
        assert sub.is_active is True

    def test_unique_active_per_tenant(self, tenant_alpha):
        plan = Plan.objects.create(code='pro', name='Pro')
        Subscription.objects.create(
            tenant=tenant_alpha,
            plan=plan,
            start_date='2026-07-01',
        )
        with pytest.raises(Exception):
            Subscription.objects.create(
                tenant=tenant_alpha,
                plan=plan,
                start_date='2026-07-15',
            )

    def test_inactive_plan_raises(self, tenant_alpha):
        plan = Plan.objects.create(code='old', name='Old', is_active=False)
        sub = Subscription(tenant=tenant_alpha, plan=plan, start_date='2026-07-01')
        with pytest.raises(ValidationError):
            sub.clean()

    def test_subscription_str(self, tenant_alpha):
        plan = Plan.objects.create(code='enterprise', name='Enterprise')
        sub = Subscription.objects.create(
            tenant=tenant_alpha,
            plan=plan,
            start_date='2026-07-01',
        )
        assert str(tenant_alpha.slug) in str(sub)
        assert 'enterprise' in str(sub)


@pytest.mark.django_db
class TestFeatureFlagModel:
    def test_globally_enabled(self):
        flag = FeatureFlag.objects.create(code='test-flag', is_globally_enabled=True)
        assert flag.is_enabled_for('any-tenant') is True

    def test_globally_disabled(self):
        flag = FeatureFlag.objects.create(code='test-flag', is_globally_enabled=False)
        assert flag.is_enabled_for('any-tenant') is False

    def test_rollout_percentage_100(self):
        flag = FeatureFlag.objects.create(
            code='test-flag',
            rollout_percentage=100,
        )
        assert flag.is_enabled_for('any-tenant') is True

    def test_tenant_override_enabled(self):
        flag = FeatureFlag.objects.create(
            code='test-flag',
            is_globally_enabled=False,
            tenant_overrides={'tenant-abc': True},
        )
        assert flag.is_enabled_for('tenant-abc') is True
        assert flag.is_enabled_for('other-tenant') is False

    def test_tenant_override_disabled(self):
        flag = FeatureFlag.objects.create(
            code='test-flag',
            is_globally_enabled=True,
            tenant_overrides={'tenant-abc': False},
        )
        assert flag.is_enabled_for('tenant-abc') is False
        assert flag.is_enabled_for('other-tenant') is True

    def test_rollout_deterministic(self):
        # Given: the same flag and tenant are evaluated repeatedly
        flag = FeatureFlag.objects.create(code='rollout-50', rollout_percentage=50)
        # When: the rollout decision is calculated multiple times
        results = [flag.is_enabled_for('tenant-stable') for _ in range(20)]
        # Then: every evaluation returns the same decision
        assert len(set(results)) == 1

    def test_rollout_uses_stable_digest_across_python_hash_seeds(self):
        # Given: Python's randomized hash returns conflicting values
        flag = FeatureFlag.objects.create(code='rollout-50', rollout_percentage=50)
        # When/Then: the feature decision must not call the process-local hash function
        from unittest.mock import patch

        with patch('builtins.hash', side_effect=AssertionError('unstable hash used')):
            assert isinstance(flag.is_enabled_for('tenant-stable'), bool)
