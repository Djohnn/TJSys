import re

import pytest
from django.contrib.auth import get_user_model
from django.core import mail

from tenancy.models import Invitation, Tenant, TenantMembership

User = get_user_model()


@pytest.mark.django_db(transaction=True)
def test_admin_invites_and_matching_user_accepts(client):
    admin = User.objects.create_user(email='admin-invite@test.local', password='test-password')
    invitee = User.objects.create_user(email='invitee@test.local', password='test-password')
    tenant = Tenant.objects.create(name='Invite Tenant', slug='invite-tenant')
    TenantMembership.objects.create(user=admin, tenant=tenant, role='admin')
    client.force_login(admin)
    session = client.session
    session['mfa_tenant_id'] = str(tenant.id)
    session['mfa_method'] = 'totp'
    session.save()
    response = client.post(
        '/api/v1/invitations/',
        {'email': invitee.email, 'role': 'operator'},
        content_type='application/json',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert response.status_code == 201
    invitation = Invitation.objects.get(pk=response.json()['id'])
    assert invitation.token_digest
    old_token = re.search(r'token=([^\s]+)', mail.outbox[-1].body).group(1)
    resent = client.post(
        f'/api/v1/invitations/{invitation.id}/resend/',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert resent.status_code == 202
    token = re.search(r'token=([^\s]+)', mail.outbox[-1].body).group(1)
    client.force_login(invitee)
    assert (
        client.post(
            '/api/v1/invitations/accept/',
            {'token': old_token},
            content_type='application/json',
        ).status_code
        == 400
    )
    accepted = client.post(
        '/api/v1/invitations/accept/',
        {'token': token},
        content_type='application/json',
    )
    assert accepted.status_code == 204
    assert TenantMembership.objects.filter(
        user=invitee,
        tenant=tenant,
        role='operator',
        is_active=True,
    ).exists()
    assert (
        client.post(
            '/api/v1/invitations/accept/',
            {'token': token},
            content_type='application/json',
        ).status_code
        == 400
    )
    client.force_login(admin)
    session = client.session
    session['mfa_tenant_id'] = str(tenant.id)
    session['mfa_method'] = 'totp'
    session.save()
    assert (
        client.post(
            f'/api/v1/invitations/{invitation.id}/resend/',
            HTTP_X_TENANT_ID=str(tenant.id),
        ).status_code
        == 409
    )


@pytest.mark.django_db
def test_operator_cannot_create_invitation(client):
    user = User.objects.create_user(email='operator-invite@test.local', password='test-password')
    tenant = Tenant.objects.create(name='Denied Invite', slug='denied-invite')
    TenantMembership.objects.create(user=user, tenant=tenant, role='operator')
    client.force_login(user)
    response = client.post(
        '/api/v1/invitations/',
        {'email': 'target@test.local', 'role': 'operator'},
        content_type='application/json',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert response.status_code == 403
