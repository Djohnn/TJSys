import secrets
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from accounts.security import digest_value, secure_compare
from accounts.services.email_delivery import send_invitation_email
from tenancy.models import Invitation, TenantMembership


def create_invitation(*, tenant, invited_by, email, role, branches=()):
    email = email.strip().casefold()
    secret = secrets.token_urlsafe(32)
    with transaction.atomic():
        invitation = Invitation.objects.create(
            tenant=tenant,
            invited_by=invited_by,
            email=email,
            role=role,
            token_digest=digest_value(secret),
            expires_at=timezone.now() + timedelta(days=7),
        )
        if branches:
            invitation.branches.set(branches)
        raw = f'{invitation.id}.{secret}'
        transaction.on_commit(lambda: send_invitation_email(email, raw))
    return invitation


def accept_invitation(*, raw, user):
    try:
        invitation_id, secret = raw.split('.', 1)
    except (AttributeError, ValueError):
        return None
    with transaction.atomic():
        try:
            invitation = Invitation.objects.select_for_update().get(pk=invitation_id)
        except (Invitation.DoesNotExist, ValueError):
            return None
        if (
            invitation.accepted_at is not None
            or invitation.expires_at <= timezone.now()
            or invitation.email != user.email.strip().casefold()
            or not secure_compare(invitation.token_digest, digest_value(secret))
        ):
            return None
        membership, _ = TenantMembership.objects.update_or_create(
            user=user,
            tenant=invitation.tenant,
            defaults={'role': invitation.role, 'is_active': True},
        )
        invitation.accepted_at = timezone.now()
        invitation.save(update_fields=['accepted_at'])
        for branch in invitation.branches.all():
            membership.user.user_branches.get_or_create(branch=branch)
        return invitation


def resend_invitation(invitation):
    with transaction.atomic():
        invitation = Invitation.objects.select_for_update().get(pk=invitation.pk)
        if invitation.accepted_at is not None:
            raise ValueError('Accepted invitations cannot be resent.')
        secret = secrets.token_urlsafe(32)
        invitation.token_digest = digest_value(secret)
        invitation.expires_at = timezone.now() + timedelta(days=7)
        invitation.save(update_fields=['token_digest', 'expires_at'])
        raw = f'{invitation.id}.{secret}'
        transaction.on_commit(lambda: send_invitation_email(invitation.email, raw))
    return invitation
