import secrets
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.db import connection, transaction
from django.utils import timezone
from django.utils.text import slugify

from accounts.models import OneTimeToken, SignupIntent
from accounts.security import digest_value, secure_compare
from accounts.services.email_delivery import send_confirmation_email
from accounts.tokens import issue_token
from audit.services import create_audit_record
from outbox.services import create_outbox_message
from platform_admin.models import Plan, Subscription
from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Branch, Company, Tenant, TenantMembership

User = get_user_model()


class InvalidSignupPlan(ValueError):
    pass


class InvalidSignupToken(ValueError):
    pass


def _public_trial_plan(plan_code):
    plan = Plan.objects.filter(
        code=plan_code,
        is_active=True,
        is_public=True,
        trial_days__gt=0,
    ).first()
    if plan is None:
        raise InvalidSignupPlan('Selected plan is unavailable.')
    return plan


def register_organization(
    *,
    email,
    password,
    tenant_name,
    company_name,
    branch_name,
    plan_code,
):
    email = email.strip().casefold()
    if User.objects.filter(email=email).exists():
        return None

    validate_password(password)
    _public_trial_plan(plan_code)

    with transaction.atomic():
        user = User.objects.create_user(email=email, password=password)
        raw_token, token_record = issue_token(
            purpose='email_confirmation',
            user=user,
        )
        intent = SignupIntent.objects.create(
            user=user,
            confirmation_token=token_record,
            tenant_name=tenant_name.strip(),
            company_name=company_name.strip(),
            branch_name=branch_name.strip(),
            plan_code=plan_code,
        )
        create_outbox_message(
            event_type='auth.signup.requested',
            aggregate_type='signup_intent',
            aggregate_id=intent.id,
            payload={'plan_code': plan_code, 'status': SignupIntent.STATUS_PENDING},
            tenant_id='',
        )
        transaction.on_commit(lambda: send_confirmation_email(email, raw_token))
    return user


def _token_parts(raw_token):
    try:
        token_id, secret = raw_token.split('.', 1)
    except (AttributeError, ValueError):
        raise InvalidSignupToken('Invalid or expired token.') from None
    if not secret:
        raise InvalidSignupToken('Invalid or expired token.')
    return token_id, secret


def _tenant_slug(tenant_name):
    base_slug = slugify(tenant_name)[:40] or 'organization'
    slug = base_slug
    while Tenant.objects.filter(slug=slug).exists():
        slug = f'{base_slug[:31]}-{secrets.token_hex(4)}'
    return slug


def confirm_signup(raw_token):
    token_id, secret = _token_parts(raw_token)
    with transaction.atomic():
        try:
            token = (
                OneTimeToken.objects.select_for_update()
                .select_related('user')
                .get(pk=token_id, purpose='email_confirmation')
            )
        except (OneTimeToken.DoesNotExist, ValueError):
            raise InvalidSignupToken('Invalid or expired token.') from None

        try:
            intent = (
                SignupIntent.objects.select_for_update()
                .select_related('user')
                .get(confirmation_token=token)
            )
        except SignupIntent.DoesNotExist:
            raise InvalidSignupToken('Invalid or expired token.') from None
        if intent.status == SignupIntent.STATUS_PROVISIONED:
            return intent
        if not token.is_usable or not secure_compare(
            token.digest,
            digest_value(secret),
        ):
            raise InvalidSignupToken('Invalid or expired token.')

        plan = _public_trial_plan(intent.plan_code)
        user = token.user
        tenant = Tenant.objects.create(
            name=intent.tenant_name,
            slug=_tenant_slug(intent.tenant_name),
        )
        tenant_context = set_current_tenant_id(tenant.id)
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT set_config('app.current_tenant_id', %s, true)",
                    [str(tenant.id)],
                )
            company = Company.objects.create(
                tenant=tenant,
                name=intent.company_name,
            )
            Branch.objects.create(
                tenant=tenant,
                company=company,
                name=intent.branch_name,
            )
        finally:
            reset_current_tenant_id(tenant_context)

        TenantMembership.objects.create(user=user, tenant=tenant, role='admin')
        today = timezone.localdate()
        Subscription.objects.create(
            tenant=tenant,
            plan=plan,
            status=Subscription.STATUS_TRIAL,
            start_date=today,
            end_date=today + timedelta(days=plan.trial_days),
            is_active=True,
        )
        token.consumed_at = timezone.now()
        token.save(update_fields=['consumed_at'])
        user.email_verified_at = timezone.now()
        user.save(update_fields=['email_verified_at'])
        intent.status = SignupIntent.STATUS_PROVISIONED
        intent.provisioned_tenant = tenant
        intent.confirmed_at = timezone.now()
        intent.save(update_fields=['status', 'provisioned_tenant', 'confirmed_at', 'updated_at'])

        create_audit_record(
            actor=user,
            action='auth.email_confirmed',
            resource_type='SignupIntent',
            resource_id=intent.id,
            tenant_id=tenant.id,
        )
        create_outbox_message(
            event_type='tenant.trial.activated',
            aggregate_type='tenant',
            aggregate_id=tenant.id,
            payload={'plan_code': plan.code, 'trial_days': plan.trial_days},
            tenant_id=tenant.id,
        )
        return intent
