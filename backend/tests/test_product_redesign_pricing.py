"""Sprint R4 — BDD acceptance contract for product pricing and margins."""

from datetime import UTC, datetime
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.db import connection

from catalog.models import Product, ProductPrice, Unit
from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Tenant, TenantMembership

User = get_user_model()
FIXED_PRICING_INSTANT = datetime(2026, 1, 1, 12, tzinfo=UTC)


def _run_in_tenant(tenant, callback):
    token = set_current_tenant_id(tenant.id)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'SELECT set_config(%s, %s, true)',
                ['app.current_tenant_id', str(tenant.id)],
            )
        return callback()
    finally:
        reset_current_tenant_id(token)


@pytest.fixture
def r4_pricing_context(client):
    tenant = Tenant.objects.create(name='R4 Pricing', slug='r4-pricing')
    user = User.objects.create_user(email='r4-pricing@test.local', password='pass123')
    TenantMembership.objects.create(
        user=user,
        tenant=tenant,
        role='admin',
        is_active=True,
    )

    def _create_catalog_data():
        unit = Unit.objects.create(
            tenant=tenant,
            symbol='UN',
            name='Unidade',
        )
        product = Product.objects.create(
            tenant=tenant,
            sku='R4-PRICING',
            name='Produto R4',
            base_unit=unit,
        )
        ProductPrice.objects.create(
            tenant=tenant,
            product=product,
            amount=Decimal('100.00'),
            valid_from=FIXED_PRICING_INSTANT,
        )
        return product

    product = _run_in_tenant(tenant, _create_catalog_data)
    client.force_login(user)
    session = client.session
    session['mfa_tenant_id'] = str(tenant.id)
    session['mfa_method'] = 'totp'
    session.save()
    return client, tenant, product


@pytest.mark.django_db
def test_r4_acceptance_contract(r4_pricing_context):
    # Given an authenticated tenant and valid sprint fixture
    api_client, tenant, product = r4_pricing_context

    # When the canonical contract is requested
    response = api_client.get(
        f'/api/v1/catalog/products/{product.id}/prices/',
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    # Then the vertical invariant is observable
    assert response.status_code in {200, 201}
    assert response.json()['retail_margin'] == '25.00'


@pytest.mark.django_db
def test_r4_acceptance_contract_isolates_tenant(r4_pricing_context):
    """Given tenant B's product, tenant A cannot retrieve it by identifier."""
    # Given an authenticated tenant A and a product owned by tenant B
    api_client, tenant_a, _ = r4_pricing_context
    tenant_b = Tenant.objects.create(name='R4 Other Pricing', slug='r4-other-pricing')

    def _create_tenant_b_product():
        unit_b = Unit.objects.create(
            tenant=tenant_b,
            symbol='UN',
            name='Unidade B',
        )
        product_b = Product.objects.create(
            tenant=tenant_b,
            sku='R4-PRICING-B',
            name='Produto R4 B',
            base_unit=unit_b,
        )
        ProductPrice.objects.create(
            tenant=tenant_b,
            product=product_b,
            amount=Decimal('80.00'),
            valid_from=FIXED_PRICING_INSTANT,
        )
        return product_b

    product_b = _run_in_tenant(tenant_b, _create_tenant_b_product)

    # When tenant A requests tenant B's prices
    response = api_client.get(
        f'/api/v1/catalog/products/{product_b.id}/prices/',
        HTTP_X_TENANT_ID=str(tenant_a.id),
    )

    # Then tenant isolation does not expose tenant B's price
    assert response.status_code == 200
    payload = response.json()
    results = payload.get('results', payload) if isinstance(payload, dict) else payload
    assert isinstance(results, list)
    assert results == []
