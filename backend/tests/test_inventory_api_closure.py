from datetime import date, timedelta

import pytest
from django.contrib.auth import get_user_model
from django.db import connection

from catalog.models import Product, Unit
from inventory.models import StockLocation, StockLot
from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Branch, Company, Tenant, TenantMembership

User = get_user_model()


def _run_in_tenant(tenant, callback):
    token = set_current_tenant_id(tenant.id)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'SELECT set_config(%s, %s, false)',
                ['app.current_tenant_id', str(tenant.id)],
            )
        return callback()
    finally:
        reset_current_tenant_id(token)


def _auth_client(client, user, tenant):
    TenantMembership.objects.update_or_create(
        user=user,
        tenant=tenant,
        defaults={'role': 'admin', 'is_active': True},
    )
    client.force_login(user)
    session = client.session
    session['mfa_tenant_id'] = str(tenant.id)
    session['mfa_method'] = 'totp'
    session.save()
    return client


@pytest.fixture
def api_context(client):
    tenant = Tenant.objects.create(name='Inventory API', slug='inventory-api')
    user = User.objects.create_user(email='inventory-api@test.local', password='pass123')
    api_client = _auth_client(client, user, tenant)

    def _create():
        unit = Unit.all_objects.create(
            tenant=tenant,
            symbol='UN',
            name='Unidade',
            precision=0,
        )
        product = Product.all_objects.create(
            tenant=tenant,
            sku='API-PROD',
            name='Produto API',
            base_unit=unit,
            requires_lot=True,
            requires_expiry=True,
        )
        company = Company.all_objects.create(tenant=tenant, name='Empresa API')
        branch = Branch.all_objects.create(
            tenant=tenant,
            company=company,
            name='Filial API',
        )
        location = StockLocation.all_objects.create(
            tenant=tenant,
            branch=branch,
            code='API',
            name='Local API',
            is_primary=True,
        )
        lot = StockLot.all_objects.create(
            tenant=tenant,
            product=product,
            lot_number='API-LOT',
            expiry_date=date.today() + timedelta(days=10),
        )
        return {
            'tenant': tenant,
            'client': api_client,
            'unit': unit,
            'product': product,
            'branch': branch,
            'location': location,
            'lot': lot,
        }

    return _run_in_tenant(tenant, _create)


def _receipt_payload(ctx, quantity='2.000000'):
    return {
        'branch': str(ctx['branch'].id),
        'product': str(ctx['product'].id),
        'location': str(ctx['location'].id),
        'quantity': quantity,
        'unit': str(ctx['unit'].id),
        'factor': '1.000000',
        'lot': str(ctx['lot'].id),
    }


@pytest.mark.django_db
def test_api_requires_idempotency_key(api_context):
    ctx = api_context
    response = ctx['client'].post(
        '/api/v1/stock-operations/receipt/',
        _receipt_payload(ctx),
        format='json',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )

    assert response.status_code == 400
    assert response.json()['type'].endswith('/invalid_stock_operation')


@pytest.mark.django_db
def test_api_replays_identical_payload_and_conflicts_changed_payload(api_context):
    ctx = api_context
    payload = _receipt_payload(ctx)

    first = ctx['client'].post(
        '/api/v1/stock-operations/receipt/',
        payload,
        format='json',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
        HTTP_IDEMPOTENCY_KEY='api-receipt',
    )
    replay = ctx['client'].post(
        '/api/v1/stock-operations/receipt/',
        payload,
        format='json',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
        HTTP_IDEMPOTENCY_KEY='api-receipt',
    )
    conflict = ctx['client'].post(
        '/api/v1/stock-operations/receipt/',
        _receipt_payload(ctx, quantity='3.000000'),
        format='json',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
        HTTP_IDEMPOTENCY_KEY='api-receipt',
    )

    assert first.status_code == 200
    assert replay.status_code == 200
    assert replay.json()['id'] == first.json()['id']
    assert conflict.status_code == 409
    assert conflict.json()['type'].endswith('/idempotency_conflict')


@pytest.mark.django_db
def test_api_reconciliation_endpoint_returns_divergences(api_context):
    ctx = api_context
    ctx['client'].post(
        '/api/v1/stock-operations/receipt/',
        _receipt_payload(ctx),
        format='json',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
        HTTP_IDEMPOTENCY_KEY='api-reconcile-seed',
    )

    response = ctx['client'].get(
        '/api/v1/inventory/balances/reconcile/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )

    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.django_db
def test_api_returns_404_for_resource_outside_tenant(api_context):
    ctx = api_context
    other_tenant = Tenant.objects.create(name='Inventory API Other', slug='inventory-api-other')
    other_branch = _run_in_tenant(
        other_tenant,
        lambda: Branch.all_objects.create(
            tenant=other_tenant,
            company=Company.all_objects.create(tenant=other_tenant, name='Other Co'),
            name='Other Branch',
        ),
    )
    payload = _receipt_payload(ctx)
    payload['branch'] = str(other_branch.id)

    response = ctx['client'].post(
        '/api/v1/stock-operations/receipt/',
        payload,
        format='json',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
        HTTP_IDEMPOTENCY_KEY='api-cross-tenant-branch',
    )

    assert response.status_code == 404
