"""Sprint 18: Web API contracts — catalog, inventory, purchasing.

Given/When/Then BDD scenarios for web-based catalog, inventory and purchasing management.
"""

from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.utils import timezone

from catalog.models import Category, Product, ProductPrice, Unit
from inventory.models import StockLocation
from inventory.services import create_receipt
from purchasing.services import auto_onboard_supplier
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
def web_catalog_context(client):
    tenant = Tenant.objects.create(name='Web Catalog', slug='web-catalog')
    user = User.objects.create_user(email='web-catalog@test.local', password='pass123')
    api_client = _auth_client(client, user, tenant, role='admin')

    def _create():
        company = Company.all_objects.create(tenant=tenant, name='Empresa Catálogo')
        branch = Branch.all_objects.create(tenant=tenant, company=company, name='Filial Catálogo')
        unit = Unit.all_objects.create(tenant=tenant, symbol='UN', name='Unidade', precision=0)
        cat = Category.all_objects.create(tenant=tenant, name='Categoria Teste')
        product = Product.all_objects.create(
            tenant=tenant,
            sku='CAT-PROD',
            name='Produto Catálogo',
            base_unit=unit,
            category=cat,
            ncm='84713000',
            is_active=True,
        )
        ProductPrice.all_objects.create(
            tenant=tenant,
            product=product,
            amount=Decimal('15.50'),
            valid_from=timezone.now(),
        )
        product2 = Product.all_objects.create(
            tenant=tenant,
            sku='CAT-PROD-2',
            name='Segundo Produto',
            base_unit=unit,
            ncm='84713000',
            is_active=True,
        )
        location = StockLocation.all_objects.create(
            tenant=tenant,
            branch=branch,
            code='CAT-LOC',
            name='Local Catálogo',
            is_primary=True,
        )
        create_receipt(
            tenant=tenant,
            branch=branch,
            product=product,
            location=location,
            quantity=Decimal('50'),
            unit=unit,
            factor=Decimal('1'),
            idempotency_key='catalog-stock',
            actor=user,
            reason='seed',
        )
        supplier = auto_onboard_supplier(
            tenant=tenant,
            cnpj='12345678000199',
            name='Fornecedor Catálogo',
        )

        return {
            'tenant': tenant,
            'client': api_client,
            'user': user,
            'branch': branch,
            'unit': unit,
            'category': cat,
            'product': product,
            'product2': product2,
            'location': location,
            'supplier': supplier,
        }

    return _run_in_tenant(tenant, _create)


# =============================================================================
# Catalog — products
# =============================================================================


@pytest.mark.django_db
def test_catalog_product_list_paginated(web_catalog_context):
    ctx = web_catalog_context
    response = ctx['client'].get(
        '/api/v1/catalog/products/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    data = response.json()
    assert 'next' in data and 'previous' in data and 'results' in data
    assert len(data['results']) >= 1


@pytest.mark.django_db
def test_catalog_product_detail(web_catalog_context):
    ctx = web_catalog_context
    response = ctx['client'].get(
        f'/api/v1/catalog/products/{ctx["product"].id}/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    data = response.json()
    assert data['sku'] == 'CAT-PROD'
    assert data['name'] == 'Produto Catálogo'


@pytest.mark.django_db
def test_catalog_product_search(web_catalog_context):
    ctx = web_catalog_context
    response = ctx['client'].get(
        '/api/v1/catalog/products/?search=Catálogo',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    assert len(response.json()['results']) >= 1


# =============================================================================
# Catalog — categories
# =============================================================================


@pytest.mark.django_db
def test_catalog_category_list(web_catalog_context):
    ctx = web_catalog_context
    response = ctx['client'].get(
        '/api/v1/catalog/categories/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    data = response.json()
    assert 'results' in data
    assert len(data['results']) >= 1


@pytest.mark.django_db
def test_catalog_category_create(web_catalog_context):
    ctx = web_catalog_context
    response = ctx['client'].post(
        '/api/v1/catalog/categories/',
        {'name': 'Nova Categoria'},
        content_type='application/json',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 201
    assert response.json()['name'] == 'Nova Categoria'


# =============================================================================
# Catalog — units
# =============================================================================


@pytest.mark.django_db
def test_catalog_unit_list(web_catalog_context):
    ctx = web_catalog_context
    response = ctx['client'].get(
        '/api/v1/catalog/units/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    data = response.json()
    assert 'results' in data
    assert len(data['results']) >= 1


# =============================================================================
# Inventory — balances
# =============================================================================


@pytest.mark.django_db
def test_inventory_balance_list(web_catalog_context):
    ctx = web_catalog_context
    response = ctx['client'].get(
        '/api/v1/inventory/balances/?branch=' + str(ctx['branch'].id),
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    data = response.json()
    assert 'results' in data
    assert len(data['results']) > 0


@pytest.mark.django_db
def test_inventory_movements_list(web_catalog_context):
    ctx = web_catalog_context
    response = ctx['client'].get(
        '/api/v1/inventory/movements/?branch=' + str(ctx['branch'].id),
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    assert 'results' in response.json()


# =============================================================================
# Purchasing — suppliers
# =============================================================================


@pytest.mark.django_db
def test_purchasing_supplier_list(web_catalog_context):
    ctx = web_catalog_context
    response = ctx['client'].get(
        '/api/v1/purchasing/suppliers/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    data = response.json()
    assert data['count'] >= 1


@pytest.mark.django_db
def test_purchasing_supplier_create(web_catalog_context):
    ctx = web_catalog_context
    response = ctx['client'].post(
        '/api/v1/purchasing/suppliers/',
        {'name': 'Novo Fornecedor', 'cnpj_cpf': '11111111111111'},
        content_type='application/json',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code in (201, 200)


# =============================================================================
# Purchasing — purchase orders
# =============================================================================


@pytest.mark.django_db
def test_purchasing_order_list(web_catalog_context):
    ctx = web_catalog_context
    response = ctx['client'].get(
        '/api/v1/purchasing/orders/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    data = response.json()
    assert 'results' in data


@pytest.mark.django_db
def test_purchasing_order_create(web_catalog_context):
    ctx = web_catalog_context
    response = ctx['client'].post(
        '/api/v1/purchasing/orders/',
        {
            'branch': str(ctx['branch'].id),
            'supplier': str(ctx['supplier'].id),
            'items': [],
        },
        content_type='application/json',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code in (201, 200, 400)


# =============================================================================
# Cross-tenant 404
# =============================================================================


@pytest.mark.django_db
def test_cross_tenant_product_404(client, web_catalog_context):
    ctx = web_catalog_context
    other = Tenant.objects.create(name='Other Catalog', slug='other-catalog')
    other_user = User.objects.create_user(email='other-catalog@test.local', password='pass123')
    _auth_client(client, other_user, other, role='admin')
    response = client.get(
        f'/api/v1/catalog/products/{ctx["product"].id}/',
        HTTP_X_TENANT_ID=str(other.id),
    )
    assert response.status_code == 404


# =============================================================================
# Role denial — operator cannot manage catalog
# =============================================================================


@pytest.mark.django_db
def test_operator_cannot_create_category(web_catalog_context):
    ctx = web_catalog_context
    op = User.objects.create_user(email='op-catalog@test.local', password='pass123')
    op_client = ctx['client'].__class__()
    _auth_client(op_client, op, ctx['tenant'], role='operator')
    response = op_client.post(
        '/api/v1/catalog/categories/',
        {'name': 'Cat Operator'},
        content_type='application/json',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    # Operator has catalog.view but not catalog.manage
    assert response.status_code in (403, 405)
