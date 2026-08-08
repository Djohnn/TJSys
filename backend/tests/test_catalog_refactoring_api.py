"""Sprint 22: BDD tests for catalog API extensions.

Scenarios for Product new fields, ProductFiscalData (1:1),
and ProductPriceTier nested endpoints.
"""

import json
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.utils import timezone

from catalog.models import (
    Category,
    Product,
    ProductFiscalData,
    ProductPrice,
    ProductPriceTier,
    Unit,
)
from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Branch, Company, Tenant, TenantMembership

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
def catalog_context(client):
    """Fixture: tenant + user + products + branch + price.

    Returns dict with tenant, client, product, product2, branch, price.
    """
    tenant = Tenant.objects.create(name='S22 Cat API', slug='s22-cat-api')
    user = User.objects.create_user(email='s22cat@test.local', password='pass123')
    api_client = _auth_client(client, user, tenant, role='admin')

    def _create():
        unit = Unit.all_objects.create(tenant=tenant, symbol='UN', name='Unidade')
        cat = Category.all_objects.create(tenant=tenant, name='Cat API')
        product = Product.all_objects.create(
            tenant=tenant,
            sku='S22-CAT-API',
            name='Test',
            base_unit=unit,
            category=cat,
        )
        product2 = Product.all_objects.create(
            tenant=tenant,
            sku='S22-CAT-API2',
            name='Test2',
            base_unit=unit,
            category=cat,
        )
        company = Company.all_objects.create(tenant=tenant, name='Co')
        branch = Branch.all_objects.create(
            tenant=tenant,
            company=company,
            name='Br',
        )
        price = ProductPrice.all_objects.create(
            tenant=tenant,
            product=product,
            amount=Decimal('10.00'),
            valid_from=timezone.now(),
        )
        return {
            'tenant': tenant,
            'client': api_client,
            'product': product,
            'product2': product2,
            'branch': branch,
            'price': price,
        }

    return _run_in_tenant(tenant, _create)


# ---------------------------------------------------------------------------
# Scenario 1 — PATCH product with new Sprint-22 fields
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_patch_product_new_fields(catalog_context):
    """Given an existing product, when PATCH with product_kind, brand, model,
    tags, scale_code, tracks_inventory, then 200 and fields persisted.
    """
    ctx = catalog_context
    payload = {
        'product_kind': 'revenda',
        'brand': 'Marca X',
        'model': 'Modelo Y',
        'tags': ['teste', 'sprint22'],
        'scale_code': 'SC001',
        'tracks_inventory': False,
    }
    import json

    response = ctx['client'].patch(
        f'/api/v1/products/{ctx["product"].id}/',
        data=json.dumps(payload),
        content_type='application/json',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200, response.json()
    data = response.json()
    assert data['product_kind'] == 'revenda'
    assert data['brand'] == 'Marca X'
    assert data['model'] == 'Modelo Y'
    assert data['tags'] == ['teste', 'sprint22']
    assert data['scale_code'] == 'SC001'
    assert data['tracks_inventory'] is False

    # Confirm persistence via DB
    product = _run_in_tenant(ctx['tenant'], lambda: Product.all_objects.get(id=ctx['product'].id))
    assert product.product_kind == 'revenda'
    assert product.brand == 'Marca X'
    assert product.tags == ['teste', 'sprint22']


# ---------------------------------------------------------------------------
# Scenario 2 — GET product detail includes new fields
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_product_new_fields_in_detail_response(catalog_context):
    """Given a product with new fields set, when GET detail, then 200 and
    new fields present in response.
    """
    ctx = catalog_context
    _run_in_tenant(
        ctx['tenant'],
        lambda: Product.all_objects.filter(
            id=ctx['product'].id,
        ).update(product_kind='servico', brand='B', model='M', scale_code='SC'),
    )

    response = ctx['client'].get(
        f'/api/v1/products/{ctx["product"].id}/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    data = response.json()
    assert data['product_kind'] == 'servico'
    assert data['brand'] == 'B'
    assert data['model'] == 'M'
    assert data['scale_code'] == 'SC'
    assert data['tracks_inventory'] is True  # default
    assert data['tags'] == []  # default


# ---------------------------------------------------------------------------
# Scenario 3 — Old product without new fields returns defaults
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_product_old_without_new_fields_still_works(catalog_context):
    """Given an old product with no new fields, when GET, then 200 and
    new fields have their default values.
    """
    ctx = catalog_context
    response = ctx['client'].get(
        f'/api/v1/products/{ctx["product"].id}/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    data = response.json()
    assert data['product_kind'] == ''
    assert data['brand'] == ''
    assert data['model'] == ''
    assert data['tags'] == []
    assert data['scale_code'] == ''
    assert data['tracks_inventory'] is True


# ---------------------------------------------------------------------------
# Scenario 4 — Create fiscal data for a product
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_create_fiscal_data(catalog_context):
    """Given a product with no fiscal data, when POST fiscal-data,
    then 201, fields persisted and product FK is correct.
    """
    ctx = catalog_context
    payload = {
        'fiscal_type': 'revenda',
        'ncm': '12345678',
        'cest': '1234567890',
        'origin_code': '1',
        'fiscal_class': 'A',
        'is_active': True,
    }
    response = ctx['client'].post(
        f'/api/v1/products/{ctx["product"].id}/fiscal-data/',
        payload,
        format='json',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 201, response.json()
    data = response.json()
    assert data['fiscal_type'] == 'revenda'
    assert data['ncm'] == '12345678'
    assert data['product'] == str(ctx['product'].id)

    fd = _run_in_tenant(
        ctx['tenant'],
        lambda: ProductFiscalData.all_objects.filter(product=ctx['product']).first(),
    )
    assert fd is not None
    assert fd.ncm == '12345678'
    assert fd.origin_code == '1'


# ---------------------------------------------------------------------------
# Scenario 5 — Upsert fiscal data (POST twice updates existing)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_upsert_fiscal_data(catalog_context):
    """Given product with existing fiscal data, when POST fiscal-data again,
    then 200 and record updated (not duplicated).
    """
    ctx = catalog_context
    # First POST — create
    payload1 = {
        'product': str(ctx['product'].id),
        'fiscal_type': 'revenda',
        'ncm': '11111111',
        'origin_code': '0',
    }
    r1 = ctx['client'].post(
        f'/api/v1/products/{ctx["product"].id}/fiscal-data/',
        payload1,
        format='json',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert r1.status_code == 201

    # Second POST — upsert (update)
    payload2 = {
        'product': str(ctx['product'].id),
        'fiscal_type': 'uso_consumo',
        'ncm': '22222222',
        'cest': '9876543210',
        'origin_code': '3',
    }
    r2 = ctx['client'].post(
        f'/api/v1/products/{ctx["product"].id}/fiscal-data/',
        payload2,
        format='json',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert r2.status_code == 200

    data = r2.json()
    assert data['fiscal_type'] == 'uso_consumo'
    assert data['ncm'] == '22222222'

    # Only one record
    count = _run_in_tenant(
        ctx['tenant'],
        lambda: ProductFiscalData.all_objects.filter(product=ctx['product']).count(),
    )
    assert count == 1


# ---------------------------------------------------------------------------
# Scenario 6 — GET fiscal data
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_get_fiscal_data(catalog_context):
    """Given product with fiscal data, when GET fiscal-data, then 200 and
    returns the fiscal data record.
    """
    ctx = catalog_context
    # Seed fiscal data
    _run_in_tenant(
        ctx['tenant'],
        lambda: ProductFiscalData.all_objects.create(
            tenant=ctx['tenant'],
            product=ctx['product'],
            fiscal_type='revenda',
            ncm='33333333',
            origin_code='0',
        ),
    )

    response = ctx['client'].get(
        f'/api/v1/products/{ctx["product"].id}/fiscal-data/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    data = response.json()
    assert data['ncm'] == '33333333'
    assert data['product'] == str(ctx['product'].id)


# ---------------------------------------------------------------------------
# Scenario 7 — Cross-tenant fiscal data returns 404
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_fiscal_data_cross_tenant_404(catalog_context):
    """Given fiscal data in tenant B, when GET from tenant A, then 404."""
    ctx = catalog_context
    other = Tenant.objects.create(name='S22 Other', slug='s22-other')

    def _seed_other():
        unit = Unit.all_objects.create(tenant=other, symbol='UN', name='U')
        cat = Category.all_objects.create(tenant=other, name='C')
        prod = Product.all_objects.create(
            tenant=other,
            sku='OTHER',
            name='Other',
            base_unit=unit,
            category=cat,
        )
        ProductFiscalData.all_objects.create(
            tenant=other,
            product=prod,
            fiscal_type='revenda',
            ncm='99999999',
            origin_code='0',
        )
        return prod

    other_product = _run_in_tenant(other, _seed_other)

    # Try to access other-product's fiscal-data while authenticated in ctx tenant
    response = ctx['client'].get(
        f'/api/v1/products/{other_product.id}/fiscal-data/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Scenario 8 — Create price tier
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_create_price_tier(catalog_context):
    """Given an active product, when POST price-tiers, then 201
    and tier is persisted.
    """
    ctx = catalog_context
    payload = {
        'min_quantity': '5',
        'amount': '8.50',
    }
    response = ctx['client'].post(
        f'/api/v1/products/{ctx["product"].id}/price-tiers/',
        payload,
        format='json',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 201, response.json()
    data = response.json()
    assert data['min_quantity'] == '5.000000'
    assert data['amount'] == '8.5000'
    assert data['product'] == str(ctx['product'].id)

    tier = _run_in_tenant(
        ctx['tenant'],
        lambda: ProductPriceTier.all_objects.filter(
            product=ctx['product'],
            min_quantity=Decimal('5'),
        ).first(),
    )
    assert tier is not None
    assert tier.amount == Decimal('8.50')


# ---------------------------------------------------------------------------
# Scenario 9 — List price tiers
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_list_price_tiers(catalog_context):
    """Given product with multiple price tiers, when GET price-tiers,
    then 200 and returns an array.
    """
    ctx = catalog_context
    _run_in_tenant(
        ctx['tenant'],
        lambda: (
            ProductPriceTier.all_objects.create(
                tenant=ctx['tenant'],
                product=ctx['product'],
                min_quantity=Decimal('10'),
                amount=Decimal('9.00'),
            ),
            ProductPriceTier.all_objects.create(
                tenant=ctx['tenant'],
                product=ctx['product'],
                min_quantity=Decimal('20'),
                amount=Decimal('7.50'),
            ),
        ),
    )

    response = ctx['client'].get(
        f'/api/v1/products/{ctx["product"].id}/price-tiers/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    data = response.json()
    # CatalogViewSetBase uses CursorPagination
    results = data.get('results', data)
    assert isinstance(results, list)
    assert len(results) >= 2
    quantities = [item['min_quantity'] for item in results]
    assert '10.000000' in quantities
    assert '20.000000' in quantities


# ---------------------------------------------------------------------------
# Scenario 10 — Delete price tier
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_delete_price_tier(catalog_context):
    """Given a price tier, when DELETE, then 204 and tier is deactivated."""
    ctx = catalog_context
    tier = _run_in_tenant(
        ctx['tenant'],
        lambda: ProductPriceTier.all_objects.create(
            tenant=ctx['tenant'],
            product=ctx['product'],
            min_quantity=Decimal('3'),
            amount=Decimal('12.00'),
        ),
    )

    response = ctx['client'].delete(
        f'/api/v1/products/{ctx["product"].id}/price-tiers/{tier.id}/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 204

    # Confirm deactivated
    still_active = _run_in_tenant(
        ctx['tenant'],
        lambda: ProductPriceTier.all_objects.filter(
            id=tier.id,
            is_active=True,
        ).exists(),
    )
    assert not still_active


# ---------------------------------------------------------------------------
# Scenario 11 — Price tier with same min_quantity returns error
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_price_tier_min_quantity_unique(catalog_context):
    """Given a tier with min_quantity=5, when POST another tier with same
    min_quantity, then 400 (unique constraint).
    """
    ctx = catalog_context
    _run_in_tenant(
        ctx['tenant'],
        lambda: ProductPriceTier.all_objects.create(
            tenant=ctx['tenant'],
            product=ctx['product'],
            min_quantity=Decimal('5'),
            amount=Decimal('8.00'),
        ),
    )

    response = ctx['client'].post(
        f'/api/v1/products/{ctx["product"].id}/price-tiers/',
        {
            'product': str(ctx['product'].id),
            'min_quantity': '5',
            'amount': '9.00',
        },
        format='json',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_product_price_create_defaults_valid_from_and_patch_requires_version(catalog_context):
    ctx = catalog_context
    product_id = ctx['product2'].id
    response = ctx['client'].post(
        f'/api/v1/products/{product_id}/prices/',
        {'amount': '11.00'},
        format='json',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 201, response.json()
    created = response.json()
    assert created['amount'] == '11.0000'
    assert created['valid_from']

    price = _run_in_tenant(
        ctx['tenant'],
        lambda: ProductPrice.all_objects.filter(id=created['id']).get(),
    )
    stale = ctx['client'].patch(
        f'/api/v1/products/{product_id}/prices/{price.id}/',
        json.dumps({'amount': '12.00'}),
        content_type='application/json',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
        HTTP_IF_MATCH='0',
    )
    assert stale.status_code == 409

    updated = ctx['client'].patch(
        f'/api/v1/products/{product_id}/prices/{price.id}/',
        json.dumps({'amount': '12.00'}),
        content_type='application/json',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
        HTTP_IF_MATCH=str(price.version),
    )
    assert updated.status_code == 200, updated.json()
    assert updated.json()['version'] == price.version + 1


@pytest.mark.django_db
def test_product_serializer_returns_no_price_for_zero_or_ambiguous_base_prices(catalog_context):
    ctx = catalog_context
    # Remove the fixture base price: an optional tier must not masquerade as
    # Product.price in the PDV/search contract.
    _run_in_tenant(
        ctx['tenant'],
        lambda: ProductPrice.all_objects.filter(product=ctx['product']).delete(),
    )
    _run_in_tenant(
        ctx['tenant'],
        lambda: ProductPriceTier.all_objects.create(
            tenant=ctx['tenant'],
            product=ctx['product'],
            min_quantity=Decimal('1'),
            amount=Decimal('8.00'),
        ),
    )
    response = ctx['client'].get(
        f'/api/v1/products/{ctx["product"].id}/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    assert response.json()['price'] is None

    def _ambiguous():
        ProductPrice.all_objects.create(
            tenant=ctx['tenant'],
            product=ctx['product'],
            amount=Decimal('10.00'),
            valid_from=timezone.now(),
        )
        ProductPrice.all_objects.create(
            tenant=ctx['tenant'],
            product=ctx['product'],
            amount=Decimal('11.00'),
            valid_from=timezone.now(),
        )
    _run_in_tenant(ctx['tenant'], _ambiguous)
    response = ctx['client'].get(
        f'/api/v1/products/{ctx["product"].id}/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    assert response.json()['price'] is None


@pytest.mark.django_db
def test_price_tier_rejects_base_price_from_another_product_or_inactive(catalog_context):
    ctx = catalog_context
    other_price = _run_in_tenant(
        ctx['tenant'],
        lambda: ProductPrice.all_objects.create(
            tenant=ctx['tenant'],
            product=ctx['product2'],
            amount=Decimal('5.00'),
            valid_from=timezone.now(),
        ),
    )
    wrong_product = ctx['client'].post(
        f'/api/v1/products/{ctx["product"].id}/price-tiers/',
        {'price': str(other_price.id), 'min_quantity': '5', 'amount': '4.00'},
        format='json',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert wrong_product.status_code == 400

    inactive_price = _run_in_tenant(
        ctx['tenant'],
        lambda: ProductPrice.all_objects.create(
            tenant=ctx['tenant'],
            product=ctx['product'],
            amount=Decimal('6.00'),
            valid_from=timezone.now(),
            is_active=False,
        ),
    )
    inactive = ctx['client'].post(
        f'/api/v1/products/{ctx["product"].id}/price-tiers/',
        {'price': str(inactive_price.id), 'min_quantity': '6', 'amount': '4.00'},
        format='json',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert inactive.status_code == 400

# ---------------------------------------------------------------------------
# Scenario 12 — Inactive product rejects price tier creation
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_inactive_product_rejects_tier(catalog_context):
    """Given an inactive product, when POST price-tiers, then 400."""
    ctx = catalog_context
    _run_in_tenant(
        ctx['tenant'],
        lambda: Product.all_objects.filter(
            id=ctx['product'].id,
        ).update(is_active=False),
    )

    response = ctx['client'].post(
        f'/api/v1/products/{ctx["product"].id}/price-tiers/',
        {
            'product': str(ctx['product'].id),
            'min_quantity': '1',
            'amount': '5.00',
        },
        format='json',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 400
