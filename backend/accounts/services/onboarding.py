import uuid

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.db import connection, transaction
from django.utils.text import slugify

from accounts.services.email_delivery import send_confirmation_email
from accounts.tokens import issue_token
from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Branch, Company, Tenant, TenantMembership

User = get_user_model()


def register_organization(*, email, password, tenant_name, company_name, branch_name):
    email = email.strip().casefold()
    if User.objects.filter(email=email).exists():
        return None
    validate_password(password)
    with transaction.atomic():
        user = User.objects.create_user(email=email, password=password)
        base_slug = slugify(tenant_name)[:40] or 'organization'
        slug = base_slug
        if Tenant.objects.filter(slug=slug).exists():
            slug = f'{base_slug}-{uuid.uuid4().hex[:8]}'
        tenant = Tenant.objects.create(name=tenant_name.strip(), slug=slug)
        token = set_current_tenant_id(tenant.id)
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT set_config('app.current_tenant_id', %s, true)",
                    [str(tenant.id)],
                )
            company = Company.objects.create(tenant=tenant, name=company_name.strip())
            Branch.objects.create(tenant=tenant, company=company, name=branch_name.strip())
        finally:
            reset_current_tenant_id(token)
        TenantMembership.objects.create(user=user, tenant=tenant, role='admin')
        raw_token, _ = issue_token(purpose='email_confirmation', user=user)
        transaction.on_commit(lambda: send_confirmation_email(email, raw_token))
    return user
