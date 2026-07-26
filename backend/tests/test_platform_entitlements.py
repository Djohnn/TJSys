import pytest
from django.db import connection

from platform_admin.models import Plan, Subscription, TenantEntitlement
from platform_admin.services import (
    feature_flag_enabled,
    is_tenant_restricted,
    is_tenant_suspended,
    reactivate_tenant,
    set_feature_flag,
    suspend_tenant,
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
def plan_and_sub(tenant_alpha):
    def _create():
        plan = Plan.objects.create(
            code='pro',
            name='Professional',
            capabilities={'purchasing': True, 'sales': True, 'reports': False},
            limits={'max_users': 10, 'max_storage_gb': 50},
        )
        sub = Subscription.objects.create(
            tenant=tenant_alpha,
            plan=plan,
            start_date='2026-07-01',
        )
        return {'tenant': tenant_alpha, 'plan': plan, 'sub': sub}

    return _run_in_tenant(tenant_alpha, _create)


@pytest.mark.django_db
class TestTenantHasCapability:
    def test_has_capability_from_plan(self, plan_and_sub):
        ctx = plan_and_sub
        assert tenant_has_capability(ctx['tenant'], 'purchasing') is True
        assert tenant_has_capability(ctx['tenant'], 'reports') is False

    def test_missing_capability(self, plan_and_sub):
        ctx = plan_and_sub
        assert tenant_has_capability(ctx['tenant'], 'inventory') is False

    def test_no_subscription_returns_false(self, tenant_beta):
        assert tenant_has_capability(tenant_beta, 'purchasing') is False

    def test_entitlement_overrides_plan(self, plan_and_sub):
        ctx = plan_and_sub
        TenantEntitlement.objects.create(
            tenant=ctx['tenant'],
            capability='reports',
            is_enabled=True,
        )
        assert tenant_has_capability(ctx['tenant'], 'reports') is True

    def test_suspended_tenant_returns_false(self, plan_and_sub):
        ctx = plan_and_sub
        suspend_tenant(ctx['tenant'])
        assert tenant_has_capability(ctx['tenant'], 'purchasing') is False


@pytest.mark.django_db
class TestTenantLimitFor:
    def test_limit_from_plan(self, plan_and_sub):
        ctx = plan_and_sub
        assert tenant_limit_for(ctx['tenant'], 'max_users') == 10

    def test_missing_limit_returns_zero(self, plan_and_sub):
        ctx = plan_and_sub
        assert tenant_limit_for(ctx['tenant'], 'nonexistent') == 0

    def test_entitlement_overrides_limit(self, plan_and_sub):
        ctx = plan_and_sub
        TenantEntitlement.objects.create(
            tenant=ctx['tenant'],
            capability='max_users',
            is_enabled=True,
            limit_value=25,
        )
        assert tenant_limit_for(ctx['tenant'], 'max_users') == 25

    def test_suspended_tenant_limit_zero(self, plan_and_sub):
        ctx = plan_and_sub
        suspend_tenant(ctx['tenant'])
        assert tenant_limit_for(ctx['tenant'], 'max_users') == 0


@pytest.mark.django_db
class TestTenantSuspension:
    def test_suspend_changes_status(self, plan_and_sub):
        ctx = plan_and_sub
        suspend_tenant(ctx['tenant'], reason='Test suspension')
        ctx['sub'].refresh_from_db()
        assert ctx['sub'].status == 'suspended'

    def test_suspend_idempotent(self, plan_and_sub):
        ctx = plan_and_sub
        suspend_tenant(ctx['tenant'])
        suspend_tenant(ctx['tenant'])
        ctx['sub'].refresh_from_db()
        assert ctx['sub'].status == 'suspended'

    def test_reactivate_after_suspend(self, plan_and_sub):
        ctx = plan_and_sub
        suspend_tenant(ctx['tenant'])
        reactivate_tenant(ctx['tenant'])
        ctx['sub'].refresh_from_db()
        assert ctx['sub'].status == 'active'

    def test_is_tenant_suspended(self, plan_and_sub):
        ctx = plan_and_sub
        assert is_tenant_suspended(ctx['tenant']) is False
        suspend_tenant(ctx['tenant'])
        assert is_tenant_suspended(ctx['tenant']) is True

    def test_is_tenant_restricted(self, plan_and_sub):
        ctx = plan_and_sub
        assert is_tenant_restricted(ctx['tenant']) is False
        suspend_tenant(ctx['tenant'])
        assert is_tenant_restricted(ctx['tenant']) is True


@pytest.mark.django_db
class TestFeatureFlagService:
    def test_set_and_check(self):
        set_feature_flag('new-dashboard', globally_enabled=True)
        assert feature_flag_enabled('new-dashboard', 'any') is True

    def test_unset_flag_returns_false(self):
        assert feature_flag_enabled('nonexistent', 'any') is False

    def test_audit_created(self, django_user_model):
        from platform_admin.models import PlatformAdminAudit

        user = django_user_model.objects.create_user(
            email='admin@test.local',
            password='pass123',
        )
        set_feature_flag('test-flag', globally_enabled=True, actor=user)
        assert PlatformAdminAudit.objects.filter(action='feature_flag.updated').exists()

    def test_outbox_created(self):
        # Given: a feature flag does not exist
        from outbox.models import OutboxMessage

        # When: an administrator changes the flag
        flag = set_feature_flag('audited-flag', globally_enabled=True)

        # Then: the same transaction records an integration event
        assert OutboxMessage.objects.filter(
            event_type='platform.feature_flag.updated',
            aggregate_id=str(flag.id),
        ).exists()


@pytest.mark.django_db
class TestSupportAccess:
    def test_request_created(self, django_user_model, tenant_alpha):
        from platform_admin.services import request_support_access

        user = django_user_model.objects.create_user(
            email='support@test.local',
            password='pass123',
        )
        req = request_support_access(
            requester=user,
            target_tenant=tenant_alpha,
            reason='Need to investigate issue',
        )
        assert req.status == 'pending'
        assert req.reason == 'Need to investigate issue'
        assert req.expires_at is not None

    def test_approve_changes_status(self, django_user_model, tenant_alpha):
        from platform_admin.services import approve_support_access, request_support_access

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
        req.refresh_from_db()
        assert req.status == 'approved'

    def test_approve_expired_raises(self, django_user_model, tenant_alpha):
        from django.utils import timezone

        from platform_admin.services import approve_support_access, request_support_access

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
        with pytest.raises(ValueError, match='expired'):
            approve_support_access(req.id, admin)

    def test_revoke_changes_status(self, django_user_model, tenant_alpha):
        from platform_admin.services import (
            approve_support_access,
            request_support_access,
            revoke_support_access,
        )

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
        revoke_support_access(req.id, admin)
        req.refresh_from_db()
        assert req.status == 'revoked'
