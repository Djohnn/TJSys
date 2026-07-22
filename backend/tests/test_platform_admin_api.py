import pytest

from platform_admin.models import (
    FeatureFlag,
    Plan,
    PlatformAdminAudit,
    Subscription,
    SupportAccessRequest,
)


def _admin_client(client, tenant_alpha):
    from django.contrib.auth import get_user_model

    user = get_user_model().objects.create_user(
        email='platform-admin@test.local', password='pass123', is_staff=True,
    )
    from tenancy.models import TenantMembership

    TenantMembership.objects.create(
        user=user, tenant=tenant_alpha, role='admin', is_active=True,
    )
    client.force_login(user)
    session = client.session
    session['mfa_tenant_id'] = str(tenant_alpha.id)
    session['mfa_method'] = 'totp'
    session.save()
    return client


def _regular_client(client, tenant_alpha):
    from django.contrib.auth import get_user_model

    user = get_user_model().objects.create_user(
        email='regular@test.local', password='pass123', is_staff=False,
    )
    from tenancy.models import TenantMembership

    TenantMembership.objects.create(
        user=user, tenant=tenant_alpha, role='admin', is_active=True,
    )
    client.force_login(user)
    session = client.session
    session['mfa_tenant_id'] = str(tenant_alpha.id)
    session['mfa_method'] = 'totp'
    session.save()
    return client


@pytest.mark.django_db
class TestPlansAPI:
    def test_list_plans(self, client, tenant_alpha):
        c = _admin_client(client, tenant_alpha)
        Plan.objects.create(code='starter', name='Starter')
        Plan.objects.create(code='pro', name='Professional')
        resp = c.get('/api/v1/platform/plans/')
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    def test_create_plan(self, client, tenant_alpha):
        c = _admin_client(client, tenant_alpha)
        resp = c.post('/api/v1/platform/plans/', {
            'code': 'enterprise',
            'name': 'Enterprise',
            'capabilities': {'sales': True},
            'limits': {'max_users': 100},
        }, content_type='application/json')
        assert resp.status_code == 201
        assert resp.json()['code'] == 'enterprise'
        assert PlatformAdminAudit.objects.filter(
            action='plan.created', detail__plan_code='enterprise',
        ).exists()

    def test_non_admin_cannot_create(self, client, tenant_alpha):
        c = _regular_client(client, tenant_alpha)
        resp = c.post('/api/v1/platform/plans/', {
            'code': 'hacker', 'name': 'Hacker Plan',
        }, content_type='application/json')
        assert resp.status_code == 403
        assert resp['Content-Type'].startswith('application/problem+json')
        assert resp.json()['status'] == 403

    def test_duplicate_plan_returns_problem_conflict(self, client, tenant_alpha):
        # Given: an administrator and an existing plan code
        c = _admin_client(client, tenant_alpha)
        Plan.objects.create(code='duplicate', name='Original')

        # When: the administrator creates the same code again
        resp = c.post('/api/v1/platform/plans/', {
            'code': 'duplicate', 'name': 'Duplicate',
        }, content_type='application/json')

        # Then: the API reports a Problem Details conflict
        assert resp.status_code == 409
        assert resp['Content-Type'].startswith('application/problem+json')
        assert resp.json()['code'] == 'conflict'


@pytest.mark.django_db
class TestSubscriptionsAPI:
    def test_list_subscriptions(self, client, tenant_alpha):
        c = _admin_client(client, tenant_alpha)
        plan = Plan.objects.create(code='pro', name='Pro')
        Subscription.objects.create(
            tenant=tenant_alpha, plan=plan, start_date='2026-07-01',
        )
        resp = c.get('/api/v1/platform/subscriptions/')
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_suspend_subscription(self, client, tenant_alpha):
        c = _admin_client(client, tenant_alpha)
        plan = Plan.objects.create(code='pro', name='Pro')
        sub = Subscription.objects.create(
            tenant=tenant_alpha, plan=plan, start_date='2026-07-01',
        )
        resp = c.post(
            f'/api/v1/platform/subscriptions/{sub.id}/suspend/',
            {'reason': 'Non-payment'},
            content_type='application/json',
        )
        assert resp.status_code == 200
        sub.refresh_from_db()
        assert sub.status == 'suspended'

    def test_reactivate_subscription(self, client, tenant_alpha):
        c = _admin_client(client, tenant_alpha)
        plan = Plan.objects.create(code='pro', name='Pro')
        sub = Subscription.objects.create(
            tenant=tenant_alpha, plan=plan, start_date='2026-07-01',
        )
        from platform_admin.services import suspend_tenant
        suspend_tenant(tenant_alpha)
        resp = c.post(
            f'/api/v1/platform/subscriptions/{sub.id}/reactivate/',
            content_type='application/json',
        )
        assert resp.status_code == 200
        sub.refresh_from_db()
        assert sub.status == 'active'

    def test_reactivate_active_subscription_returns_problem_conflict(
        self, client, tenant_alpha,
    ):
        # Given: an active subscription that cannot be reactivated
        c = _admin_client(client, tenant_alpha)
        plan = Plan.objects.create(code='active-pro', name='Active Pro')
        sub = Subscription.objects.create(
            tenant=tenant_alpha, plan=plan, start_date='2026-07-01',
        )

        # When: an administrator requests the invalid state transition
        resp = c.post(
            f'/api/v1/platform/subscriptions/{sub.id}/reactivate/',
            content_type='application/json',
        )

        # Then: the API returns a conflict using Problem Details
        assert resp.status_code == 409
        assert resp['Content-Type'].startswith('application/problem+json')
        assert resp.json()['code'] == 'conflict'


@pytest.mark.django_db
class TestFeatureFlagsAPI:
    def _tenant_header(self, tenant_alpha):
        return {'HTTP_X_TENANT_ID': str(tenant_alpha.id)}

    def test_list_flags(self, client, tenant_alpha):
        c = _admin_client(client, tenant_alpha)
        FeatureFlag.objects.create(code='feature-a', is_globally_enabled=True)
        resp = c.get('/api/v1/platform/feature-flags/', **self._tenant_header(tenant_alpha))
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_create_flag(self, client, tenant_alpha):
        c = _admin_client(client, tenant_alpha)
        resp = c.post('/api/v1/platform/feature-flags/', {
            'code': 'beta-feature',
            'is_globally_enabled': False,
            'rollout_percentage': 50,
        }, content_type='application/json', **self._tenant_header(tenant_alpha))
        assert resp.status_code == 201
        assert FeatureFlag.objects.filter(code='beta-feature').exists()
        flag = FeatureFlag.objects.get(code='beta-feature')
        assert PlatformAdminAudit.objects.filter(
            action='feature_flag.updated', detail__flag_code='beta-feature',
        ).exists()
        from outbox.models import OutboxMessage
        assert OutboxMessage.objects.filter(
            event_type='platform.feature_flag.updated', aggregate_id=str(flag.id),
        ).exists()

    def test_non_admin_cannot_create_flag(self, client, tenant_alpha):
        c = _regular_client(client, tenant_alpha)
        resp = c.post('/api/v1/platform/feature-flags/', {
            'code': 'secret', 'is_globally_enabled': True,
        }, content_type='application/json', **self._tenant_header(tenant_alpha))
        assert resp.status_code == 403

    def test_read_flag_blocks_non_admin_with_problem_details(self, client, tenant_alpha):
        # Given: an authenticated tenant user who is not a platform administrator
        c = _regular_client(client, tenant_alpha)
        FeatureFlag.objects.create(code='public-flag', is_globally_enabled=True)

        # When: the user requests the administrative feature-flag collection
        resp = c.get('/api/v1/platform/feature-flags/', **self._tenant_header(tenant_alpha))

        # Then: access is denied without leaking flag overrides
        assert resp.status_code == 403
        assert resp['Content-Type'].startswith('application/problem+json')
        assert resp.json()['status'] == 403
        assert 'tenant_overrides' not in resp.json()


@pytest.mark.django_db
class TestEntitlementsAPI:
    def test_create_entitlement(self, client, tenant_alpha):
        c = _admin_client(client, tenant_alpha)
        resp = c.post('/api/v1/platform/entitlements/', {
            'tenant': str(tenant_alpha.id),
            'capability': 'reports',
            'is_enabled': True,
            'limit_value': 50,
        }, content_type='application/json')
        assert resp.status_code == 201
        assert resp.json()['capability'] == 'reports'
        assert PlatformAdminAudit.objects.filter(
            action='entitlement.updated',
            target_tenant=tenant_alpha,
            detail__capability='reports',
        ).exists()


@pytest.mark.django_db
class TestSupportAccessAPI:
    def test_request_access(self, client, tenant_alpha):
        c = _regular_client(client, tenant_alpha)
        resp = c.post('/api/v1/platform/support-access/', {
            'target_tenant': str(tenant_alpha.id),
            'reason': 'Need help',
        }, content_type='application/json',
            **{'HTTP_X_TENANT_ID': str(tenant_alpha.id)})
        assert resp.status_code == 201
        assert resp.json()['status'] == 'pending'
        assert resp.json()['expires_at'] is not None

    def test_regular_user_cannot_request_access_to_another_tenant(
        self, client, tenant_alpha, tenant_beta,
    ):
        # Given: a user authenticated only in tenant alpha
        c = _regular_client(client, tenant_alpha)

        # When: the user targets tenant beta while operating under alpha
        resp = c.post('/api/v1/platform/support-access/', {
            'target_tenant': str(tenant_beta.id),
            'reason': 'Cross-tenant attempt',
        }, content_type='application/json', HTTP_X_TENANT_ID=str(tenant_alpha.id))

        # Then: the API rejects the request as Problem Details and persists nothing
        assert resp.status_code == 400
        assert resp['Content-Type'].startswith('application/problem+json')
        assert resp.json()['code'] == 'validation_error'
        assert not SupportAccessRequest.objects.filter(
            requester__email='regular@test.local', target_tenant=tenant_beta,
        ).exists()

    def test_approve_access(self, client, tenant_alpha):
        from platform_admin.models import SupportAccessRequest

        c = _admin_client(client, tenant_alpha)
        req = SupportAccessRequest.objects.create(
            requester_id=c.session.get('_auth_user_id'),
            target_tenant=tenant_alpha,
            reason='Help needed',
        )
        resp = c.post(
            f'/api/v1/platform/support-access/{req.id}/approve/',
            content_type='application/json',
            **{'HTTP_X_TENANT_ID': str(tenant_alpha.id)},
        )
        assert resp.status_code == 200
        req.refresh_from_db()
        assert req.status == 'approved'


@pytest.mark.django_db
class TestTenantCapabilitiesAPI:
    def test_tenant_capabilities(self, client, tenant_alpha):
        c = _regular_client(client, tenant_alpha)
        plan = Plan.objects.create(
            code='pro', name='Pro',
            capabilities={'sales': True},
        )
        Subscription.objects.create(
            tenant=tenant_alpha, plan=plan, start_date='2026-07-01',
        )
        resp = c.get(
            '/api/v1/platform/tenant-capabilities/',
            HTTP_X_TENANT_ID=str(tenant_alpha.id),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data['tenant'] == tenant_alpha.slug
        assert data['capabilities'].get('sales') is True

    def test_tenant_capabilities_no_subscription(self, client, tenant_beta):
        c = _regular_client(client, tenant_beta)
        resp = c.get(
            '/api/v1/platform/tenant-capabilities/',
            HTTP_X_TENANT_ID=str(tenant_beta.id),
        )
        assert resp.status_code == 200
        assert resp.json()['subscription_status'] == 'none'
