import json
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.urls import reverse
from rest_framework import status

from catalog.models import Product, ProductPrice, Unit
from inventory.models import StockLocation
from inventory.services import create_receipt
from sales.models import SaleItem
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
def returns_api_context(client):
    tenant = Tenant.objects.create(name='Returns API', slug='returns-api')
    user = User.objects.create_user(email='returns-api@test.local', password='pass123')
    api_client = _auth_client(client, user, tenant)

    def _create():
        unit = Unit.all_objects.create(tenant=tenant, symbol='UN', name='Unidade')
        product = Product.all_objects.create(
            tenant=tenant,
            sku='RET-API',
            name='Produto Ret',
            base_unit=unit,
        )
        ProductPrice.all_objects.create(
            tenant=tenant,
            product=product,
            amount=Decimal('10.00'),
            valid_from='2026-01-01T00:00:00Z',
        )
        company = Company.all_objects.create(tenant=tenant, name='Empresa Ret')
        branch = Branch.all_objects.create(
            tenant=tenant,
            company=company,
            name='Filial Ret',
        )
        location = StockLocation.all_objects.create(
            tenant=tenant,
            branch=branch,
            code='RET',
            name='Retorno',
            is_primary=True,
        )
        create_receipt(
            tenant,
            branch,
            product,
            location,
            Decimal('5'),
            unit,
            Decimal('1'),
            idempotency_key='ret-api-stock',
            actor=user,
            reason='seed ret api stock',
        )
        return {
            'tenant': tenant,
            'user': user,
            'unit': unit,
            'product': product,
            'branch': branch,
            'location': location,
            'api_client': api_client,
        }

    return _run_in_tenant(tenant, _create)


@pytest.mark.django_db
class TestSaleReturnAPI:
    def _sale(self, ctx):
        return _run_in_tenant(ctx['tenant'], lambda: _create_sale(ctx))

    def test_create_return_endpoint(self, returns_api_context):
        ctx = returns_api_context
        sale = self._sale(ctx)
        url = reverse('sale-returns', kwargs={'pk': sale.id})
        sale_item = SaleItem.all_objects.filter(sale=sale).first()
        sale_item_id = str(sale_item.id)

        response = ctx['api_client'].post(
            url,
            data=json.dumps(
                {
                    'items': [{'sale_item_id': sale_item_id, 'quantity': '1'}],
                    'reason': 'Devolucao',
                }
            ),
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY='api-return-1',
            HTTP_X_TENANT_ID=str(ctx['tenant'].id),
        )
        assert response.status_code == status.HTTP_201_CREATED, response.json()
        data = response.json()
        assert data['status'] == 'completed'
        assert len(data['items']) == 1

    def test_create_return_missing_idempotency(self, returns_api_context):
        ctx = returns_api_context
        sale = self._sale(ctx)
        url = reverse('sale-returns', kwargs={'pk': sale.id})
        sale_item = SaleItem.all_objects.filter(sale=sale).first()
        sale_item_id = str(sale_item.id)
        response = ctx['api_client'].post(
            url,
            data=json.dumps(
                {
                    'items': [{'sale_item_id': sale_item_id, 'quantity': '1'}],
                    'reason': 'Sem key',
                }
            ),
            content_type='application/json',
            HTTP_X_TENANT_ID=str(ctx['tenant'].id),
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_list_returns_for_sale(self, returns_api_context):
        ctx = returns_api_context
        sale = self._sale(ctx)
        sale_item = SaleItem.all_objects.filter(sale=sale).first()
        sale_item_id = str(sale_item.id)

        def _seed():
            from sales.services import create_sale_return

            create_sale_return(
                tenant=ctx['tenant'],
                sale=sale,
                items=[{'sale_item_id': sale_item_id, 'quantity': Decimal('1')}],
                reason='Lista teste',
                idempotency_key='api-list-return-1',
            )

        _run_in_tenant(ctx['tenant'], _seed)

        url = reverse('sale-returns', kwargs={'pk': sale.id})
        response = ctx['api_client'].get(
            url,
            HTTP_X_TENANT_ID=str(ctx['tenant'].id),
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) >= 1

    def test_cancel_sale_endpoint(self, returns_api_context):
        ctx = returns_api_context
        sale = self._sale(ctx)
        url = reverse('sale-cancel', kwargs={'pk': sale.id})
        response = ctx['api_client'].post(
            url,
            data=json.dumps({'reason': 'Cancelamento via API'}),
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY='api-cancel-1',
            HTTP_X_TENANT_ID=str(ctx['tenant'].id),
        )
        assert response.status_code == status.HTTP_200_OK, response.json()
        data = response.json()
        assert data['status'] == 'completed'
        assert data['reason'] == 'Cancelamento via API'
        sale.refresh_from_db()
        assert sale.status == 'cancelled'

    def test_cancel_sale_conflict_idempotency(self, returns_api_context):
        ctx = returns_api_context
        sale = self._sale(ctx)
        url = reverse('sale-cancel', kwargs={'pk': sale.id})
        response = ctx['api_client'].post(
            url,
            data=json.dumps({'reason': 'Primeiro cancel'}),
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY='api-cancel-conflict-1',
            HTTP_X_TENANT_ID=str(ctx['tenant'].id),
        )
        assert response.status_code == status.HTTP_200_OK

        response2 = ctx['api_client'].post(
            url,
            data=json.dumps({'reason': 'Payload diferente'}),
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY='api-cancel-conflict-1',
            HTTP_X_TENANT_ID=str(ctx['tenant'].id),
        )
        assert response2.status_code == status.HTTP_409_CONFLICT

    def test_cross_tenant_blocked(self, returns_api_context, client):
        ctx = returns_api_context
        sale = self._sale(ctx)
        other_tenant = Tenant.objects.create(name='Other', slug='other-api')
        other_user = User.objects.create_user(email='other-api@test.local', password='pass123')
        _auth_client(client, other_user, other_tenant)

        url = reverse('sale-cancel', kwargs={'pk': sale.id})
        response = client.post(
            url,
            data=json.dumps({'reason': 'Cross tenant'}),
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY='api-cross-1',
            HTTP_X_TENANT_ID=str(other_tenant.id),
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND


def _create_sale(ctx):
    from sales.services import create_counter_sale, open_cash_session

    open_cash_session(
        tenant=ctx['tenant'],
        branch=ctx['branch'],
        operator=ctx['user'],
        opening_amount=Decimal('50.00'),
        idempotency_key='ret-api-cash-open',
    )
    return create_counter_sale(
        tenant=ctx['tenant'],
        branch=ctx['branch'],
        operator=ctx['user'],
        stock_location=ctx['location'],
        items=[
            {
                'product': ctx['product'],
                'unit': ctx['unit'],
                'quantity': Decimal('2'),
                'factor': Decimal('1'),
            }
        ],
        payments=[{'method': 'cash', 'amount': Decimal('20.00')}],
        idempotency_key='ret-api-sale',
    )
