import re
from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.core import mail
from django.utils import timezone

from accounts.models import OneTimeToken, SignupIntent
from outbox.models import OutboxMessage
from platform_admin.models import Plan, Subscription
from tenancy.models import Branch, Company, Tenant, TenantMembership

User = get_user_model()


@pytest.fixture
def starter_plan(db):
    plan, _ = Plan.objects.update_or_create(
        code='starter',
        defaults={
            'name': 'Starter',
            'is_active': True,
            'is_public': True,
            'trial_days': 14,
        },
    )
    return plan


def _register(client, email='owner@example.test', plan_code='starter'):
    return client.post(
        '/api/v1/auth/register/',
        data={
            'email': email,
            'password': 'A-strong-test-password-2026',
            'tenant_name': 'Casa Animal',
            'company_name': 'Casa Animal Comércio',
            'branch_name': 'Matriz',
            'plan_code': plan_code,
        },
        content_type='application/json',
    )


def _token():
    return re.search(r'token=([^\s]+)', mail.outbox[-1].body).group(1)


def _assert_problem(response, code, instance):
    data = response.json()
    assert set(data) == {
        'type',
        'title',
        'status',
        'detail',
        'instance',
        'code',
        'correlation_id',
        'errors',
    }
    assert data['code'] == code
    assert isinstance(data['detail'], str)
    assert data['instance'] == instance
    assert 'correlation_id' in data
    assert data['errors'] == {}


@pytest.mark.django_db(transaction=True)
def test_given_valid_signup_when_registered_then_only_pending_intent_exists(client, starter_plan):
    response = _register(client)

    assert response.status_code == 202
    user = User.objects.get(email='owner@example.test')
    assert user.email_verified_at is None
    assert not Tenant.objects.filter(memberships__user=user).exists()
    intent = SignupIntent.objects.get(user=user)
    assert intent.status == SignupIntent.STATUS_PENDING
    assert intent.plan_code == 'starter'
    assert OutboxMessage.objects.filter(event_type='auth.signup.requested').count() == 1
    assert len(mail.outbox) == 1


@pytest.mark.django_db(transaction=True)
def test_given_pending_intent_when_confirmed_then_tenant_and_trial_are_created(client, starter_plan):
    _register(client, 'confirm@example.test')

    response = client.post(
        '/api/v1/auth/email/confirm/',
        {'token': _token()},
        content_type='application/json',
    )

    assert response.status_code == 204
    user = User.objects.get(email='confirm@example.test')
    tenant = Tenant.objects.get(memberships__user=user)
    assert user.email_verified_at is not None
    intent = SignupIntent.objects.get(user=user)
    assert intent.provisioned_tenant_id == tenant.id
    assert Company.all_objects.filter(tenant=tenant).count() == 1
    assert tenant.memberships.get(user=user).role == 'admin'
    subscription = Subscription.objects.get(tenant=tenant)
    assert subscription.status == Subscription.STATUS_TRIAL
    assert subscription.start_date == timezone.localdate()
    assert subscription.end_date == timezone.localdate() + timedelta(days=14)
    assert OutboxMessage.objects.filter(event_type='tenant.trial.activated').count() == 1


@pytest.mark.django_db(transaction=True)
def test_given_consumed_token_when_replayed_then_confirmation_is_idempotent(client, starter_plan):
    _register(client, 'replay@example.test')
    token = _token()

    first = client.post('/api/v1/auth/email/confirm/', {'token': token}, content_type='application/json')
    second = client.post('/api/v1/auth/email/confirm/', {'token': token}, content_type='application/json')

    assert first.status_code == 204
    assert second.status_code == 204
    user = User.objects.get(email='replay@example.test')
    assert Tenant.objects.filter(memberships__user=user).count() == 1
    assert Subscription.objects.filter(tenant__memberships__user=user).count() == 1


@pytest.mark.django_db(transaction=True)
def test_given_non_public_plan_when_registered_then_nothing_is_provisioned(client, db):
    Plan.objects.create(code='private', name='Private', is_active=True, is_public=False, trial_days=14)

    response = _register(client, plan_code='private')

    assert response.status_code == 400
    assert response['Content-Type'].startswith('application/problem+json')
    assert set(response.json()) == {'type', 'title', 'status', 'detail', 'instance', 'code', 'correlation_id', 'errors'}
    _assert_problem(response, 'invalid_plan', '/api/v1/auth/register/')
    assert not User.objects.filter(email='owner@example.test').exists()
    assert not Tenant.objects.exists()


@pytest.mark.django_db(transaction=True)
def test_given_expired_token_when_confirmed_then_problem_response(client, starter_plan):
    _register(client, 'expired@example.test')
    token_id = _token().split('.', 1)[0]
    OneTimeToken.objects.filter(pk=token_id).update(
        expires_at=timezone.now() - timedelta(minutes=1),
    )

    response = client.post(
        '/api/v1/auth/email/confirm/',
        {'token': _token()},
        content_type='application/json',
    )

    assert response.status_code == 400
    assert response['Content-Type'].startswith('application/problem+json')
    assert set(response.json()) == {'type', 'title', 'status', 'detail', 'instance', 'code', 'correlation_id', 'errors'}
    _assert_problem(response, 'invalid_or_expired_token', '/api/v1/auth/email/confirm/')
    assert not Tenant.objects.filter(memberships__user__email='expired@example.test').exists()


@pytest.mark.django_db(transaction=True)
def test_given_provisioning_failure_when_confirmed_then_all_tenant_changes_roll_back(
    client,
    starter_plan,
    monkeypatch,
):
    _register(client, 'rollback@example.test')

    def fail_branch(*args, **kwargs):
        raise RuntimeError('forced rollback')

    monkeypatch.setattr(Branch.objects, 'create', fail_branch)
    with pytest.raises(RuntimeError, match='forced rollback'):
        client.post(
            '/api/v1/auth/email/confirm/',
            {'token': _token()},
            content_type='application/json',
        )

    assert not Tenant.objects.filter(memberships__user__email='rollback@example.test').exists()
    assert User.objects.get(email='rollback@example.test').email_verified_at is None
    assert SignupIntent.objects.get(user__email='rollback@example.test').status == SignupIntent.STATUS_PENDING


@pytest.mark.django_db(transaction=True)
def test_given_existing_email_when_registered_then_response_is_generic(client, starter_plan):
    User.objects.create_user(email='exists@example.test', password='test-password')

    response = _register(client, 'exists@example.test')

    assert response.status_code == 202
    assert response.json()['detail'] == 'If eligible, confirmation instructions will be sent.'


@pytest.mark.django_db
def test_public_plans_returns_only_active_public_trial_plans(client, db):
    Plan.objects.update_or_create(
        code='starter',
        defaults={
            'name': 'Starter',
            'is_active': True,
            'is_public': True,
            'trial_days': 14,
        },
    )
    Plan.objects.create(
        code='hidden',
        name='Hidden',
        is_active=True,
        is_public=False,
        trial_days=14,
    )
    Plan.objects.create(
        code='expired',
        name='Expired',
        is_active=False,
        is_public=True,
        trial_days=14,
    )

    response = client.get('/api/v1/auth/plans/')

    assert response.status_code == 200
    assert response.json() == [{'code': 'starter', 'name': 'Starter', 'trial_days': 14}]


@pytest.mark.django_db(transaction=True)
def test_given_consumed_token_with_wrong_secret_when_replayed_then_reject(client, starter_plan):
    _register(client, 'tampered-replay@example.test')
    token = _token()
    assert client.post(
        '/api/v1/auth/email/confirm/',
        {'token': token},
        content_type='application/json',
    ).status_code == 204

    tampered = f'{token[:-1]}x'
    response = client.post(
        '/api/v1/auth/email/confirm/',
        {'token': tampered},
        content_type='application/json',
    )

    assert response.status_code == 400
    assert response['Content-Type'].startswith('application/problem+json')


@pytest.mark.django_db(transaction=True)
def test_existing_email_and_new_email_with_invalid_plan_are_indistinguishable(client, starter_plan):
    Plan.objects.create(
        code='private',
        name='Private',
        is_active=True,
        is_public=False,
        trial_days=14,
    )
    User.objects.create_user(email='already@example.test', password='test-password')

    existing = _register(client, 'already@example.test', plan_code='private')
    new = _register(client, 'new@example.test', plan_code='private')

    assert existing.status_code == new.status_code == 400
    assert existing['Content-Type'].startswith('application/problem+json')
    assert existing.json() == new.json()
    assert not User.objects.filter(email='new@example.test').exists()


@pytest.mark.django_db(transaction=True)
def test_nonexistent_plan_is_rejected_without_creating_user(client, starter_plan):
    response = _register(client, 'missing-plan@example.test', plan_code='does-not-exist')

    assert response.status_code == 400
    assert response['Content-Type'].startswith('application/problem+json')
    assert set(response.json()) == {'type', 'title', 'status', 'detail', 'instance', 'code', 'correlation_id', 'errors'}
    assert response.json()['code'] == 'invalid_plan'
    assert not User.objects.filter(email='missing-plan@example.test').exists()


@pytest.mark.django_db(transaction=True)
def test_plan_deactivated_before_confirmation_returns_problem_and_rolls_back(client, starter_plan):
    _register(client, 'deactivated@example.test')
    Plan.objects.filter(code='starter').update(is_active=False)

    response = client.post(
        '/api/v1/auth/email/confirm/',
        {'token': _token()},
        content_type='application/json',
    )

    assert response.status_code == 400
    assert response['Content-Type'].startswith('application/problem+json')
    assert set(response.json()) == {'type', 'title', 'status', 'detail', 'instance', 'code', 'correlation_id', 'errors'}
    assert response.json()['code'] == 'invalid_plan'
    assert not Tenant.objects.filter(memberships__user__email='deactivated@example.test').exists()
    assert User.objects.get(email='deactivated@example.test').email_verified_at is None
    assert SignupIntent.objects.get(user__email='deactivated@example.test').status == SignupIntent.STATUS_PENDING


@pytest.mark.django_db
def test_missing_public_registration_field_returns_problem_details(client, starter_plan):
    response = client.post(
        '/api/v1/auth/register/',
        {
            'email': 'missing-field@example.test',
            'password': 'A-strong-test-password-2026',
            'tenant_name': 'Tenant',
            'company_name': 'Company',
            'branch_name': 'Branch',
        },
        content_type='application/json',
    )

    assert response.status_code == 400
    assert response['Content-Type'].startswith('application/problem+json')
    assert set(response.json()) == {'type', 'title', 'status', 'detail', 'instance', 'code', 'correlation_id', 'errors'}
    _assert_problem(response, 'validation_error', '/api/v1/auth/register/')
    assert 'plan_code' in response.json()['errors']
