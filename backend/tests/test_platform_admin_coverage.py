import pytest
from django.db import connection
from django.utils import timezone

from platform_admin.models import (
    FeatureFlag,
    Plan,
    PlatformAdminAudit,
    Subscription,
    TenantEntitlement,
)
from platform_admin.services import (
    approve_support_access,
    feature_flag_enabled,
    get_feature_flag,
    is_tenant_restricted,
    is_tenant_suspended,
    reactivate_tenant,
    request_support_access,
    revoke_support_access,
    set_feature_flag,
    suspend_tenant,
    tenant_active_subscription,
    tenant_has_capability,
    tenant_limit_for,
)
from tenancy.context import reset_current_tenant_id, set_current_tenant_id


def _run_in_tenant(tenant, callback):
    token = set_current_tenant_id(tenant.id)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SET app.current_tenant_id = %s', [str(tenant.id)])
        return callback()
    finally:
        reset_current_tenant_id(token)


@pytest.fixture
def plan_pro(tenant_alpha):
    def _create():
        return Plan.objects.create(
            code='pro',
            name='Professional',
            capabilities={'purchasing': True, 'sales': True, 'reports': False},
            limits={'max_users': 10, 'max_storage_gb': 50},
        )

    return _run_in_tenant(tenant_alpha, _create)


@pytest.fixture
def active_sub(tenant_alpha, plan_pro):
    def _create():
        return Subscription.objects.create(
            tenant=tenant_alpha,
            plan=plan_pro,
            start_date='2026-07-01',
        )

    return _run_in_tenant(tenant_alpha, _create)


@pytest.mark.django_db
class TestTenantActiveSubscription:
    def test_returns_active_subscription(self, active_sub):
        sub = tenant_active_subscription(active_sub.tenant)
        assert sub is not None
        assert sub.plan.code == 'pro'
        assert sub.is_active is True

    def test_no_subscription_returns_none(self, tenant_beta):
        sub = tenant_active_subscription(tenant_beta)
        assert sub is None

    def test_inactive_subscription_excluded(self, tenant_alpha, plan_pro):
        def _create():
            return Subscription.objects.create(
                tenant=tenant_alpha,
                plan=plan_pro,
                start_date='2026-07-01',
                is_active=False,
            )

        _run_in_tenant(tenant_alpha, _create)
        sub = tenant_active_subscription(tenant_alpha)
        assert sub is None


@pytest.mark.django_db
class TestTenantHasCapabilityCoverage:
    def test_entitlement_with_limit_value_none(self, active_sub):
        ctx = active_sub
        TenantEntitlement.objects.create(
            tenant=ctx.tenant,
            capability='reports',
            is_enabled=True,
            limit_value=None,
        )
        assert tenant_has_capability(ctx.tenant, 'reports') is True

    def test_entitlement_disabled_overrides_plan(self, active_sub):
        ctx = active_sub
        TenantEntitlement.objects.create(
            tenant=ctx.tenant,
            capability='purchasing',
            is_enabled=False,
        )
        assert tenant_has_capability(ctx.tenant, 'purchasing') is False

    def test_plan_capability_fallback(self, active_sub):
        ctx = active_sub
        assert tenant_has_capability(ctx.tenant, 'purchasing') is True
        assert tenant_has_capability(ctx.tenant, 'reports') is False


@pytest.mark.django_db
class TestTenantLimitForCoverage:
    def test_limit_from_plan_when_no_entitlement(self, active_sub):
        ctx = active_sub
        assert tenant_limit_for(ctx.tenant, 'max_users') == 10

    def test_entitlement_with_null_limit_returns_plan_limit(self, active_sub):
        ctx = active_sub
        TenantEntitlement.objects.create(
            tenant=ctx.tenant,
            capability='max_users',
            is_enabled=True,
            limit_value=None,
        )
        assert tenant_limit_for(ctx.tenant, 'max_users') == 10

    def test_entitlement_with_limit_value(self, active_sub):
        ctx = active_sub
        TenantEntitlement.objects.create(
            tenant=ctx.tenant,
            capability='max_users',
            is_enabled=True,
            limit_value=25,
        )
        assert tenant_limit_for(ctx.tenant, 'max_users') == 25

    def test_no_subscription_returns_zero(self, tenant_beta):
        assert tenant_limit_for(tenant_beta, 'max_users') == 0


@pytest.mark.django_db
class TestIsTenantSuspendedCoverage:
    def test_no_subscription_returns_false(self, tenant_beta):
        assert is_tenant_suspended(tenant_beta) is False

    def test_active_subscription_returns_false(self, active_sub):
        assert is_tenant_suspended(active_sub.tenant) is False

    def test_suspended_subscription_returns_true(self, active_sub):
        suspend_tenant(active_sub.tenant)
        assert is_tenant_suspended(active_sub.tenant) is True


@pytest.mark.django_db
class TestIsTenantRestrictedCoverage:
    def test_no_subscription_returns_true(self, tenant_beta):
        assert is_tenant_restricted(tenant_beta) is True

    def test_active_subscription_returns_false(self, active_sub):
        assert is_tenant_restricted(active_sub.tenant) is False

    def test_suspended_returns_true(self, active_sub):
        suspend_tenant(active_sub.tenant)
        assert is_tenant_restricted(active_sub.tenant) is True

    def test_cancelled_returns_true(self, active_sub):
        active_sub.status = Subscription.STATUS_CANCELLED
        active_sub.save(update_fields=['status'])
        assert is_tenant_restricted(active_sub.tenant) is True


@pytest.mark.django_db
class TestSuspendTenantCoverage:
    def test_suspend_creates_audit(self, active_sub, django_user_model):
        user = django_user_model.objects.create_user(
            email='auditor@test.local',
            password='pass123',
        )
        suspend_tenant(active_sub.tenant, reason='Non-payment', actor=user)
        assert PlatformAdminAudit.objects.filter(
            action='subscription.suspended',
            target_tenant=active_sub.tenant,
            detail__reason='Non-payment',
        ).exists()

    def test_suspend_no_subscription_raises(self, tenant_beta):
        with pytest.raises(ValueError, match='No active subscription'):
            suspend_tenant(tenant_beta)

    def test_suspend_already_suspended_returns_sub(self, active_sub):
        result = suspend_tenant(active_sub.tenant)
        assert result.status == Subscription.STATUS_SUSPENDED
        result2 = suspend_tenant(active_sub.tenant)
        assert result2.pk == result.pk


@pytest.mark.django_db
class TestReactivateTenantCoverage:
    def test_reactivate_creates_audit(self, active_sub, django_user_model):
        user = django_user_model.objects.create_user(
            email='auditor@test.local',
            password='pass123',
        )
        suspend_tenant(active_sub.tenant)
        reactivate_tenant(active_sub.tenant, actor=user)
        assert PlatformAdminAudit.objects.filter(
            action='subscription.activated',
            target_tenant=active_sub.tenant,
        ).exists()

    def test_reactivate_no_subscription_raises(self, tenant_beta):
        with pytest.raises(ValueError, match='No active subscription'):
            reactivate_tenant(tenant_beta)

    def test_reactivate_not_suspended_raises(self, active_sub):
        with pytest.raises(ValueError, match='not suspended'):
            reactivate_tenant(active_sub.tenant)


@pytest.mark.django_db
class TestGetFeatureFlagCoverage:
    def test_flag_found(self):
        FeatureFlag.objects.create(code='test-flag', is_globally_enabled=True)
        flag = get_feature_flag('test-flag')
        assert flag is not None
        assert flag.code == 'test-flag'

    def test_flag_not_found(self):
        flag = get_feature_flag('nonexistent')
        assert flag is None


@pytest.mark.django_db
class TestFeatureFlagEnabledCoverage:
    def test_flag_not_found_returns_false(self):
        assert feature_flag_enabled('missing', 'any-tenant') is False

    def test_globally_enabled(self):
        FeatureFlag.objects.create(code='global', is_globally_enabled=True)
        assert feature_flag_enabled('global', 'any-tenant') is True

    def test_globally_disabled(self):
        FeatureFlag.objects.create(code='disabled', is_globally_enabled=False)
        assert feature_flag_enabled('disabled', 'any-tenant') is False

    def test_tenant_override_true(self, tenant_alpha):
        FeatureFlag.objects.create(
            code='override',
            is_globally_enabled=False,
            tenant_overrides={str(tenant_alpha.id): True},
        )
        assert feature_flag_enabled('override', tenant_alpha.id) is True

    def test_tenant_override_false(self, tenant_alpha):
        FeatureFlag.objects.create(
            code='override-false',
            is_globally_enabled=True,
            tenant_overrides={str(tenant_alpha.id): False},
        )
        assert feature_flag_enabled('override-false', tenant_alpha.id) is False

    def test_rollout_100_percent(self):
        FeatureFlag.objects.create(
            code='full-rollout',
            is_globally_enabled=False,
            rollout_percentage=100,
        )
        assert feature_flag_enabled('full-rollout', 'any-tenant') is True

    def test_rollout_partial_deterministic(self):
        FeatureFlag.objects.create(
            code='partial',
            is_globally_enabled=False,
            rollout_percentage=50,
        )
        results = {feature_flag_enabled('partial', str(i)) for i in range(200)}
        assert results == {True, False}


@pytest.mark.django_db
class TestSetFeatureFlagCoverage:
    def test_create_new_flag(self):
        flag = set_feature_flag('new-flag', globally_enabled=True)
        assert flag.code == 'new-flag'
        assert flag.is_globally_enabled is True

    def test_update_existing_flag(self):
        set_feature_flag('existing', globally_enabled=False, rollout_percentage=10)
        flag = set_feature_flag('existing', globally_enabled=True, rollout_percentage=90)
        flag.refresh_from_db()
        assert flag.is_globally_enabled is True
        assert flag.rollout_percentage == 90

    def test_set_feature_flag_with_actor(self, django_user_model):
        user = django_user_model.objects.create_user(
            email='flag-admin@test.local',
            password='pass123',
        )
        set_feature_flag('audited', globally_enabled=True, actor=user)
        audit = PlatformAdminAudit.objects.filter(
            action='feature_flag.updated',
            detail__flag_code='audited',
        ).latest('created_at')
        assert audit.actor_id == user.id

    def test_set_feature_flag_with_overrides(self):
        flag = set_feature_flag(
            'with-overrides',
            tenant_overrides={'tenant-1': True, 'tenant-2': False},
        )
        assert flag.tenant_overrides == {'tenant-1': True, 'tenant-2': False}

    def test_set_feature_flag_creates_outbox(self):
        from outbox.models import OutboxMessage

        flag = set_feature_flag('outbox-test', globally_enabled=True)
        assert OutboxMessage.objects.filter(
            event_type='platform.feature_flag.updated',
            aggregate_id=str(flag.id),
        ).exists()


@pytest.mark.django_db
class TestRequestSupportAccessCoverage:
    def test_request_with_custom_expiry(self, django_user_model, tenant_alpha):
        user = django_user_model.objects.create_user(
            email='support@test.local',
            password='pass123',
        )
        expires = timezone.now() + timezone.timedelta(hours=2)
        req = request_support_access(
            requester=user,
            target_tenant=tenant_alpha,
            reason='Debug issue',
            expires_at=expires,
        )
        assert req.expires_at == expires
        assert req.status == 'pending'

    def test_request_default_expiry(self, django_user_model, tenant_alpha):
        user = django_user_model.objects.create_user(
            email='support2@test.local',
            password='pass123',
        )
        req = request_support_access(
            requester=user,
            target_tenant=tenant_alpha,
            reason='Check logs',
        )
        assert req.expires_at is not None
        assert req.expires_at > timezone.now()


@pytest.mark.django_db
class TestApproveSupportAccessCoverage:
    def test_approve_not_found_raises(self, django_user_model):
        user = django_user_model.objects.create_user(
            email='admin@test.local',
            password='pass123',
            is_staff=True,
        )
        with pytest.raises(ValueError, match='not found'):
            approve_support_access(request_id=999999, approver=user)

    def test_approve_already_approved_raises(self, django_user_model, tenant_alpha):
        user = django_user_model.objects.create_user(
            email='support@test.local',
            password='pass123',
        )
        admin = django_user_model.objects.create_user(
            email='admin@test.local',
            password='pass123',
            is_staff=True,
        )
        req = request_support_access(
            requester=user,
            target_tenant=tenant_alpha,
            reason='Test',
        )
        approve_support_access(req.id, admin)
        with pytest.raises(ValueError, match='already approved'):
            approve_support_access(req.id, admin)

    def test_approve_creates_audit(self, django_user_model, tenant_alpha):
        user = django_user_model.objects.create_user(
            email='support@test.local',
            password='pass123',
        )
        admin = django_user_model.objects.create_user(
            email='admin@test.local',
            password='pass123',
            is_staff=True,
        )
        req = request_support_access(
            requester=user,
            target_tenant=tenant_alpha,
            reason='Audit test',
        )
        approve_support_access(req.id, admin)
        assert PlatformAdminAudit.objects.filter(
            action='support_access.granted',
            target_tenant=tenant_alpha,
            detail__request_id=str(req.id),
            detail__reason='Audit test',
        ).exists()

    def test_approve_expired_request_raises(self, django_user_model, tenant_alpha):
        user = django_user_model.objects.create_user(
            email='support@test.local',
            password='pass123',
        )
        admin = django_user_model.objects.create_user(
            email='admin@test.local',
            password='pass123',
            is_staff=True,
        )
        req = request_support_access(
            requester=user,
            target_tenant=tenant_alpha,
            reason='Expired',
            expires_at=timezone.now() - timezone.timedelta(hours=1),
        )
        with pytest.raises(ValueError, match='expired'):
            approve_support_access(req.id, admin)


@pytest.mark.django_db
class TestRevokeSupportAccessCoverage:
    def test_revoke_not_found_raises(self, django_user_model):
        user = django_user_model.objects.create_user(
            email='admin@test.local',
            password='pass123',
            is_staff=True,
        )
        with pytest.raises(ValueError, match='not found'):
            revoke_support_access(request_id=999999, revoker=user)

    def test_revoke_already_revoked_raises(self, django_user_model, tenant_alpha):
        user = django_user_model.objects.create_user(
            email='support@test.local',
            password='pass123',
        )
        admin = django_user_model.objects.create_user(
            email='admin@test.local',
            password='pass123',
            is_staff=True,
        )
        req = request_support_access(
            requester=user,
            target_tenant=tenant_alpha,
            reason='Test',
        )
        revoke_support_access(req.id, admin)
        with pytest.raises(ValueError, match='already revoked'):
            revoke_support_access(req.id, admin)

    def test_revoke_expired_request_raises(self, django_user_model, tenant_alpha):
        user = django_user_model.objects.create_user(
            email='support@test.local',
            password='pass123',
        )
        admin = django_user_model.objects.create_user(
            email='admin@test.local',
            password='pass123',
            is_staff=True,
        )
        req = request_support_access(
            requester=user,
            target_tenant=tenant_alpha,
            reason='Test',
            expires_at=timezone.now() - timezone.timedelta(hours=1),
        )
        req.status = 'expired'
        req.save(update_fields=['status'])
        with pytest.raises(ValueError, match='already expired'):
            revoke_support_access(req.id, admin)

    def test_revoke_creates_audit(self, django_user_model, tenant_alpha):
        user = django_user_model.objects.create_user(
            email='support@test.local',
            password='pass123',
        )
        admin = django_user_model.objects.create_user(
            email='admin@test.local',
            password='pass123',
            is_staff=True,
        )
        req = request_support_access(
            requester=user,
            target_tenant=tenant_alpha,
            reason='Revoke audit',
        )
        revoke_support_access(req.id, admin)
        assert PlatformAdminAudit.objects.filter(
            action='support_access.revoked',
            target_tenant=tenant_alpha,
            detail__request_id=str(req.id),
        ).exists()

    def test_revoke_approved_request_succeeds(self, django_user_model, tenant_alpha):
        user = django_user_model.objects.create_user(
            email='support@test.local',
            password='pass123',
        )
        admin = django_user_model.objects.create_user(
            email='admin@test.local',
            password='pass123',
            is_staff=True,
        )
        req = request_support_access(
            requester=user,
            target_tenant=tenant_alpha,
            reason='Approved then revoked',
        )
        approve_support_access(req.id, admin)
        revoke_support_access(req.id, admin)
        req.refresh_from_db()
        assert req.status == 'revoked'
        assert req.revoked_by_id == admin.id
        assert req.revoked_at is not None
