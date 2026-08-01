"""Sprint 29 — BDD tests for ProductChannelProfile CRUD API."""

import pytest
from django.contrib.auth import get_user_model
from django.db import connection

from catalog.models import Product, ProductChannelProfile, Unit
from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Tenant, TenantMembership

User = get_user_model()


def _run_in_tenant(tenant, callback):
    token = set_current_tenant_id(tenant.id)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SET app.current_tenant_id = %s', [str(tenant.id)])
        return callback()
    finally:
        reset_current_tenant_id(token)


def _auth_client(client, user, tenant, role='admin'):
    TenantMembership.objects.update_or_create(
        user=user,
        tenant=tenant,
        defaults={'role': role, 'is_active': True},
    )
    client.force_login(user)
    session = client.session
    session['mfa_tenant_id'] = str(tenant.id)
    session['mfa_method'] = 'totp'
    session.save()
    return client


@pytest.fixture
def channel_ctx(client):
    tenant = Tenant.objects.create(name='S29 API', slug='s29-api-channel')
    user = User.objects.create_user(email='s29ch@test.local', password='pass123')
    api_client = _auth_client(client, user, tenant, role='admin')

    def _create():
        unit = Unit.all_objects.create(tenant=tenant, symbol='UN', name='Unidade')
        product = Product.all_objects.create(
            tenant=tenant,
            sku='S29-PROD',
            name='Produto Canal S29',
            base_unit=unit,
        )
        return {
            'tenant': tenant,
            'client': api_client,
            'unit': unit,
            'product': product,
        }

    return _run_in_tenant(tenant, _create)


# ---------------------------------------------------------------------------
# Scenario 1 — Create channel profile (success)
#   Given an existing product
#   When POST /api/v1/catalog/products/{product_pk}/channel-profiles/
#   Then 201 with profile data
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_create_channel_profile(channel_ctx):
    tenant = channel_ctx['tenant']
    client = channel_ctx['client']
    product = channel_ctx['product']

    response = client.post(
        f'/api/v1/catalog/products/{product.id}/channel-profiles/',
        {
            'channel_slug': 'mercadolivre',
            'title': 'Produto no ML',
            'description': 'Descricao para marketplace',
            'list_price': '149.9000',
            'sale_price': '129.9000',
            'weight_grams': 500,
        },
        format='json',
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 201
    data = response.json()
    assert data['channel_slug'] == 'mercadolivre'
    assert data['title'] == 'Produto no ML'
    assert data['status'] == 'draft'
    assert data['product'] == str(product.id)


# ---------------------------------------------------------------------------
# Scenario 2 — List channel profiles for product
#   Given product with 2 profiles
#   When GET /api/v1/catalog/products/{product_pk}/channel-profiles/
#   Then 200 with list
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_list_channel_profiles(channel_ctx):
    tenant = channel_ctx['tenant']
    client = channel_ctx['client']
    product = channel_ctx['product']

    ProductChannelProfile.all_objects.create(
        tenant=tenant,
        product=product,
        channel_slug='mercadolivre',
        title='ML',
        status='draft',
    )
    ProductChannelProfile.all_objects.create(
        tenant=tenant,
        product=product,
        channel_slug='shopee',
        title='Shopee',
        status='ready',
    )

    response = client.get(
        f'/api/v1/catalog/products/{product.id}/channel-profiles/',
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    slugs = {p['channel_slug'] for p in data}
    assert slugs == {'mercadolivre', 'shopee'}


# ---------------------------------------------------------------------------
# Scenario 3 — Update channel profile
#   Given existing profile
#   When PATCH with new title
#   Then 200 with updated data
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_update_channel_profile(channel_ctx):
    tenant = channel_ctx['tenant']
    client = channel_ctx['client']
    product = channel_ctx['product']

    profile = ProductChannelProfile.all_objects.create(
        tenant=tenant,
        product=product,
        channel_slug='magalu',
        title='Original',
        status='draft',
    )

    response = client.patch(
        f'/api/v1/catalog/products/{product.id}/channel-profiles/{profile.channel_slug}/',
        {'title': 'Atualizado Magalu'},
        content_type='application/json',
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 200
    assert response.json()['title'] == 'Atualizado Magalu'


# ---------------------------------------------------------------------------
# Scenario 4 — Unique constraint per (tenant, product, channel_slug)
#   Given existing profile for channel
#   When creating duplicate channel_slug for same product
#   Then 400 / 422
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_duplicate_channel_profile_rejected(channel_ctx):
    tenant = channel_ctx['tenant']
    client = channel_ctx['client']
    product = channel_ctx['product']

    ProductChannelProfile.all_objects.create(
        tenant=tenant,
        product=product,
        channel_slug='amazon',
        status='draft',
    )

    response = client.post(
        f'/api/v1/catalog/products/{product.id}/channel-profiles/',
        {'channel_slug': 'amazon'},
        format='json',
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code in (400, 409, 422)


# ---------------------------------------------------------------------------
# Scenario 5 — Tenant isolation
#   Given profile in tenant_alpha
#   When tenant_beta lists profiles
#   Then empty list
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_channel_profile_tenant_isolation(channel_ctx, client):
    tenant_alpha = channel_ctx['tenant']
    product = channel_ctx['product']

    ProductChannelProfile.all_objects.create(
        tenant=tenant_alpha,
        product=product,
        channel_slug='ml',
        status='draft',
    )

    tenant_beta = Tenant.objects.create(name='S29 Beta', slug='s29-beta-ch')
    user_beta = User.objects.create_user(email='s29beta@test.local', password='pass123')
    beta_client = _auth_client(client, user_beta, tenant_beta, role='admin')
    unit_beta = _run_in_tenant(
        tenant_beta,
        lambda: Unit.all_objects.create(tenant=tenant_beta, symbol='KG', name='Kg'),
    )
    product_beta = _run_in_tenant(
        tenant_beta,
        lambda: Product.all_objects.create(
            tenant=tenant_beta, sku='BETA-SKU', name='Beta', base_unit=unit_beta,
        ),
    )

    response = beta_client.get(
        f'/api/v1/catalog/products/{product_beta.id}/channel-profiles/',
        HTTP_X_TENANT_ID=str(tenant_beta.id),
    )

    assert response.status_code == 200
    assert response.json() == []
