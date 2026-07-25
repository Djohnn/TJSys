"""Sprint 22 — unit tests for Product extensions + fiscal-data + price-tier."""

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


def _setup_tenant_and_base():
    tenant = Tenant.objects.create(name='S22 Cat', slug='s22-cat')
    token = set_current_tenant_id(tenant.id)
    with connection.cursor() as cursor:
        cursor.execute('SET app.current_tenant_id = %s', [str(tenant.id)])
    unit = Unit.objects.create(tenant=tenant, symbol='UN', name='Unidade')
    category = Category.objects.create(tenant=tenant, name='Categoria S22')
    reset_current_tenant_id(token)
    return tenant, unit, category


def _in_tenant(tenant, fn):
    token = set_current_tenant_id(tenant.id)
    with connection.cursor() as cursor:
        cursor.execute('SET app.current_tenant_id = %s', [str(tenant.id)])
    result = fn()
    reset_current_tenant_id(token)
    return result


# =============================================================================
# Product new fields (D1, D4, D5)
# =============================================================================

@pytest.mark.django_db
def test_product_new_fields_optional_and_default():
    tenant, unit, category = _setup_tenant_and_base()
    product = _in_tenant(tenant, lambda: Product.objects.create(
        tenant=tenant, sku='S22-001', name='Sem extras', base_unit=unit, category=category,
    ))
    assert product.product_kind == ''
    assert product.tracks_inventory is True
    assert product.brand == ''
    assert product.model == ''
    assert product.tags == []
    assert product.scale_code == ''


@pytest.mark.django_db
def test_product_new_fields_persist():
    tenant, unit, category = _setup_tenant_and_base()
    product = _in_tenant(tenant, lambda: Product.objects.create(
        tenant=tenant, sku='S22-002', name='Com extras', base_unit=unit, category=category,
        product_kind='atacado', tracks_inventory=False,
        brand='Acme', model='Pro-X1', tags=['promo', 'liquida'], scale_code='00012345',
    ))
    product.refresh_from_db()
    assert product.product_kind == 'atacado'
    assert product.tracks_inventory is False
    assert product.brand == 'Acme'
    assert product.model == 'Pro-X1'
    assert sorted(product.tags) == ['liquida', 'promo']
    assert product.scale_code == '00012345'


# =============================================================================
# ProductFiscalData (D3)
# =============================================================================

@pytest.mark.django_db
def test_product_fiscal_data_unique_per_product():
    tenant, unit, category = _setup_tenant_and_base()
    p1 = _in_tenant(tenant, lambda: Product.objects.create(
        tenant=tenant, sku='S22-010', name='P1', base_unit=unit, category=category))
    p2 = _in_tenant(tenant, lambda: Product.objects.create(
        tenant=tenant, sku='S22-011', name='P2', base_unit=unit, category=category))
    fd1 = _in_tenant(tenant, lambda: ProductFiscalData.objects.create(
        tenant=tenant, product=p1, ncm='12345678', origin_code='0'))
    fd2 = _in_tenant(tenant, lambda: ProductFiscalData.objects.create(
        tenant=tenant, product=p2, ncm='87654321', origin_code='1'))
    assert fd1.product_id == p1.id
    assert fd2.product_id == p2.id
    assert fd1.ncm == '12345678'
    assert fd2.ncm == '87654321'


@pytest.mark.django_db
def test_product_fiscal_data_one_per_product_uniqueness():
    tenant, unit, category = _setup_tenant_and_base()
    p = _in_tenant(tenant, lambda: Product.objects.create(
        tenant=tenant, sku='S22-020', name='P20', base_unit=unit, category=category))
    _in_tenant(tenant, lambda: ProductFiscalData.objects.create(
        tenant=tenant, product=p, ncm='11111111'))
    with pytest.raises(Exception):
        _in_tenant(tenant, lambda: ProductFiscalData.objects.create(
            tenant=tenant, product=p, ncm='22222222'))


@pytest.mark.django_db
def test_product_fiscal_data_origin_code_range():
    tenant, unit, category = _setup_tenant_and_base()
    p = _in_tenant(tenant, lambda: Product.objects.create(
        tenant=tenant, sku='S22-021', name='P21', base_unit=unit, category=category))
    fd = _in_tenant(tenant, lambda: ProductFiscalData.objects.create(
        tenant=tenant, product=p, ncm='33333333', origin_code='5'))
    assert fd.origin_code == '5'


# =============================================================================
# ProductPriceTier (D2)
# =============================================================================

@pytest.mark.django_db
def test_product_price_tier_min_quantity_must_be_positive():
    tenant, unit, category = _setup_tenant_and_base()
    p = _in_tenant(tenant, lambda: Product.objects.create(
        tenant=tenant, sku='S22-030', name='P30', base_unit=unit, category=category))
    tier = ProductPriceTier(tenant=tenant, product=p, min_quantity=Decimal('0'), amount=Decimal('10.00'))
    with pytest.raises(ValidationError):
        tier.full_clean()


@pytest.mark.django_db
def test_product_price_tier_basic_create_and_lookup():
    tenant, unit, category = _setup_tenant_and_base()
    p = _in_tenant(tenant, lambda: Product.objects.create(
        tenant=tenant, sku='S22-031', name='P31', base_unit=unit, category=category))
    tier = _in_tenant(tenant, lambda: ProductPriceTier.objects.create(
        tenant=tenant, product=p, min_quantity=Decimal('10'), amount=Decimal('9.00')))
    tier.refresh_from_db()
    assert tier.min_quantity == Decimal('10')
    assert tier.amount == Decimal('9.00')


@pytest.mark.django_db
def test_inactive_product_rejects_new_price_tier():
    tenant, unit, category = _setup_tenant_and_base()
    p = _in_tenant(tenant, lambda: Product.objects.create(
        tenant=tenant, sku='S22-032', name='P32', base_unit=unit, category=category, is_active=False))
    tier = ProductPriceTier(tenant=tenant, product=p, min_quantity=Decimal('5'), amount=Decimal('7.50'))
    with pytest.raises(ValidationError):
        tier.full_clean()
