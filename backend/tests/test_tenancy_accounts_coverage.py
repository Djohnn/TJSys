"""High-coverage tests for tenancy/views_access.py, accounts/views/mfa.py, accounts/services/mfa.py."""

import re
import uuid

import pyotp
import pytest
from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.utils import timezone

from accounts.models import MFADevice, RecoveryCode
from accounts.security import decrypt_secret
from accounts.services.mfa import (
    begin_totp_enrollment,
    confirm_totp,
    consume_recovery_code,
    issue_email_challenge,
    regenerate_recovery_codes,
    verify_email_challenge,
)
from tenancy.models import (
    Branch,
    Company,
    Invitation,
    Tenant,
    TenantMembership,
    TenantMFAPolicy,
    UserBranch,
)

User = get_user_model()


def _uid():
    return uuid.uuid4().hex[:8]


def _make_admin(client, tenant, email=None):
    email = email or f'admin-{_uid()}@test.local'
    user = User.objects.create_user(email=email, password='test-password')
    TenantMembership.objects.create(user=user, tenant=tenant, role='admin')
    MFADevice.objects.create(
        user=user, tenant=tenant, method='totp', verified_at=timezone.now(),
    )
    client.force_login(user)
    session = client.session
    session['mfa_tenant_id'] = str(tenant.id)
    session['mfa_method'] = 'totp'
    session.save()
    return user


def _make_operator(client, tenant, email=None):
    email = email or f'op-{_uid()}@test.local'
    user = User.objects.create_user(email=email, password='test-password')
    TenantMembership.objects.create(user=user, tenant=tenant, role='operator')
    client.force_login(user)
    session = client.session
    session['mfa_tenant_id'] = str(tenant.id)
    session['mfa_method'] = 'totp'
    session.save()
    return user


def _setup_pre_mfa(client, tenant, email=None):
    email = email or f'premfa-{_uid()}@test.local'
    user = User.objects.create_user(email=email, password='valid-password')
    user.email_verified_at = timezone.now()
    user.save(update_fields=['email_verified_at'])
    TenantMembership.objects.create(user=user, tenant=tenant, role='admin')
    TenantMFAPolicy.objects.create(tenant=tenant)
    resp = client.post(
        '/api/v1/auth/login/',
        {'email': user.email, 'password': 'valid-password'},
        content_type='application/json',
    )
    assert resp.status_code == 202, f'Login failed: {resp.status_code} {resp.content}'
    return user, tenant


def _run_in_tenant(tenant, callback):
    from django.db import connection

    from tenancy.context import reset_current_tenant_id, set_current_tenant_id
    token = set_current_tenant_id(tenant.id)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SET app.current_tenant_id = %s', [str(tenant.id)])
        return callback()
    finally:
        reset_current_tenant_id(token)


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()


# ===================================================================
# PART 1 — tenancy/views_access.py
# ===================================================================


class TestInvitationListCreateView:

    @pytest.mark.django_db
    def test_list_invitations(self, client):
        tenant = Tenant.objects.create(name='ILC List', slug=f'ilc-list-{_uid()}')
        admin = _make_admin(client, tenant)
        inv = Invitation.objects.create(
            tenant=tenant, invited_by=admin, email='someone@test.local',
            role='operator', token_digest='abc',
            expires_at=timezone.now() + timezone.timedelta(days=7),
        )
        resp = client.get('/api/v1/invitations/', HTTP_X_TENANT_ID=str(tenant.id))
        assert resp.status_code == 200
        ids = [i['id'] for i in resp.json()['results']]
        assert str(inv.id) in ids

    @pytest.mark.django_db
    def test_create_invitation(self, client):
        tenant = Tenant.objects.create(name='ILC Create', slug=f'ilc-create-{_uid()}')
        _make_admin(client, tenant)
        resp = client.post(
            '/api/v1/invitations/',
            {'email': 'newuser@test.local', 'role': 'operator'},
            content_type='application/json',
            HTTP_X_TENANT_ID=str(tenant.id),
        )
        assert resp.status_code == 201
        assert Invitation.objects.filter(tenant=tenant, email='newuser@test.local').exists()

    @pytest.mark.django_db
    def test_operator_cannot_create_invitation(self, client):
        tenant = Tenant.objects.create(name='ILC Deny', slug=f'ilc-deny-{_uid()}')
        _make_operator(client, tenant)
        resp = client.post(
            '/api/v1/invitations/',
            {'email': 'x@test.local', 'role': 'operator'},
            content_type='application/json',
            HTTP_X_TENANT_ID=str(tenant.id),
        )
        assert resp.status_code == 403

    @pytest.mark.django_db
    def test_list_excludes_other_tenant(self, client):
        t1 = Tenant.objects.create(name='ILC T1', slug=f'ilc-t1-{_uid()}')
        t2 = Tenant.objects.create(name='ILC T2', slug=f'ilc-t2-{_uid()}')
        admin1 = _make_admin(client, t1)
        Invitation.objects.create(
            tenant=t2, invited_by=admin1, email='other@test.local',
            role='operator', token_digest='x',
            expires_at=timezone.now() + timezone.timedelta(days=7),
        )
        resp = client.get('/api/v1/invitations/', HTTP_X_TENANT_ID=str(t1.id))
        assert resp.status_code == 200
        assert len(resp.json()['results']) == 0

    @pytest.mark.django_db
    def test_create_invitation_invalidates_old_token(self, client):
        tenant = Tenant.objects.create(name='ILC Inv', slug=f'ilc-inv-{_uid()}')
        _make_admin(client, tenant)
        first = client.post(
            '/api/v1/invitations/',
            {'email': 'target@test.local', 'role': 'operator'},
            content_type='application/json',
            HTTP_X_TENANT_ID=str(tenant.id),
        )
        assert first.status_code == 201
        second = client.post(
            '/api/v1/invitations/',
            {'email': 'target@test.local', 'role': 'manager'},
            content_type='application/json',
            HTTP_X_TENANT_ID=str(tenant.id),
        )
        assert second.status_code == 201
        assert Invitation.objects.get(pk=second.json()['id']).role == 'manager'


class TestInvitationAcceptView:

    @pytest.mark.django_db(transaction=True)
    def test_accept_valid_token(self, client):
        tenant = Tenant.objects.create(name='IA Valid', slug=f'ia-valid-{_uid()}')
        admin = User.objects.create_user(email=f'ia-admin-{_uid()}@test.local', password='test-password')
        TenantMembership.objects.create(user=admin, tenant=tenant, role='admin')
        invitee = User.objects.create_user(email=f'ia-invitee-{_uid()}@test.local', password='test-password')
        client.force_login(admin)
        session = client.session
        session['mfa_tenant_id'] = str(tenant.id)
        session['mfa_method'] = 'totp'
        session.save()
        client.post(
            '/api/v1/invitations/',
            {'email': invitee.email, 'role': 'operator'},
            content_type='application/json',
            HTTP_X_TENANT_ID=str(tenant.id),
        )
        token_match = re.search(r'token=([^\s]+)', mail.outbox[-1].body)
        raw_token = token_match.group(1)
        client.force_login(invitee)
        resp = client.post(
            '/api/v1/invitations/accept/',
            {'token': raw_token},
            content_type='application/json',
        )
        assert resp.status_code == 204
        assert TenantMembership.objects.filter(
            user=invitee, tenant=tenant, role='operator', is_active=True,
        ).exists()

    @pytest.mark.django_db
    def test_accept_invalid_token(self, client):
        invitee = User.objects.create_user(email=f'ia-bad-{_uid()}@test.local', password='test-password')
        client.force_login(invitee)
        bad_token = f'{uuid.uuid4()}.badsecret'
        resp = client.post(
            '/api/v1/invitations/accept/',
            {'token': bad_token},
            content_type='application/json',
        )
        assert resp.status_code == 400
        assert 'Invalid or expired' in resp.json()['detail']


class TestInvitationResendView:

    @pytest.mark.django_db
    def test_resend_invitation(self, client):
        tenant = Tenant.objects.create(name='IR Resend', slug=f'ir-resend-{_uid()}')
        admin = _make_admin(client, tenant)
        inv = Invitation.objects.create(
            tenant=tenant, invited_by=admin, email='resend@test.local',
            role='operator', token_digest='old-digest',
            expires_at=timezone.now() + timezone.timedelta(days=7),
        )
        resp = client.post(
            f'/api/v1/invitations/{inv.id}/resend/',
            HTTP_X_TENANT_ID=str(tenant.id),
        )
        assert resp.status_code == 202
        inv.refresh_from_db()
        assert inv.token_digest != 'old-digest'

    @pytest.mark.django_db
    def test_resend_not_found(self, client):
        tenant = Tenant.objects.create(name='IR 404', slug=f'ir-404-{_uid()}')
        _make_admin(client, tenant)
        resp = client.post(
            f'/api/v1/invitations/{uuid.uuid4()}/resend/',
            HTTP_X_TENANT_ID=str(tenant.id),
        )
        assert resp.status_code == 404

    @pytest.mark.django_db
    def test_resend_accepted_invitation_returns_409(self, client):
        tenant = Tenant.objects.create(name='IR 409', slug=f'ir-409-{_uid()}')
        admin = _make_admin(client, tenant)
        inv = Invitation.objects.create(
            tenant=tenant, invited_by=admin, email='accepted@test.local',
            role='operator', token_digest='x',
            expires_at=timezone.now() + timezone.timedelta(days=7),
            accepted_at=timezone.now(),
        )
        resp = client.post(
            f'/api/v1/invitations/{inv.id}/resend/',
            HTTP_X_TENANT_ID=str(tenant.id),
        )
        assert resp.status_code == 409

    @pytest.mark.django_db
    def test_resend_forbidden_for_operator(self, client):
        tenant = Tenant.objects.create(name='IR Forbid', slug=f'ir-forbid-{_uid()}')
        _make_operator(client, tenant)
        resp = client.post(
            f'/api/v1/invitations/{uuid.uuid4()}/resend/',
            HTTP_X_TENANT_ID=str(tenant.id),
        )
        assert resp.status_code == 403


class TestMembershipListView:

    @pytest.mark.django_db
    def test_list_members(self, client):
        tenant = Tenant.objects.create(name='ML List', slug=f'ml-list-{_uid()}')
        _make_admin(client, tenant)
        m1 = User.objects.create_user(email=f'ml-m1-{_uid()}@test.local', password='test-password')
        m2 = User.objects.create_user(email=f'ml-m2-{_uid()}@test.local', password='test-password')
        TenantMembership.objects.create(user=m1, tenant=tenant, role='operator')
        TenantMembership.objects.create(user=m2, tenant=tenant, role='manager')
        resp = client.get('/api/v1/memberships/', HTTP_X_TENANT_ID=str(tenant.id))
        assert resp.status_code == 200
        emails = [m['email'] for m in resp.json()['results']]
        assert m1.email in emails
        assert m2.email in emails

    @pytest.mark.django_db
    def test_list_excludes_other_tenant(self, client):
        t1 = Tenant.objects.create(name='ML T1', slug=f'ml-t1-{_uid()}')
        t2 = Tenant.objects.create(name='ML T2', slug=f'ml-t2-{_uid()}')
        _make_admin(client, t1)
        other = User.objects.create_user(email=f'ml-other-{_uid()}@test.local', password='test-password')
        TenantMembership.objects.create(user=other, tenant=t2, role='operator')
        resp = client.get('/api/v1/memberships/', HTTP_X_TENANT_ID=str(t1.id))
        assert resp.status_code == 200
        emails = [m['email'] for m in resp.json()['results']]
        assert other.email not in emails


class TestMembershipDetailView:

    @pytest.mark.django_db
    def test_update_role(self, client):
        tenant = Tenant.objects.create(name='MD Role', slug=f'md-role-{_uid()}')
        _make_admin(client, tenant)
        member = User.objects.create_user(email=f'md-m-{_uid()}@test.local', password='test-password')
        membership = TenantMembership.objects.create(user=member, tenant=tenant, role='operator')
        resp = client.patch(
            f'/api/v1/memberships/{membership.id}/',
            {'role': 'manager'},
            content_type='application/json',
            HTTP_X_TENANT_ID=str(tenant.id),
        )
        assert resp.status_code == 200
        assert resp.json()['role'] == 'manager'

    @pytest.mark.django_db
    def test_cannot_remove_last_admin(self, client):
        tenant = Tenant.objects.create(name='MD LastAdmin', slug=f'md-la-{_uid()}')
        admin_user = _make_admin(client, tenant)
        membership = TenantMembership.objects.get(user=admin_user, tenant=tenant)
        resp = client.patch(
            f'/api/v1/memberships/{membership.id}/',
            {'role': 'operator'},
            content_type='application/json',
            HTTP_X_TENANT_ID=str(tenant.id),
        )
        assert resp.status_code == 400

    @pytest.mark.django_db
    def test_cannot_deactivate_last_admin(self, client):
        tenant = Tenant.objects.create(name='MD Deact', slug=f'md-deact-{_uid()}')
        admin_user = _make_admin(client, tenant)
        membership = TenantMembership.objects.get(user=admin_user, tenant=tenant)
        resp = client.patch(
            f'/api/v1/memberships/{membership.id}/',
            {'is_active': False},
            content_type='application/json',
            HTTP_X_TENANT_ID=str(tenant.id),
        )
        assert resp.status_code == 400

    @pytest.mark.django_db
    def test_update_with_valid_branches(self, client):
        tenant = Tenant.objects.create(name='MD Branches', slug=f'md-br-{_uid()}')
        _make_admin(client, tenant)
        company = _run_in_tenant(tenant, lambda: Company.all_objects.create(tenant=tenant, name='MD Co'))
        branch = _run_in_tenant(tenant, lambda: Branch.all_objects.create(
            tenant=tenant, company=company, name='MD Br',
        ))
        member = User.objects.create_user(email=f'md-brm-{_uid()}@test.local', password='test-password')
        membership = TenantMembership.objects.create(user=member, tenant=tenant, role='operator')
        resp = client.patch(
            f'/api/v1/memberships/{membership.id}/',
            {'role': 'manager', 'branch_ids': [str(branch.id)]},
            content_type='application/json',
            HTTP_X_TENANT_ID=str(tenant.id),
        )
        assert resp.status_code == 200
        assert UserBranch.objects.filter(user=member, branch=branch).exists()

    @pytest.mark.django_db
    def test_update_with_invalid_branches(self, client):
        tenant = Tenant.objects.create(name='MD BadBr', slug=f'md-bb-{_uid()}')
        _make_admin(client, tenant)
        other_tenant = Tenant.objects.create(name='MD Other', slug=f'md-other-{_uid()}')
        other_co = _run_in_tenant(other_tenant, lambda: Company.all_objects.create(
            tenant=other_tenant, name='Other Co',
        ))
        other_br = _run_in_tenant(other_tenant, lambda: Branch.all_objects.create(
            tenant=other_tenant, company=other_co, name='Other Br',
        ))
        member = User.objects.create_user(email=f'md-bbm-{_uid()}@test.local', password='test-password')
        membership = TenantMembership.objects.create(user=member, tenant=tenant, role='operator')
        resp = client.patch(
            f'/api/v1/memberships/{membership.id}/',
            {'role': 'manager', 'branch_ids': [str(other_br.id)]},
            content_type='application/json',
            HTTP_X_TENANT_ID=str(tenant.id),
        )
        assert resp.status_code == 400

    @pytest.mark.django_db
    def test_operator_gets_empty_queryset(self, client):
        tenant = Tenant.objects.create(name='MD Empty', slug=f'md-empty-{_uid()}')
        _make_operator(client, tenant)
        member = User.objects.create_user(email=f'md-em-{_uid()}@test.local', password='test-password')
        membership = TenantMembership.objects.create(user=member, tenant=tenant, role='operator')
        resp = client.patch(
            f'/api/v1/memberships/{membership.id}/',
            {'role': 'manager'},
            content_type='application/json',
            HTTP_X_TENANT_ID=str(tenant.id),
        )
        assert resp.status_code == 404

    @pytest.mark.django_db
    def test_other_tenant_membership_returns_404(self, client):
        t1 = Tenant.objects.create(name='MD T1', slug=f'md-t1-{_uid()}')
        t2 = Tenant.objects.create(name='MD T2', slug=f'md-t2-{_uid()}')
        _make_admin(client, t1)
        other = User.objects.create_user(email=f'md-t2m-{_uid()}@test.local', password='test-password')
        target = TenantMembership.objects.create(user=other, tenant=t2, role='operator')
        resp = client.patch(
            f'/api/v1/memberships/{target.id}/',
            {'role': 'manager'},
            content_type='application/json',
            HTTP_X_TENANT_ID=str(t1.id),
        )
        assert resp.status_code == 404


class TestMFAPolicyView:

    @pytest.mark.django_db
    def test_get_policy_creates_default(self, client):
        tenant = Tenant.objects.create(name='MFAP Get', slug=f'mfa-p-get-{_uid()}')
        _make_admin(client, tenant)
        resp = client.get('/api/v1/security/mfa-policy/', HTTP_X_TENANT_ID=str(tenant.id))
        assert resp.status_code == 200
        assert resp.json()['allow_totp'] is True
        assert resp.json()['allow_email'] is True

    @pytest.mark.django_db
    def test_patch_policy(self, client):
        tenant = Tenant.objects.create(name='MFAP Patch', slug=f'mfa-p-patch-{_uid()}')
        admin = _make_admin(client, tenant)
        MFADevice.objects.create(
            user=admin, tenant=tenant, method='email', verified_at=timezone.now(),
        )
        resp = client.patch(
            '/api/v1/security/mfa-policy/',
            {'allow_totp': False, 'allow_email': True},
            content_type='application/json',
            HTTP_X_TENANT_ID=str(tenant.id),
        )
        assert resp.status_code == 200
        assert resp.json()['allow_totp'] is False
        assert resp.json()['allow_email'] is True

    @pytest.mark.django_db
    def test_patch_policy_forbidden_for_operator(self, client):
        tenant = Tenant.objects.create(name='MFAP Forbid', slug=f'mfa-p-forbid-{_uid()}')
        _make_operator(client, tenant)
        resp = client.patch(
            '/api/v1/security/mfa-policy/',
            {'allow_totp': True, 'allow_email': False},
            content_type='application/json',
            HTTP_X_TENANT_ID=str(tenant.id),
        )
        assert resp.status_code == 403

    @pytest.mark.django_db
    def test_patch_policy_rejects_disable_all(self, client):
        tenant = Tenant.objects.create(name='MFAP AllOff', slug=f'mfa-p-alloff-{_uid()}')
        _make_admin(client, tenant)
        resp = client.patch(
            '/api/v1/security/mfa-policy/',
            {'allow_totp': False, 'allow_email': False},
            content_type='application/json',
            HTTP_X_TENANT_ID=str(tenant.id),
        )
        assert resp.status_code == 400


# ===================================================================
# PART 2 — accounts/views/mfa.py
# ===================================================================


class TestTOTPEnrollmentView:

    @pytest.mark.django_db
    def test_totp_enrollment(self, client):
        tenant = Tenant.objects.create(name='TE Enroll', slug=f'te-enroll-{_uid()}')
        user, tenant = _setup_pre_mfa(client, tenant)
        resp = client.post(
            '/api/v1/auth/mfa/totp/enroll/',
            {'tenant_id': str(tenant.id)},
            content_type='application/json',
        )
        assert resp.status_code == 201
        data = resp.json()
        assert 'device_id' in data
        assert 'otpauth_uri' in data
        device = MFADevice.objects.get(pk=data['device_id'])
        assert device.user == user
        assert device.method == 'totp'
        assert device.verified_at is None

    @pytest.mark.django_db
    def test_totp_enrollment_no_pre_mfa_user(self, client):
        tenant = Tenant.objects.create(name='TE NoUser', slug=f'te-nouser-{_uid()}')
        TenantMFAPolicy.objects.create(tenant=tenant)
        resp = client.post(
            '/api/v1/auth/mfa/totp/enroll/',
            {'tenant_id': str(tenant.id)},
            content_type='application/json',
        )
        assert resp.status_code == 404

    @pytest.mark.django_db
    def test_totp_enrollment_disallowed(self, client):
        tenant = Tenant.objects.create(name='TE Disallow', slug=f'te-disallow-{_uid()}')
        _setup_pre_mfa(client, tenant)
        policy = TenantMFAPolicy.objects.get(tenant=tenant)
        policy.allow_totp = False
        policy.save()
        resp = client.post(
            '/api/v1/auth/mfa/totp/enroll/',
            {'tenant_id': str(tenant.id)},
            content_type='application/json',
        )
        assert resp.status_code == 403
        assert 'TOTP is not allowed' in resp.json()['detail']

    @pytest.mark.django_db
    def test_totp_enrollment_no_membership(self, client):
        tenant = Tenant.objects.create(name='TE NoMem', slug=f'te-nomem-{_uid()}')
        user = User.objects.create_user(email=f'te-nomem-{_uid()}@test.local', password='pass123')
        user.email_verified_at = timezone.now()
        user.save(update_fields=['email_verified_at'])
        TenantMFAPolicy.objects.create(tenant=tenant)
        client.force_login(user)
        client.session['pre_mfa_user_id'] = str(user.id)
        client.session.save()
        other_tenant = Tenant.objects.create(name='TE Other', slug=f'te-other-{_uid()}')
        resp = client.post(
            '/api/v1/auth/mfa/totp/enroll/',
            {'tenant_id': str(other_tenant.id)},
            content_type='application/json',
        )
        assert resp.status_code == 404


class TestTOTPConfirmationView:

    @pytest.mark.django_db
    def test_totp_confirm_valid(self, client):
        tenant = Tenant.objects.create(name='TC Valid', slug=f'tc-valid-{_uid()}')
        user, tenant = _setup_pre_mfa(client, tenant)
        enroll_resp = client.post(
            '/api/v1/auth/mfa/totp/enroll/',
            {'tenant_id': str(tenant.id)},
            content_type='application/json',
        )
        device = MFADevice.objects.get(pk=enroll_resp.json()['device_id'])
        code = pyotp.TOTP(decrypt_secret(device.encrypted_secret)).now()
        resp = client.post(
            '/api/v1/auth/mfa/totp/confirm/',
            {'device_id': str(device.id), 'code': code},
            content_type='application/json',
        )
        assert resp.status_code == 204
        device.refresh_from_db()
        assert device.verified_at is not None

    @pytest.mark.django_db
    def test_totp_confirm_invalid(self, client):
        tenant = Tenant.objects.create(name='TC Invalid', slug=f'tc-invalid-{_uid()}')
        user, tenant = _setup_pre_mfa(client, tenant)
        enroll_resp = client.post(
            '/api/v1/auth/mfa/totp/enroll/',
            {'tenant_id': str(tenant.id)},
            content_type='application/json',
        )
        device = MFADevice.objects.get(pk=enroll_resp.json()['device_id'])
        resp = client.post(
            '/api/v1/auth/mfa/totp/confirm/',
            {'device_id': str(device.id), 'code': '000000'},
            content_type='application/json',
        )
        assert resp.status_code == 400
        assert 'Invalid code' in resp.json()['detail']

    @pytest.mark.django_db
    def test_totp_confirm_nonexistent_device(self, client):
        tenant = Tenant.objects.create(name='TC NoDev', slug=f'tc-nodev-{_uid()}')
        _setup_pre_mfa(client, tenant)
        resp = client.post(
            '/api/v1/auth/mfa/totp/confirm/',
            {'device_id': str(uuid.uuid4()), 'code': '123456'},
            content_type='application/json',
        )
        assert resp.status_code == 400


class TestEmailMFASendView:

    @pytest.mark.django_db(transaction=True)
    def test_email_mfa_send(self, client):
        tenant = Tenant.objects.create(name='EM Send', slug=f'em-send-{_uid()}')
        user, tenant = _setup_pre_mfa(client, tenant)
        resp = client.post(
            '/api/v1/auth/mfa/email/send/',
            {'tenant_id': str(tenant.id)},
            content_type='application/json',
        )
        assert resp.status_code == 202
        assert 'challenge_id' in resp.json()
        assert len(mail.outbox) == 1

    @pytest.mark.django_db(transaction=True)
    def test_email_mfa_send_cooldown(self, client):
        tenant = Tenant.objects.create(name='EM Cooldown', slug=f'em-cd-{_uid()}')
        user, tenant = _setup_pre_mfa(client, tenant)
        resp1 = client.post(
            '/api/v1/auth/mfa/email/send/',
            {'tenant_id': str(tenant.id)},
            content_type='application/json',
        )
        assert resp1.status_code == 202
        resp2 = client.post(
            '/api/v1/auth/mfa/email/send/',
            {'tenant_id': str(tenant.id)},
            content_type='application/json',
        )
        assert resp2.status_code == 429

    @pytest.mark.django_db
    def test_email_mfa_send_disallowed(self, client):
        tenant = Tenant.objects.create(name='EM Disallow', slug=f'em-disallow-{_uid()}')
        _setup_pre_mfa(client, tenant)
        policy = TenantMFAPolicy.objects.get(tenant=tenant)
        policy.allow_email = False
        policy.save()
        resp = client.post(
            '/api/v1/auth/mfa/email/send/',
            {'tenant_id': str(tenant.id)},
            content_type='application/json',
        )
        assert resp.status_code == 403
        assert 'Email MFA is not allowed' in resp.json()['detail']

    @pytest.mark.django_db
    def test_email_mfa_send_no_membership(self, client):
        tenant = Tenant.objects.create(name='EM NoMem', slug=f'em-nomem-{_uid()}')
        user = User.objects.create_user(email=f'em-nomem-{_uid()}@test.local', password='pass123')
        user.email_verified_at = timezone.now()
        user.save(update_fields=['email_verified_at'])
        TenantMFAPolicy.objects.create(tenant=tenant)
        client.force_login(user)
        client.session['pre_mfa_user_id'] = str(user.id)
        client.session.save()
        other = Tenant.objects.create(name='EM Other', slug=f'em-other-{_uid()}')
        resp = client.post(
            '/api/v1/auth/mfa/email/send/',
            {'tenant_id': str(other.id)},
            content_type='application/json',
        )
        assert resp.status_code == 404


class TestMFAChallengeView:

    @pytest.mark.django_db(transaction=True)
    def test_challenge_valid(self, client):
        tenant = Tenant.objects.create(name='MCH Valid', slug=f'mch-valid-{_uid()}')
        user, tenant = _setup_pre_mfa(client, tenant)
        send_resp = client.post(
            '/api/v1/auth/mfa/email/send/',
            {'tenant_id': str(tenant.id)},
            content_type='application/json',
        )
        code = re.search(r'code=([0-9]{6})', mail.outbox[-1].body).group(1)
        resp = client.post(
            '/api/v1/auth/mfa/challenge/',
            {'challenge_id': send_resp.json()['challenge_id'], 'code': code},
            content_type='application/json',
        )
        assert resp.status_code == 204
        assert client.session['_auth_user_id'] == str(user.id)

    @pytest.mark.django_db(transaction=True)
    def test_challenge_invalid_code(self, client):
        tenant = Tenant.objects.create(name='MCH Invalid', slug=f'mch-invalid-{_uid()}')
        _setup_pre_mfa(client, tenant)
        send_resp = client.post(
            '/api/v1/auth/mfa/email/send/',
            {'tenant_id': str(tenant.id)},
            content_type='application/json',
        )
        resp = client.post(
            '/api/v1/auth/mfa/challenge/',
            {'challenge_id': send_resp.json()['challenge_id'], 'code': '000000'},
            content_type='application/json',
        )
        assert resp.status_code == 400
        assert 'Invalid code' in resp.json()['detail']

    @pytest.mark.django_db
    def test_challenge_nonexistent_challenge(self, client):
        tenant = Tenant.objects.create(name='MCH NoChal', slug=f'mch-nochal-{_uid()}')
        _setup_pre_mfa(client, tenant)
        resp = client.post(
            '/api/v1/auth/mfa/challenge/',
            {'challenge_id': str(uuid.uuid4()), 'code': '123456'},
            content_type='application/json',
        )
        assert resp.status_code == 400


class TestRecoveryRegenerateView:

    @pytest.mark.django_db
    def test_regenerate_codes(self, client):
        tenant = Tenant.objects.create(name='RR Gen', slug=f'rr-gen-{_uid()}')
        user = User.objects.create_user(email=f'rr-gen-{_uid()}@test.local', password='test-password')
        TenantMembership.objects.create(user=user, tenant=tenant, role='admin')
        device = MFADevice.objects.create(
            user=user, tenant=tenant, method='totp', verified_at=timezone.now(),
        )
        client.force_login(user)
        session = client.session
        session['mfa_tenant_id'] = str(tenant.id)
        session['mfa_method'] = 'totp'
        session.save()
        resp = client.post('/api/v1/auth/mfa/recovery/regenerate/')
        assert resp.status_code == 201
        codes = resp.json()['codes']
        assert len(codes) == 10
        assert RecoveryCode.objects.filter(device=device).count() == 10

    @pytest.mark.django_db
    def test_regenerate_codes_no_device(self, client):
        tenant = Tenant.objects.create(name='RR NoDev', slug=f'rr-nodev-{_uid()}')
        user = User.objects.create_user(email=f'rr-nodev-{_uid()}@test.local', password='test-password')
        TenantMembership.objects.create(user=user, tenant=tenant, role='admin')
        client.force_login(user)
        session = client.session
        session['mfa_tenant_id'] = str(tenant.id)
        session['mfa_method'] = 'totp'
        session.save()
        resp = client.post('/api/v1/auth/mfa/recovery/regenerate/')
        assert resp.status_code == 409
        assert 'MFA device required' in resp.json()['detail']


class TestRecoveryVerifyView:

    @pytest.mark.django_db(transaction=True)
    def test_recovery_verify_valid(self, client):
        tenant = Tenant.objects.create(name='RV Valid', slug=f'rv-valid-{_uid()}')
        user, tenant = _setup_pre_mfa(client, tenant)
        device = MFADevice.objects.create(
            user=user, tenant=tenant, method='totp', verified_at=timezone.now(),
        )
        codes = regenerate_recovery_codes(device=device)
        resp = client.post(
            '/api/v1/auth/mfa/recovery/verify/',
            {'tenant_id': str(tenant.id), 'code': codes[0]},
            content_type='application/json',
        )
        assert resp.status_code == 204

    @pytest.mark.django_db
    def test_recovery_verify_invalid(self, client):
        tenant = Tenant.objects.create(name='RV Invalid', slug=f'rv-invalid-{_uid()}')
        user = User.objects.create_user(email=f'rv-inv-{_uid()}@test.local', password='pass123')
        user.email_verified_at = timezone.now()
        user.save(update_fields=['email_verified_at'])
        TenantMembership.objects.create(user=user, tenant=tenant, role='admin')
        TenantMFAPolicy.objects.create(tenant=tenant)
        MFADevice.objects.create(
            user=user, tenant=tenant, method='totp', verified_at=timezone.now(),
        )
        client.force_login(user)
        client.session['pre_mfa_user_id'] = str(user.id)
        client.session.save()
        resp = client.post(
            '/api/v1/auth/mfa/recovery/verify/',
            {'tenant_id': str(tenant.id), 'code': 'deadbeefcafe1234'},
            content_type='application/json',
        )
        assert resp.status_code == 400
        assert 'Invalid recovery code' in resp.json()['detail']

    @pytest.mark.django_db
    def test_recovery_verify_no_membership(self, client):
        tenant = Tenant.objects.create(name='RV NoMem', slug=f'rv-nomem-{_uid()}')
        user = User.objects.create_user(email=f'rv-nm-{_uid()}@test.local', password='pass123')
        user.email_verified_at = timezone.now()
        user.save(update_fields=['email_verified_at'])
        client.force_login(user)
        client.session['pre_mfa_user_id'] = str(user.id)
        client.session.save()
        other = Tenant.objects.create(name='RV Other', slug=f'rv-other-{_uid()}')
        resp = client.post(
            '/api/v1/auth/mfa/recovery/verify/',
            {'tenant_id': str(other.id), 'code': 'deadbeef'},
            content_type='application/json',
        )
        assert resp.status_code == 400


# ===================================================================
# PART 3 — accounts/services/mfa.py
# ===================================================================


class TestBeginTOTPEnrollment:

    @pytest.mark.django_db
    def test_happy_path(self):
        user = User.objects.create_user(email=f'svc-totp-{_uid()}@test.local', password='test')
        tenant = Tenant.objects.create(name='Svc TOTP', slug=f'svc-totp-{_uid()}')
        uri, device = begin_totp_enrollment(user=user, tenant=tenant)
        assert uri.startswith('otpauth://totp/')
        assert device.user == user
        assert device.method == 'totp'
        assert device.verified_at is None

    @pytest.mark.django_db
    def test_idempotent(self):
        user = User.objects.create_user(email=f'svc-totp2-{_uid()}@test.local', password='test')
        tenant = Tenant.objects.create(name='Svc TOTP2', slug=f'svc-totp2-{_uid()}')
        uri1, dev1 = begin_totp_enrollment(user=user, tenant=tenant)
        uri2, dev2 = begin_totp_enrollment(user=user, tenant=tenant)
        assert dev1.pk == dev2.pk
        assert uri1 != uri2


class TestConfirmTOTP:

    @pytest.mark.django_db
    def test_valid_code(self):
        user = User.objects.create_user(email=f'svc-ct1-{_uid()}@test.local', password='test')
        tenant = Tenant.objects.create(name='Svc CT1', slug=f'svc-ct1-{_uid()}')
        uri, device = begin_totp_enrollment(user=user, tenant=tenant)
        secret = uri.split('secret=')[1].split('&')[0]
        code = pyotp.TOTP(secret).now()
        assert confirm_totp(device=device, code=code) is True
        device.refresh_from_db()
        assert device.verified_at is not None

    @pytest.mark.django_db
    def test_invalid_code(self):
        user = User.objects.create_user(email=f'svc-ct2-{_uid()}@test.local', password='test')
        tenant = Tenant.objects.create(name='Svc CT2', slug=f'svc-ct2-{_uid()}')
        _, device = begin_totp_enrollment(user=user, tenant=tenant)
        assert confirm_totp(device=device, code='000000') is False

    @pytest.mark.django_db
    def test_replay_rejected(self):
        user = User.objects.create_user(email=f'svc-ct3-{_uid()}@test.local', password='test')
        tenant = Tenant.objects.create(name='Svc CT3', slug=f'svc-ct3-{_uid()}')
        uri, device = begin_totp_enrollment(user=user, tenant=tenant)
        secret = uri.split('secret=')[1].split('&')[0]
        code = pyotp.TOTP(secret).now()
        assert confirm_totp(device=device, code=code) is True
        assert confirm_totp(device=device, code=code) is False


class TestIssueEmailChallenge:

    @pytest.mark.django_db
    def test_happy_path(self):
        user = User.objects.create_user(email=f'svc-ec1-{_uid()}@test.local', password='test')
        code, challenge = issue_email_challenge(user=user)
        assert len(code) == 6
        assert challenge.user == user
        assert challenge.purpose == 'email_mfa'

    @pytest.mark.django_db
    def test_cooldown(self):
        user = User.objects.create_user(email=f'svc-ec2-{_uid()}@test.local', password='test')
        issue_email_challenge(user=user)
        with pytest.raises(ValueError, match='cooldown'):
            issue_email_challenge(user=user)


class TestVerifyEmailChallenge:

    @pytest.mark.django_db
    def test_valid_code(self):
        user = User.objects.create_user(email=f'svc-ev1-{_uid()}@test.local', password='test')
        code, challenge = issue_email_challenge(user=user)
        assert verify_email_challenge(challenge_id=challenge.id, code=code) is True
        challenge.refresh_from_db()
        assert challenge.consumed_at is not None

    @pytest.mark.django_db
    def test_invalid_code(self):
        user = User.objects.create_user(email=f'svc-ev2-{_uid()}@test.local', password='test')
        _, challenge = issue_email_challenge(user=user)
        assert verify_email_challenge(challenge_id=challenge.id, code='000000') is False
        challenge.refresh_from_db()
        assert challenge.attempt_count == 1

    @pytest.mark.django_db
    def test_max_attempts(self):
        user = User.objects.create_user(email=f'svc-ev3-{_uid()}@test.local', password='test')
        _, challenge = issue_email_challenge(user=user)
        for _ in range(5):
            verify_email_challenge(challenge_id=challenge.id, code='000000')
        challenge.refresh_from_db()
        assert challenge.attempt_count >= 5
        assert verify_email_challenge(challenge_id=challenge.id, code='000000') is False

    @pytest.mark.django_db
    def test_nonexistent_challenge(self):
        assert verify_email_challenge(challenge_id=uuid.uuid4(), code='123456') is False

    @pytest.mark.django_db
    def test_consumed_challenge_rejected(self):
        user = User.objects.create_user(email=f'svc-ev4-{_uid()}@test.local', password='test')
        code, challenge = issue_email_challenge(user=user)
        assert verify_email_challenge(challenge_id=challenge.id, code=code) is True
        assert verify_email_challenge(challenge_id=challenge.id, code=code) is False


class TestRegenerateRecoveryCodes:

    @pytest.mark.django_db
    def test_happy_path(self):
        user = User.objects.create_user(email=f'svc-rr1-{_uid()}@test.local', password='test')
        tenant = Tenant.objects.create(name='Svc RR1', slug=f'svc-rr1-{_uid()}')
        device = MFADevice.objects.create(
            user=user, tenant=tenant, method='totp', verified_at=timezone.now(),
        )
        codes = regenerate_recovery_codes(device=device)
        assert len(codes) == 10
        assert RecoveryCode.objects.filter(device=device).count() == 10

    @pytest.mark.django_db
    def test_replaces_old_codes(self):
        user = User.objects.create_user(email=f'svc-rr2-{_uid()}@test.local', password='test')
        tenant = Tenant.objects.create(name='Svc RR2', slug=f'svc-rr2-{_uid()}')
        device = MFADevice.objects.create(
            user=user, tenant=tenant, method='totp', verified_at=timezone.now(),
        )
        regenerate_recovery_codes(device=device, count=3)
        assert RecoveryCode.objects.filter(device=device).count() == 3
        regenerate_recovery_codes(device=device, count=5)
        assert RecoveryCode.objects.filter(device=device).count() == 5


class TestConsumeRecoveryCode:

    @pytest.mark.django_db
    def test_valid_code(self):
        user = User.objects.create_user(email=f'svc-cr1-{_uid()}@test.local', password='test')
        tenant = Tenant.objects.create(name='Svc CR1', slug=f'svc-cr1-{_uid()}')
        device = MFADevice.objects.create(
            user=user, tenant=tenant, method='totp', verified_at=timezone.now(),
        )
        codes = regenerate_recovery_codes(device=device, count=1)
        assert consume_recovery_code(device=device, code=codes[0]) is True

    @pytest.mark.django_db
    def test_invalid_code(self):
        user = User.objects.create_user(email=f'svc-cr2-{_uid()}@test.local', password='test')
        tenant = Tenant.objects.create(name='Svc CR2', slug=f'svc-cr2-{_uid()}')
        device = MFADevice.objects.create(
            user=user, tenant=tenant, method='totp', verified_at=timezone.now(),
        )
        regenerate_recovery_codes(device=device, count=1)
        assert consume_recovery_code(device=device, code='badcode') is False

    @pytest.mark.django_db
    def test_already_consumed(self):
        user = User.objects.create_user(email=f'svc-cr3-{_uid()}@test.local', password='test')
        tenant = Tenant.objects.create(name='Svc CR3', slug=f'svc-cr3-{_uid()}')
        device = MFADevice.objects.create(
            user=user, tenant=tenant, method='totp', verified_at=timezone.now(),
        )
        codes = regenerate_recovery_codes(device=device, count=1)
        assert consume_recovery_code(device=device, code=codes[0]) is True
        assert consume_recovery_code(device=device, code=codes[0]) is False

    @pytest.mark.django_db
    def test_no_codes_returns_false(self):
        user = User.objects.create_user(email=f'svc-cr4-{_uid()}@test.local', password='test')
        tenant = Tenant.objects.create(name='Svc CR4', slug=f'svc-cr4-{_uid()}')
        device = MFADevice.objects.create(
            user=user, tenant=tenant, method='totp', verified_at=timezone.now(),
        )
        assert consume_recovery_code(device=device, code='anything') is False
