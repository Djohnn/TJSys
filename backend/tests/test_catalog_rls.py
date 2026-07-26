from decimal import Decimal

import pytest
from django.db import connection
from django.utils import timezone

from catalog.models import (
    Category,
    Product,
    ProductCode,
    ProductPrice,
    Unit,
)
from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Tenant


def _set_ctx(tenant):
    token = set_current_tenant_id(tenant.id)
    with connection.cursor() as cursor:
        cursor.execute('SET app.current_tenant_id = %s', [str(tenant.id)])
    return token


def _clear_ctx(token):
    reset_current_tenant_id(token)
    with connection.cursor() as cursor:
        cursor.execute('SET app.current_tenant_id = %s', [''])


def _setup_tenant(slug):
    return Tenant.objects.create(name=slug, slug=slug)


def _create_catalog(tenant, sku='PA', symbol='kg'):
    unit = Unit.all_objects.create(
        tenant=tenant,
        symbol=symbol,
        name=symbol.title(),
        precision=3,
    )
    product = Product.all_objects.create(
        tenant=tenant,
        sku=sku,
        name=sku,
        base_unit=unit,
    )
    return unit, product


@pytest.fixture
def tenant_a():
    return _setup_tenant('cata-catalog')


@pytest.fixture
def tenant_b():
    return _setup_tenant('catb-catalog')


@pytest.mark.django_db(transaction=True)
def test_rls_hides_product_from_other_tenant(tenant_a, tenant_b):
    token = _set_ctx(tenant_a)
    try:
        _, product = _create_catalog(tenant_a)
    finally:
        _clear_ctx(token)

    token = _set_ctx(tenant_b)
    try:
        assert Product.all_objects.filter(pk=product.pk).exists() is False
    finally:
        _clear_ctx(token)


@pytest.mark.django_db(transaction=True)
def test_rls_blocks_cross_tenant_product_write(tenant_a, tenant_b):
    token = _set_ctx(tenant_a)
    try:
        _, product = _create_catalog(tenant_a)
    finally:
        _clear_ctx(token)

    token = _set_ctx(tenant_b)
    try:
        product.name = 'Attack'
        with pytest.raises(Exception):
            product.save(update_fields=['name'])
    finally:
        _clear_ctx(token)


@pytest.mark.django_db(transaction=True)
def test_rls_hides_category_from_other_tenant(tenant_a, tenant_b):
    token = _set_ctx(tenant_a)
    try:
        cat = Category.all_objects.create(tenant=tenant_a, name='CatA')
    finally:
        _clear_ctx(token)

    token = _set_ctx(tenant_b)
    try:
        assert Category.all_objects.filter(pk=cat.pk).exists() is False
    finally:
        _clear_ctx(token)


@pytest.mark.django_db(transaction=True)
def test_rls_hides_unit_from_other_tenant(tenant_a, tenant_b):
    token = _set_ctx(tenant_a)
    try:
        unit = Unit.all_objects.create(
            tenant=tenant_a,
            symbol='kg',
            name='Kg',
            precision=3,
        )
    finally:
        _clear_ctx(token)

    token = _set_ctx(tenant_b)
    try:
        assert Unit.all_objects.filter(pk=unit.pk).exists() is False
    finally:
        _clear_ctx(token)


@pytest.mark.django_db(transaction=True)
def test_rls_hides_product_code_from_other_tenant(tenant_a, tenant_b):
    token = _set_ctx(tenant_a)
    try:
        _, product = _create_catalog(tenant_a)
        code = ProductCode.all_objects.create(
            tenant=tenant_a,
            product=product,
            code_type='internal',
            value='COD-A',
            is_active=True,
        )
    finally:
        _clear_ctx(token)

    token = _set_ctx(tenant_b)
    try:
        assert ProductCode.all_objects.filter(pk=code.pk).exists() is False
    finally:
        _clear_ctx(token)


@pytest.mark.django_db(transaction=True)
def test_rls_hides_price_from_other_tenant(tenant_a, tenant_b):
    token = _set_ctx(tenant_a)
    try:
        _, product = _create_catalog(tenant_a)
        price = ProductPrice.all_objects.create(
            tenant=tenant_a,
            product=product,
            amount=Decimal('10.00'),
            valid_from=timezone.now(),
        )
    finally:
        _clear_ctx(token)

    token = _set_ctx(tenant_b)
    try:
        assert ProductPrice.all_objects.filter(pk=price.pk).exists() is False
    finally:
        _clear_ctx(token)


@pytest.mark.django_db(transaction=True)
def test_rls_blocks_cross_tenant_insert(tenant_a, tenant_b):
    token = _set_ctx(tenant_b)
    try:
        with pytest.raises(Exception):
            Unit.all_objects.create(
                tenant=tenant_a,
                symbol='cx',
                name='Caixa',
                precision=0,
            )
    finally:
        _clear_ctx(token)


@pytest.mark.django_db
def test_tenant_manager_denies_without_context(tenant_a):
    token = _set_ctx(tenant_a)
    try:
        Unit.all_objects.create(
            tenant=tenant_a,
            symbol='kg',
            name='Kg',
            precision=3,
        )
    finally:
        _clear_ctx(token)
    assert Unit.objects.count() == 0


@pytest.mark.django_db(transaction=True)
def test_idor_product_from_other_tenant_not_visible(tenant_a, tenant_b):
    token = _set_ctx(tenant_a)
    try:
        _, product = _create_catalog(tenant_a)
    finally:
        _clear_ctx(token)

    token = _set_ctx(tenant_b)
    try:
        assert Product.objects.filter(pk=product.pk).count() == 0
    finally:
        _clear_ctx(token)
