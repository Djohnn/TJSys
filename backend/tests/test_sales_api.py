import json
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.utils import timezone

from catalog.models import Product, ProductPrice, Unit
from inventory.models import StockBalance, StockLocation
from inventory.services import create_receipt
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
def sales_api_context(client):
    tenant = Tenant.objects.create(name='Sales API', slug='sales-api')
    user = User.objects.create_user(email='sales-api@test.local', password='pass123')
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
            sku='SALE-API',
            name='Produto API Venda',
            base_unit=unit,
        )
        ProductPrice.all_objects.create(
            tenant=tenant,
            product=product,
            amount=Decimal('12.50'),
            valid_from=timezone.now(),
        )
        company = Company.all_objects.create(tenant=tenant, name='Empresa Sales API')
        branch = Branch.all_objects.create(
            tenant=tenant,
            company=company,
            name='Filial Sales API',
        )
        location = StockLocation.all_objects.create(
            tenant=tenant,
            branch=branch,
            code='BALCAO',
            name='Balcao',
            is_primary=True,
        )
        create_receipt(
            tenant,
            branch,
            product,
            location,
            Decimal('4'),
            unit,
            Decimal('1'),
            idempotency_key='sales-api-seed',
            actor=user,
            reason='seed sales api stock',
        )
        return {
            'tenant': tenant,
            'client': api_client,
            'user': user,
            'unit': unit,
            'product': product,
            'branch': branch,
            'location': location,
        }

    return _run_in_tenant(tenant, _create)


def _post_json(client, url, payload, *, tenant, idempotency_key):
    return client.post(
        url,
        data=json.dumps(payload),
        content_type='application/json',
        HTTP_X_TENANT_ID=str(tenant.id),
        HTTP_IDEMPOTENCY_KEY=idempotency_key,
    )


@pytest.mark.django_db
def test_api_opens_gets_current_and_closes_cash_session(sales_api_context):
    ctx = sales_api_context
    open_response = _post_json(
        ctx['client'],
        '/api/v1/cash-sessions/open/',
        {
            'branch': str(ctx['branch'].id),
            'opening_amount': '25.00',
        },
        tenant=ctx['tenant'],
        idempotency_key='api-cash-open',
    )

    assert open_response.status_code == 201
    session_id = open_response.json()['id']

    current_response = ctx['client'].get(
        f'/api/v1/cash-sessions/current/?branch={ctx["branch"].id}',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert current_response.status_code == 200
    assert current_response.json()['id'] == session_id

    close_response = _post_json(
        ctx['client'],
        f'/api/v1/cash-sessions/{session_id}/close/',
        {'closing_amount': '25.00'},
        tenant=ctx['tenant'],
        idempotency_key='api-cash-close',
    )
    assert close_response.status_code == 200
    assert close_response.json()['status'] == 'closed'


@pytest.mark.django_db
def test_api_creates_counter_sale_and_deducts_stock(sales_api_context):
    ctx = sales_api_context
    _post_json(
        ctx['client'],
        '/api/v1/cash-sessions/open/',
        {
            'branch': str(ctx['branch'].id),
            'opening_amount': '0.00',
        },
        tenant=ctx['tenant'],
        idempotency_key='api-cash-open-sale',
    )

    response = _post_json(
        ctx['client'],
        '/api/v1/sales/counter/',
        {
            'branch': str(ctx['branch'].id),
            'stock_location': str(ctx['location'].id),
            'items': [
                {
                    'product': str(ctx['product'].id),
                    'unit': str(ctx['unit'].id),
                    'quantity': '2.000000',
                    'factor': '1.000000',
                }
            ],
            'payments': [{'method': 'cash', 'amount': '25.00'}],
        },
        tenant=ctx['tenant'],
        idempotency_key='api-counter-sale',
    )

    assert response.status_code == 201
    body = response.json()
    assert body['status'] == 'confirmed'
    assert body['net_total'] == '25.00'
    assert body['payments'][0]['amount'] == '25.00'

    balance = StockBalance.all_objects.get(
        tenant=ctx['tenant'],
        product=ctx['product'],
        location=ctx['location'],
        lot=None,
    )
    assert balance.quantity == Decimal('2.000000')


@pytest.mark.django_db
def test_current_cash_session_reports_confirmed_sales_totals(sales_api_context):
    ctx = sales_api_context
    open_response = _post_json(
        ctx['client'],
        '/api/v1/cash-sessions/open/',
        {
            'branch': str(ctx['branch'].id),
            'opening_amount': '10.00',
        },
        tenant=ctx['tenant'],
        idempotency_key='api-cash-open-totals',
    )
    assert open_response.status_code == 201

    response = _post_json(
        ctx['client'],
        '/api/v1/sales/counter/',
        {
            'branch': str(ctx['branch'].id),
            'stock_location': str(ctx['location'].id),
            'items': [
                {
                    'product': str(ctx['product'].id),
                    'unit': str(ctx['unit'].id),
                    'quantity': '2.000000',
                    'factor': '1.000000',
                }
            ],
            'payments': [{'method': 'cash', 'amount': '25.00'}],
        },
        tenant=ctx['tenant'],
        idempotency_key='api-counter-sale-totals',
    )
    assert response.status_code == 201

    current_response = ctx['client'].get(
        f'/api/v1/cash-sessions/current/?branch={ctx["branch"].id}',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )

    assert current_response.status_code == 200
    body = current_response.json()
    assert body['sales_count'] == 1
    assert body['total_sales'] == '25.00'


@pytest.mark.django_db
def test_api_rejects_counter_sale_payment_mismatch(sales_api_context):
    ctx = sales_api_context
    _post_json(
        ctx['client'],
        '/api/v1/cash-sessions/open/',
        {'branch': str(ctx['branch'].id), 'opening_amount': '0.00'},
        tenant=ctx['tenant'],
        idempotency_key='api-cash-open-mismatch',
    )

    response = _post_json(
        ctx['client'],
        '/api/v1/sales/counter/',
        {
            'branch': str(ctx['branch'].id),
            'stock_location': str(ctx['location'].id),
            'items': [
                {
                    'product': str(ctx['product'].id),
                    'unit': str(ctx['unit'].id),
                    'quantity': '1.000000',
                    'factor': '1.000000',
                }
            ],
            'payments': [{'method': 'cash', 'amount': '1.00'}],
        },
        tenant=ctx['tenant'],
        idempotency_key='api-counter-sale-mismatch',
    )

    assert response.status_code == 400
    assert response.json()['type'].endswith('/payment_mismatch')


@pytest.mark.django_db
def test_api_blocks_cross_tenant_branch(sales_api_context):
    ctx = sales_api_context
    other_tenant = Tenant.objects.create(name='Other Sales API', slug='other-sales-api')
    other_branch = _run_in_tenant(
        other_tenant,
        lambda: Branch.all_objects.create(
            tenant=other_tenant,
            company=Company.all_objects.create(tenant=other_tenant, name='Other Co'),
            name='Other Branch',
        ),
    )

    response = _post_json(
        ctx['client'],
        '/api/v1/cash-sessions/open/',
        {
            'branch': str(other_branch.id),
            'opening_amount': '0.00',
        },
        tenant=ctx['tenant'],
        idempotency_key='api-cross-tenant-cash',
    )

    assert response.status_code == 404
