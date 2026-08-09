import hashlib
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from catalog.models import Product, ProductPrice, Unit
from inventory.models import StockBalance, StockLocation, StockMovement
from inventory.services import create_receipt
from sales.models import CashMovement, Sale, SalePayment
from sales.services import open_cash_session
from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Branch, Company, Device, Tenant, TenantMembership

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


@pytest.fixture
def pdv_device_context():
    tenant = Tenant.objects.create(name='PDV Device', slug='pdv-device')
    user = User.objects.create_user(email='pdv-device@test.local', password='pass123')
    TenantMembership.objects.create(
        user=user,
        tenant=tenant,
        role='admin',
        is_active=True,
    )

    def _create():
        unit = Unit.all_objects.create(tenant=tenant, symbol='UN', name='Unidade')
        product = Product.all_objects.create(
            tenant=tenant,
            sku='PDV-001',
            name='Produto PDV',
            base_unit=unit,
        )
        ProductPrice.all_objects.create(
            tenant=tenant,
            product=product,
            amount=Decimal('12.50'),
            valid_from=timezone.now(),
        )
        company = Company.all_objects.create(tenant=tenant, name='Empresa PDV')
        branch = Branch.all_objects.create(
            tenant=tenant,
            company=company,
            name='Filial PDV',
        )
        location = StockLocation.all_objects.create(
            tenant=tenant,
            branch=branch,
            code='BALCAO',
            name='Balcao',
            is_primary=True,
        )
        device = Device.all_objects.create(
            tenant=tenant,
            branch=branch,
            name='PDV Balcao',
            device_id='pdv-device-flow',
            key_hash=hashlib.sha256(b'pdv-device-key').hexdigest(),
            status='active',
            registered_by=user,
        )
        create_receipt(
            tenant,
            branch,
            product,
            location,
            Decimal('5'),
            unit,
            Decimal('1'),
            idempotency_key='pdv-device-stock',
            actor=user,
            reason='seed pdv device stock',
        )
        open_cash_session(
            tenant=tenant,
            branch=branch,
            operator=user,
            opening_amount=Decimal('0'),
            idempotency_key='pdv-device-cash-open',
        )
        refresh = RefreshToken()
        refresh['device_id'] = str(device.id)
        refresh['tenant_id'] = str(tenant.id)
        refresh['branch_id'] = str(branch.id)
        return {
            'tenant': tenant,
            'user': user,
            'unit': unit,
            'product': product,
            'branch': branch,
            'location': location,
            'token': str(refresh.access_token),
        }

    return _run_in_tenant(tenant, _create)


def _pdv_client(ctx):
    client = APIClient(enforce_csrf_checks=True)
    client.credentials(
        HTTP_AUTHORIZATION=f'Bearer {ctx["token"]}',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    return client


@pytest.mark.django_db
def test_pdv_device_can_search_product_with_price_without_mfa(pdv_device_context):
    client = _pdv_client(pdv_device_context)

    response = client.get('/api/v1/products/?search=Produto%20PDV', HTTP_HOST='localhost')

    assert response.status_code == 200
    product = response.json()['results'][0]
    assert product['name'] == 'Produto PDV'
    assert product['price'] == '12.50'


@pytest.mark.django_db
def test_pdv_device_can_confirm_counter_sale_without_csrf(pdv_device_context):
    ctx = pdv_device_context
    client = _pdv_client(ctx)

    response = client.post(
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
            'payments': [{'method': 'cash', 'amount': '12.50'}],
        },
        format='json',
        HTTP_HOST='localhost',
        HTTP_IDEMPOTENCY_KEY='pdv-device-counter-sale',
    )

    assert response.status_code == 201
    assert response.json()['net_total'] == '12.50'


@pytest.mark.django_db
def test_pdv_counter_sale_idempotency_replay_has_no_second_stock_or_payment_effect(
    pdv_device_context,
):
    ctx = pdv_device_context
    client = _pdv_client(ctx)
    payload = {
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
        'payments': [{'method': 'cash', 'amount': '12.50'}],
    }
    headers = {'HTTP_HOST': 'localhost', 'HTTP_IDEMPOTENCY_KEY': 'pdv-device-idempotent-sale'}

    first = client.post('/api/v1/sales/counter/', payload, format='json', **headers)
    assert first.status_code == 201
    sale_id = first.json()['id']
    balance = StockBalance.all_objects.get(
        tenant=ctx['tenant'], product=ctx['product'], location=ctx['location'], lot=None
    )
    movement_count = StockMovement.all_objects.filter(tenant=ctx['tenant']).count()
    payment_count = SalePayment.all_objects.filter(tenant=ctx['tenant']).count()
    cash_movement_count = CashMovement.all_objects.filter(
        tenant=ctx['tenant'], movement_type='sale_payment'
    ).count()

    replay = client.post('/api/v1/sales/counter/', payload, format='json', **headers)

    balance.refresh_from_db()
    assert replay.status_code == 201
    assert replay.json()['id'] == sale_id
    assert balance.quantity == Decimal('4.000000')
    assert StockMovement.all_objects.filter(tenant=ctx['tenant']).count() == movement_count
    assert SalePayment.all_objects.filter(tenant=ctx['tenant']).count() == payment_count
    assert CashMovement.all_objects.filter(
        tenant=ctx['tenant'], movement_type='sale_payment'
    ).count() == cash_movement_count
    assert Sale.all_objects.filter(tenant=ctx['tenant']).count() == 1
