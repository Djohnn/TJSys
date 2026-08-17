"""API tests for product-stock-policy and product-apply endpoints."""

import json
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.db import connection

from catalog.models import Category, Product, Unit
from inventory.models import ProductStockPolicy, StockBalance, StockLocation
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


def _create_policy(tenant, product, branch, location, **overrides):
    defaults = {
        'tenant': tenant,
        'product': product,
        'branch': branch,
        'location': location,
        'minimum_quantity': Decimal('10'),
        'maximum_quantity': Decimal('100'),
        'reorder_point': Decimal('5'),
        'allow_negative': False,
    }
    defaults.update(overrides)
    policy = ProductStockPolicy(**defaults)
    policy.full_clean()
    policy.save()
    return policy


@pytest.mark.django_db
def test_list_product_policies_returns_empty_when_none(client):
    """Given no policies, when listing, then return empty list."""
    tenant = Tenant.objects.create(name='PSPA01', slug='pspa01')
    user = User.objects.create_user(email='a@test.com', password='pass')
    _auth_client(client, user, tenant)

    response = client.get(
        '/api/v1/inventory/product-policies/',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert response.status_code == 200


@pytest.mark.django_db
def test_list_product_policies_filters_by_product(client):
    """Given policies for product A, when query by product, then return only product A policies."""
    tenant = Tenant.objects.create(name='PSPA02', slug='pspa02')
    user = User.objects.create_user(email='b@test.com', password='pass')
    _auth_client(client, user, tenant)

    product, branch, location = _run_in_tenant(tenant, lambda: _setup_stock(tenant))
    _run_in_tenant(tenant, lambda: _create_policy(tenant, product, branch, location))

    response = client.get(
        f'/api/v1/inventory/product-policies/?product={product.id}',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert response.status_code == 200


@pytest.mark.django_db
def test_patch_product_policy_updates_minimum(client):
    """Given existing policy, when PATCH minimum_quantity, then updates."""
    tenant = Tenant.objects.create(name='PSPA03', slug='pspa03')
    user = User.objects.create_user(email='c@test.com', password='pass')
    _auth_client(client, user, tenant)

    product, branch, location = _run_in_tenant(tenant, lambda: _setup_stock(tenant))
    policy = _run_in_tenant(tenant, lambda: _create_policy(tenant, product, branch, location))

    response = client.patch(
        f'/api/v1/inventory/product-policies/{policy.id}/',
        data=json.dumps({'minimum_quantity': '20'}),
        content_type='application/json',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert response.status_code == 200


@pytest.mark.django_db
def test_patch_product_policy_conflicts_with_stale_version(client):
    """Given existing policy, when PATCH with stale If-Match version, then returns 409."""
    tenant = Tenant.objects.create(name='PSPA05', slug='pspa05')
    user = User.objects.create_user(email='e@test.com', password='pass')
    _auth_client(client, user, tenant)

    product, branch, location = _run_in_tenant(tenant, lambda: _setup_stock(tenant))
    policy = _run_in_tenant(tenant, lambda: _create_policy(tenant, product, branch, location))

    response = client.patch(
        f'/api/v1/inventory/product-policies/{policy.id}/',
        data=json.dumps({'minimum_quantity': '20'}),
        content_type='application/json',
        HTTP_X_TENANT_ID=str(tenant.id),
        HTTP_IF_MATCH=str(policy.version + 99),
    )
    assert response.status_code == 409
    body = response.json()
    assert body['code'] == 'CONFLICT_VERSION_MISMATCH'


@pytest.mark.django_db
def test_product_summary_returns_ordered_locations_collection(client):
    """Return ordered locations when fetching a product summary without filters."""
    tenant = Tenant.objects.create(name='PSPA04', slug='pspa04')
    user = User.objects.create_user(email='d@test.com', password='pass')
    _auth_client(client, user, tenant)

    product, branch, location = _run_in_tenant(tenant, lambda: _setup_stock(tenant))
    _run_in_tenant(tenant, lambda: StockBalance.objects.create(
        tenant=tenant,
        product=product,
        location=location,
        quantity=Decimal('30'),
        reserved=Decimal('5'),
    ))
    _run_in_tenant(tenant, lambda: _create_policy(tenant, product, branch, location))

    response = client.get(
        f'/api/v1/inventory/product-summary/{product.id}/',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert response.status_code == 200
    data = response.json()
    # Without branch/location filters, returns a list of all locations
    assert isinstance(data, list)
    assert len(data) == 1
    summary = data[0]
    assert summary['product'] == str(product.id)
    assert summary['branch'] == str(branch.id)
    assert summary['branch_name'] == 'Branch'
    assert summary['location'] == str(location.id)
    assert summary['location_name'] == 'Deposito A1'
    assert summary['quantity'] == '30'
    assert summary['reserved'] == '5'
    assert summary['available'] == '25'
    assert summary['status'] == 'normal'
    assert summary['minimum_quantity'] == '10'
    assert summary['maximum_quantity'] == '100'
    assert summary['reorder_point'] == '5'

    # With branch/location filters, returns single summary object
    response_filtered = client.get(
        f'/api/v1/inventory/product-summary/{product.id}/?branch={branch.id}&location={location.id}',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert response_filtered.status_code == 200
    data_filtered = response_filtered.json()
    assert data_filtered['product'] == str(product.id)
    assert data_filtered['branch'] == str(branch.id)


@pytest.mark.django_db
def test_product_summary_returns_empty_list_when_no_active_policy(client):
    """Given tracked product without policy, when fetching summary, then returns empty list."""
    tenant = Tenant.objects.create(name='PSPA06', slug='pspa06')
    user = User.objects.create_user(email='f@test.com', password='pass')
    _auth_client(client, user, tenant)

    product, branch, location = _run_in_tenant(tenant, lambda: _setup_stock(tenant))

    response = client.get(
        f'/api/v1/inventory/product-summary/{product.id}/',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert data == []


def _apply_payload(tenant, branch, location, **overrides):
    unit = _run_in_tenant(tenant, lambda: Unit.objects.filter(tenant=tenant).first())
    payload = {
        'command_id': 'cmd-apply-001',
        'product': {
            'name': 'Produto Aplicado',
            'sku': 'APPLIED-001',
            'base_unit': str(unit.id),
            'tracks_inventory': True,
        },
        'stock': {
            'branch': str(branch.id),
            'location': str(location.id),
            'initial_quantity': '25.000000',
            'minimum_quantity': '5.000000',
            'maximum_quantity': '100.000000',
            'reorder_point': '10.000000',
            'allow_negative': False,
        },
    }
    payload['stock'].update(overrides)
    return payload


@pytest.mark.django_db
def test_apply_product_with_stock_returns_policy_and_summary(client):
    """Create a product with policy and flat summary from the nested payload."""
    tenant = Tenant.objects.create(name='PSPA07', slug='pspa07')
    user = User.objects.create_user(email='g@test.com', password='pass')
    _auth_client(client, user, tenant)

    product, branch, location = _run_in_tenant(tenant, lambda: _setup_stock(tenant))
    payload = _apply_payload(tenant, branch, location)

    response = client.post(
        '/api/v1/catalog/products/apply/',
        data=json.dumps(payload),
        content_type='application/json',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert response.status_code == 201
    data = response.json()
    assert data['product']['tracks_inventory'] is True
    assert data['product']['name'] == 'Produto Aplicado'
    assert data['stock_policy']['minimum_quantity'] == '5.000000'
    assert data['stock_policy']['maximum_quantity'] == '100.000000'
    assert data['stock_policy']['reorder_point'] == '10.000000'
    assert data['stock_summary']['quantity'] == '25'
    assert data['stock_summary']['reserved'] == '0'
    assert data['stock_summary']['available'] == '25'
    assert data['stock_summary']['status'] == 'normal'
    assert data['stock_summary']['branch_name'] == 'Branch'
    assert data['stock_summary']['location_name'] == 'Deposito A1'
    assert Product.all_objects.filter(sku='APPLIED-001').exists()


@pytest.mark.django_db
def test_apply_product_command_is_idempotent_and_rejects_payload_mismatch(client):
    """Given a completed command, equal retry replays it and changed retry conflicts."""
    tenant = Tenant.objects.create(name='PSPA07B', slug='pspa07b')
    user = User.objects.create_user(email='g2@test.com', password='pass')
    _auth_client(client, user, tenant)
    _, branch, location = _run_in_tenant(tenant, lambda: _setup_stock(tenant))
    payload = _apply_payload(tenant, branch, location)

    first = client.post(
        '/api/v1/catalog/products/apply/', data=json.dumps(payload),
        content_type='application/json', HTTP_X_TENANT_ID=str(tenant.id),
    )
    replay = client.post(
        '/api/v1/catalog/products/apply/', data=json.dumps(payload),
        content_type='application/json', HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert first.status_code == 201
    assert replay.status_code == 201
    assert replay.json() == first.json()
    assert Product.all_objects.filter(tenant=tenant, sku='APPLIED-001').count() == 1

    payload['product']['name'] = 'Changed payload'
    conflict = client.post(
        '/api/v1/catalog/products/apply/', data=json.dumps(payload),
        content_type='application/json', HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert conflict.status_code == 409
    assert conflict['Content-Type'].startswith('application/problem+json')
    assert conflict.json()['code'] == 'COMMAND_PAYLOAD_MISMATCH'


@pytest.mark.django_db
def test_apply_product_without_stock_creates_plain_product(client):
    """Given nested apply payload without stock, when posting, then creates only the product."""
    tenant = Tenant.objects.create(name='PSPA08', slug='pspa08')
    user = User.objects.create_user(email='h@test.com', password='pass')
    _auth_client(client, user, tenant)

    _run_in_tenant(tenant, lambda: _setup_stock(tenant))
    unit = _run_in_tenant(tenant, lambda: Unit.objects.filter(tenant=tenant).first())
    payload = {
        'command_id': 'cmd-apply-002',
        'product': {
            'name': 'Produto Sem Estoque',
            'sku': 'PLAIN-002',
            'base_unit': str(unit.id),
            'tracks_inventory': False,
        },
    }

    response = client.post(
        '/api/v1/catalog/products/apply/',
        data=json.dumps(payload),
        content_type='application/json',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert response.status_code == 201
    data = response.json()
    assert data['product']['tracks_inventory'] is False
    assert data['stock_policy'] is None
    assert data['stock_summary'] is None


@pytest.mark.django_db
def test_apply_product_requires_stock_when_tracks_inventory(client):
    """Given tracks_inventory true without stock, when posting, then returns 422."""
    tenant = Tenant.objects.create(name='PSPA09', slug='pspa09')
    user = User.objects.create_user(email='i@test.com', password='pass')
    _auth_client(client, user, tenant)

    _run_in_tenant(tenant, lambda: _setup_stock(tenant))
    unit = _run_in_tenant(tenant, lambda: Unit.objects.filter(tenant=tenant).first())
    payload = {
        'command_id': 'cmd-apply-003',
        'product': {
            'name': 'Produto Sem Config',
            'sku': 'NO-STOCK-003',
            'base_unit': str(unit.id),
            'tracks_inventory': True,
        },
    }

    response = client.post(
        '/api/v1/catalog/products/apply/',
        data=json.dumps(payload),
        content_type='application/json',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert response.status_code in (400, 422)
    assert not Product.all_objects.filter(sku='NO-STOCK-003').exists()


def _setup_stock(tenant):
    company = Company.objects.create(tenant=tenant, name='Cia')
    branch = Branch.objects.create(tenant=tenant, company=company, name='Branch')
    location = StockLocation.objects.create(
        tenant=tenant, branch=branch, code='A1', name='Deposito A1'
    )
    unit = Unit.objects.create(tenant=tenant, symbol='UN', name='Unidade')
    category = Category.objects.create(tenant=tenant, name='Cat')
    product = Product.objects.create(
        tenant=tenant, sku='PSPA-PROD', name='Test Product',
        base_unit=unit, category=category, tracks_inventory=True,
    )
    return product, branch, location
