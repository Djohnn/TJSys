"""Sprint 22 — application service tests for product extensions."""

from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError
from django.db import connection

from catalog.models import (
    Category,
    Product,
    ProductFiscalData,
    ProductPriceTier,
    Unit,
)
from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Tenant


def _setup(tenant_name='S22-AS'):
    tenant = Tenant.objects.create(name=tenant_name, slug=tenant_name.lower())
    token = set_current_tenant_id(tenant.id)
    with connection.cursor() as cursor:
        cursor.execute('SET app.current_tenant_id = %s', [str(tenant.id)])
    unit = Unit.objects.create(tenant=tenant, symbol='UN', name='Unidade')
    cat = Category.objects.create(tenant=tenant, name='Cat')
    product = Product.objects.create(tenant=tenant, sku='S22-AS-PROD', name='Test Product', base_unit=unit, category=cat)
    reset_current_tenant_id(token)
    return tenant, product


def _in_tenant(tenant, fn):
    token = set_current_tenant_id(tenant.id)
    with connection.cursor() as cursor:
        cursor.execute('SET app.current_tenant_id = %s', [str(tenant.id)])
    result = fn()
    reset_current_tenant_id(token)
    return result


# =============================================================================
# Fiscal data service
# =============================================================================

from catalog.services.product_extensions import upsert_product_fiscal_data


@pytest.mark.django_db
def test_upsert_fiscal_data_creates_when_not_exists():
    """Given product without fiscal-data, when upsert, then create new record."""
    tenant, product = _setup('S22-AS-FD01')
    data = _in_tenant(tenant, lambda: upsert_product_fiscal_data(
        tenant=tenant, product=product,
        ncm='12345678', origin_code='0', cest='12345',
    ))
    assert data.ncm == '12345678'
    assert data.cest == '12345'
    assert data.origin_code == '0'


@pytest.mark.django_db
def test_upsert_fiscal_data_updates_when_exists():
    """Given product with fiscal-data, when upsert new values, then update."""
    tenant, product = _setup('S22-AS-FD02')
    _in_tenant(tenant, lambda: upsert_product_fiscal_data(
        tenant=tenant, product=product, ncm='11111111', origin_code='0'))
    updated = _in_tenant(tenant, lambda: upsert_product_fiscal_data(
        tenant=tenant, product=product, ncm='22222222', origin_code='1'))
    assert updated.ncm == '22222222'
    assert updated.origin_code == '1'
    assert ProductFiscalData.all_objects.filter(product=product).count() == 1


@pytest.mark.django_db
def test_upsert_fiscal_data_allows_nil_origin():
    """Given empty origin_code, when upsert, then origin_code is ''."""
    tenant, product = _setup('S22-AS-FD03')
    data = _in_tenant(tenant, lambda: upsert_product_fiscal_data(
        tenant=tenant, product=product, ncm='33333333', origin_code='',
    ))
    assert data.origin_code == ''


# =============================================================================
# Price tier service
# =============================================================================

from catalog.services.product_extensions import add_product_price_tier


@pytest.mark.django_db
def test_add_price_tier_creates_for_active_product():
    """Given active product, when adding tier, then persists."""
    tenant, product = _setup('S22-AS-PT01')
    tier = _in_tenant(tenant, lambda: add_product_price_tier(
        tenant=tenant, product=product,
        min_quantity=Decimal('10'), amount=Decimal('9.99'),
    ))
    assert tier.min_quantity == Decimal('10')
    assert tier.amount == Decimal('9.99')


@pytest.mark.django_db
def test_add_price_tier_quantity_below_existing():
    """Given tier at q=10, when adding q=5, then both exist."""
    tenant, product = _setup('S22-AS-PT02')
    _in_tenant(tenant, lambda: add_product_price_tier(
        tenant=tenant, product=product, min_quantity=Decimal('10'), amount=Decimal('9.00')))
    t2 = _in_tenant(tenant, lambda: add_product_price_tier(
        tenant=tenant, product=product, min_quantity=Decimal('5'), amount=Decimal('12.00')))
    assert t2.min_quantity == Decimal('5')
    tiers = ProductPriceTier.all_objects.filter(product=product)
    assert tiers.count() == 2


@pytest.mark.django_db
def test_add_price_tier_rejects_inactive_product():
    """Given inactive product, when adding tier, then ValidationError."""
    tenant, _ = _setup('S22-AS-PT03')
    inactive = _in_tenant(tenant, lambda: Product.objects.create(
        tenant=tenant, sku='INACTIVE', name='Inactive',
        base_unit=Unit.objects.filter(tenant=tenant).first(),
        is_active=False,
    ))
    with pytest.raises(ValidationError):
        _in_tenant(tenant, lambda: add_product_price_tier(
            tenant=tenant, product=inactive,
            min_quantity=Decimal('1'), amount=Decimal('5.00'),
        ))
