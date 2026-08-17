from datetime import timedelta

from django.db import transaction
from django.utils import timezone


def tenant_active_subscription(tenant):
    from platform_admin.models import Subscription

    return (
        Subscription.objects.filter(
            tenant=tenant,
            is_active=True,
        )
        .select_related('plan')
        .first()
    )


def tenant_has_capability(tenant, capability: str) -> bool:
    from platform_admin.models import Subscription, TenantEntitlement

    sub = tenant_active_subscription(tenant)
    if sub is None:
        return False
    if sub.status == Subscription.STATUS_SUSPENDED:
        return False

    entitlement = TenantEntitlement.objects.filter(
        tenant=tenant,
        capability=capability,
    ).first()
    if entitlement is not None:
        return entitlement.is_enabled
    plan_caps = sub.plan.capabilities or {}
    return bool(plan_caps.get(capability, False))


def tenant_limit_for(tenant, limit_name: str) -> int:
    from platform_admin.models import Subscription, TenantEntitlement

    sub = tenant_active_subscription(tenant)
    if sub is None:
        return 0
    if sub.status == Subscription.STATUS_SUSPENDED:
        return 0

    entitlement = TenantEntitlement.objects.filter(
        tenant=tenant,
        capability=limit_name,
    ).first()
    if entitlement is not None and entitlement.limit_value is not None:
        return entitlement.limit_value
    plan_limits = sub.plan.limits or {}
    return plan_limits.get(limit_name, 0)


def is_tenant_suspended(tenant) -> bool:
    from platform_admin.models import Subscription

    sub = tenant_active_subscription(tenant)
    if sub is None:
        return False
    return sub.status == Subscription.STATUS_SUSPENDED


def is_tenant_restricted(tenant) -> bool:
    from platform_admin.models import Subscription

    sub = tenant_active_subscription(tenant)
    if sub is None:
        return True
    return sub.status in {
        Subscription.STATUS_SUSPENDED,
        Subscription.STATUS_CANCELLED,
    }


@transaction.atomic
def suspend_tenant(tenant, reason='', actor=None):
    from platform_admin.models import PlatformAdminAudit, Subscription

    sub = tenant_active_subscription(tenant)
    if sub is None:
        raise ValueError('No active subscription for tenant.')
    if sub.status == Subscription.STATUS_SUSPENDED:
        return sub
    sub.status = Subscription.STATUS_SUSPENDED
    sub.save(update_fields=['status', 'updated_at'])
    PlatformAdminAudit.objects.create(
        actor=actor,
        action='subscription.suspended',
        target_tenant=tenant,
        detail={'reason': reason},
    )
    return sub


@transaction.atomic
def reactivate_tenant(tenant, actor=None):
    from platform_admin.models import PlatformAdminAudit, Subscription

    sub = tenant_active_subscription(tenant)
    if sub is None:
        raise ValueError('No active subscription for tenant.')
    if sub.status != Subscription.STATUS_SUSPENDED:
        raise ValueError('Subscription is not suspended.')
    sub.status = Subscription.STATUS_ACTIVE
    sub.save(update_fields=['status', 'updated_at'])
    PlatformAdminAudit.objects.create(
        actor=actor,
        action='subscription.activated',
        target_tenant=tenant,
    )
    return sub


def get_feature_flag(code: str):
    from platform_admin.models import FeatureFlag

    return FeatureFlag.objects.filter(code=code).first()


def feature_flag_enabled(code: str, tenant_id) -> bool:
    flag = get_feature_flag(code)
    if flag is None:
        return False
    return flag.is_enabled_for(tenant_id)


@transaction.atomic
def set_feature_flag(
    code: str,
    globally_enabled: bool = False,
    rollout_percentage: int = 0,
    actor=None,
    description: str = '',
    tenant_overrides=None,
):
    from platform_admin.models import FeatureFlag, PlatformAdminAudit

    flag, created = FeatureFlag.objects.update_or_create(
        code=code,
        defaults={
            'description': description,
            'is_globally_enabled': globally_enabled,
            'rollout_percentage': rollout_percentage,
            'tenant_overrides': tenant_overrides or {},
        },
    )
    PlatformAdminAudit.objects.create(
        actor=actor,
        action='feature_flag.updated',
        detail={
            'flag_code': code,
            'created': created,
            'globally_enabled': globally_enabled,
            'rollout_percentage': rollout_percentage,
        },
    )
    from outbox.services import create_outbox_message

    create_outbox_message(
        event_type='platform.feature_flag.updated',
        aggregate_type='feature_flag',
        aggregate_id=flag.id,
        payload={'code': code, 'globally_enabled': globally_enabled},
    )
    return flag


@transaction.atomic
def request_support_access(requester, target_tenant, reason: str, expires_at=None):
    from platform_admin.models import SupportAccessRequest

    if expires_at is None:
        expires_at = timezone.now() + timedelta(hours=4)
    return SupportAccessRequest.objects.create(
        requester=requester,
        target_tenant=target_tenant,
        reason=reason,
        expires_at=expires_at,
    )


@transaction.atomic
def approve_support_access(request_id, approver) -> bool:
    from platform_admin.models import PlatformAdminAudit, SupportAccessRequest

    try:
        req = SupportAccessRequest.objects.select_for_update().get(pk=request_id)
    except SupportAccessRequest.DoesNotExist:
        raise ValueError('Support access request not found.') from None

    if req.status != SupportAccessRequest.STATUS_PENDING:
        raise ValueError(f'Request is already {req.status}.')

    if req.expires_at and req.expires_at <= timezone.now():
        req.status = SupportAccessRequest.STATUS_EXPIRED
        req.save(update_fields=['status', 'updated_at'])
        raise ValueError('Support access request has expired.')

    req.status = SupportAccessRequest.STATUS_APPROVED
    req.approved_by = approver
    req.save(update_fields=['status', 'approved_by', 'updated_at'])

    PlatformAdminAudit.objects.create(
        actor=approver,
        action='support_access.granted',
        target_tenant=req.target_tenant,
        detail={
            'request_id': str(request_id),
            'requester_id': str(req.requester.id),
            'reason': req.reason,
            'expires_at': str(req.expires_at),
        },
    )
    return True


@transaction.atomic
def revoke_support_access(request_id, revoker):
    from platform_admin.models import PlatformAdminAudit, SupportAccessRequest

    try:
        req = SupportAccessRequest.objects.select_for_update().get(pk=request_id)
    except SupportAccessRequest.DoesNotExist:
        raise ValueError('Support access request not found.') from None

    if req.status in {SupportAccessRequest.STATUS_EXPIRED, SupportAccessRequest.STATUS_REVOKED}:
        raise ValueError(f'Request is already {req.status}.')

    req.status = SupportAccessRequest.STATUS_REVOKED
    req.revoked_by = revoker
    req.revoked_at = timezone.now()
    req.save(update_fields=['status', 'revoked_by', 'revoked_at', 'updated_at'])

    PlatformAdminAudit.objects.create(
        actor=revoker,
        action='support_access.revoked',
        target_tenant=req.target_tenant,
        detail={
            'request_id': str(request_id),
            'reason': req.reason,
        },
    )
    return True
