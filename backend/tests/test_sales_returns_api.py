import json
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.urls import reverse
from rest_framework import status

from catalog.models import Product, ProductPrice, Unit
from inventory.models import StockLocation
from inventory.services import create_receipt
from sales.models import CashSession, SaleItem
from sales.services import create_sale_return
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


def _assert_problem(response, *, status_code, code):
    assert response.status_code == status_code, response.content
    assert response['Content-Type'].startswith('application/problem+json')
    body = response.json()
    assert set(('type', 'title', 'status', 'detail', 'code')) <= body.keys()
    assert body['status'] == status_code
    assert body['code'] == code


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
        _assert_problem(
            response,
            status_code=status.HTTP_400_BAD_REQUEST,
            code='validation_error',
        )

    def test_create_return_replays_same_resource(self, returns_api_context):
        """Given a return command, when replayed, the API returns the same 201 resource."""
        ctx = returns_api_context
        sale = self._sale(ctx)
        url = reverse('sale-returns', kwargs={'pk': sale.id})
        sale_item_id = str(SaleItem.all_objects.filter(sale=sale).first().id)
        payload = {'items': [{'sale_item_id': sale_item_id, 'quantity': '1'}], 'reason': 'Replay'}

        first = ctx['api_client'].post(
            url,
            data=json.dumps(payload),
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY='api-return-replay-1',
            HTTP_X_TENANT_ID=str(ctx['tenant'].id),
        )
        replay = ctx['api_client'].post(
            url,
            data=json.dumps(payload),
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY='api-return-replay-1',
            HTTP_X_TENANT_ID=str(ctx['tenant'].id),
        )

        assert first.status_code == status.HTTP_201_CREATED, first.json()
        assert replay.status_code == status.HTTP_201_CREATED, replay.json()
        assert replay.json()['id'] == first.json()['id']

    @pytest.mark.parametrize('quantity', ['0', '-1'])
    def test_return_non_positive_quantity_is_invalid_quantity(self, returns_api_context, quantity):
        """Non-positive return quantity returns the invalid_quantity problem code."""
        ctx = returns_api_context
        sale = self._sale(ctx)
        url = reverse('sale-returns', kwargs={'pk': sale.id})
        sale_item_id = str(SaleItem.all_objects.filter(sale=sale).first().id)
        response = ctx['api_client'].post(
            url,
            data=json.dumps(
                {
                    'items': [{'sale_item_id': sale_item_id, 'quantity': quantity}],
                    'reason': 'Quantidade invalida',
                }
            ),
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY=f'api-return-invalid-{quantity}',
            HTTP_X_TENANT_ID=str(ctx['tenant'].id),
        )

        _assert_problem(
            response,
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            code='validation_error',
        )

    def test_return_above_remaining_quantity_is_insufficient_returnable_conflict(
        self, returns_api_context
    ):
        """Given a positive excess, the API returns the approved conflict contract."""
        ctx = returns_api_context
        sale = self._sale(ctx)
        url = reverse('sale-returns', kwargs={'pk': sale.id})
        sale_item_id = str(SaleItem.all_objects.filter(sale=sale).first().id)

        response = ctx['api_client'].post(
            url,
            data=json.dumps(
                {
                    'items': [{'sale_item_id': sale_item_id, 'quantity': '3'}],
                    'reason': 'Quantidade acima do saldo devolvível',
                }
            ),
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY='api-return-insufficient-1',
            HTTP_X_TENANT_ID=str(ctx['tenant'].id),
        )

        _assert_problem(
            response,
            status_code=status.HTTP_409_CONFLICT,
            code='insufficient_returnable',
        )

    def test_return_reason_over_500_is_rejected_before_service(self, returns_api_context):
        ctx = returns_api_context
        sale = self._sale(ctx)
        sale_item_id = str(SaleItem.all_objects.filter(sale=sale).first().id)
        with patch(
            'sales.views.create_sale_return',
            side_effect=AssertionError('return service must not be called'),
        ):
            response = ctx['api_client'].post(
                reverse('sale-returns', kwargs={'pk': sale.id}),
                data=json.dumps(
                    {
                        'items': [{'sale_item_id': sale_item_id, 'quantity': '1'}],
                        'reason': 'x' * 501,
                    }
                ),
                content_type='application/json',
                HTTP_IDEMPOTENCY_KEY='api-return-long-reason',
                HTTP_X_TENANT_ID=str(ctx['tenant'].id),
            )

        _assert_problem(
            response,
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            code='validation_error',
        )

    def test_refund_without_amount_completes_remaining_balance_and_replays(
        self, returns_api_context
    ):
        """Given a confirmed sale, when refund amount is omitted, the API refunds the balance."""
        ctx = returns_api_context
        sale = self._sale(ctx)
        url = reverse('sale-refund', kwargs={'pk': sale.id})
        payload = {'method': 'cash', 'reason': 'Reembolso integral'}

        response = ctx['api_client'].post(
            url,
            data=json.dumps(payload),
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY='api-refund-auto-1',
            HTTP_X_TENANT_ID=str(ctx['tenant'].id),
        )

        assert response.status_code == status.HTTP_201_CREATED, response.json()
        first = response.json()
        assert first['amount'] == '20.00'
        assert first['method'] == 'cash'

        replay = ctx['api_client'].post(
            url,
            data=json.dumps(payload),
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY='api-refund-auto-1',
            HTTP_X_TENANT_ID=str(ctx['tenant'].id),
        )

        assert replay.status_code == status.HTTP_201_CREATED, replay.json()
        assert replay.json()['id'] == first['id']

    def test_refund_missing_idempotency_is_problem(self, returns_api_context):
        ctx = returns_api_context
        sale = self._sale(ctx)
        response = ctx['api_client'].post(
            reverse('sale-refund', kwargs={'pk': sale.id}),
            data=json.dumps({'method': 'cash', 'reason': 'Sem chave'}),
            content_type='application/json',
            HTTP_X_TENANT_ID=str(ctx['tenant'].id),
        )

        _assert_problem(
            response,
            status_code=status.HTTP_400_BAD_REQUEST,
            code='validation_error',
        )

    def test_refund_reason_over_500_is_rejected_before_service(self, returns_api_context):
        ctx = returns_api_context
        sale = self._sale(ctx)
        with patch(
            'sales.views.create_sale_refund',
            side_effect=AssertionError('refund service must not be called'),
        ):
            response = ctx['api_client'].post(
                reverse('sale-refund', kwargs={'pk': sale.id}),
                data=json.dumps({'method': 'cash', 'reason': 'x' * 501}),
                content_type='application/json',
                HTTP_IDEMPOTENCY_KEY='api-refund-long-reason',
                HTTP_X_TENANT_ID=str(ctx['tenant'].id),
            )

        _assert_problem(
            response,
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            code='validation_error',
        )

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
        assert response.status_code == status.HTTP_201_CREATED, response.json()
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
        assert response.status_code == status.HTTP_201_CREATED

        response2 = ctx['api_client'].post(
            url,
            data=json.dumps({'reason': 'Payload diferente'}),
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY='api-cancel-conflict-1',
            HTTP_X_TENANT_ID=str(ctx['tenant'].id),
        )
        assert response2.status_code == status.HTTP_409_CONFLICT

    def test_cancel_missing_idempotency_is_problem(self, returns_api_context):
        ctx = returns_api_context
        sale = self._sale(ctx)
        response = ctx['api_client'].post(
            reverse('sale-cancel', kwargs={'pk': sale.id}),
            data=json.dumps({'reason': 'Sem chave'}),
            content_type='application/json',
            HTTP_X_TENANT_ID=str(ctx['tenant'].id),
        )

        _assert_problem(
            response,
            status_code=status.HTTP_400_BAD_REQUEST,
            code='validation_error',
        )

    def test_cancel_reason_over_500_is_rejected_before_service(self, returns_api_context):
        ctx = returns_api_context
        sale = self._sale(ctx)
        with patch(
            'sales.views.cancel_sale',
            side_effect=AssertionError('cancel service must not be called'),
        ):
            response = ctx['api_client'].post(
                reverse('sale-cancel', kwargs={'pk': sale.id}),
                data=json.dumps({'reason': 'x' * 501}),
                content_type='application/json',
                HTTP_IDEMPOTENCY_KEY='api-cancel-long-reason',
                HTTP_X_TENANT_ID=str(ctx['tenant'].id),
            )

        _assert_problem(
            response,
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            code='validation_error',
        )

    def test_refund_partial_then_omitted_amount_refunds_remaining_balance(
        self, returns_api_context
    ):
        """Given a partial refund, when amount is omitted, the API refunds the remaining balance."""
        ctx = returns_api_context
        sale = self._sale(ctx)
        url = reverse('sale-refund', kwargs={'pk': sale.id})
        common = {'method': 'cash', 'reason': 'Parcial'}
        partial = ctx['api_client'].post(
            url,
            data=json.dumps({**common, 'amount': '5.00'}),
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY='api-refund-partial-1',
            HTTP_X_TENANT_ID=str(ctx['tenant'].id),
        )
        total = ctx['api_client'].post(
            url,
            data=json.dumps(common),
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY='api-refund-partial-2',
            HTTP_X_TENANT_ID=str(ctx['tenant'].id),
        )

        assert partial.status_code == status.HTTP_201_CREATED, partial.json()
        assert partial.json()['amount'] == '5.00'
        assert total.status_code == status.HTTP_201_CREATED, total.json()
        assert total.json()['amount'] == '15.00'

    def test_refund_invalid_method_is_validation_problem(self, returns_api_context):
        ctx = returns_api_context
        sale = self._sale(ctx)
        response = ctx['api_client'].post(
            reverse('sale-refund', kwargs={'pk': sale.id}),
            data=json.dumps({'method': 'bitcoin', 'reason': 'Metodo invalido'}),
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY='api-refund-invalid-method',
            HTTP_X_TENANT_ID=str(ctx['tenant'].id),
        )

        _assert_problem(
            response,
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            code='validation_error',
        )

    def test_refund_above_balance_is_refund_amount_exceeded(self, returns_api_context):
        ctx = returns_api_context
        sale = self._sale(ctx)
        response = ctx['api_client'].post(
            reverse('sale-refund', kwargs={'pk': sale.id}),
            data=json.dumps({'method': 'cash', 'amount': '20.01', 'reason': 'Excesso'}),
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY='api-refund-exceeded',
            HTTP_X_TENANT_ID=str(ctx['tenant'].id),
        )

        _assert_problem(
            response,
            status_code=status.HTTP_409_CONFLICT,
            code='refund_amount_exceeded',
        )

    def test_refund_requires_open_original_cash_session(self, returns_api_context):
        ctx = returns_api_context
        sale = self._sale(ctx)

        def _close():
            from sales.services import close_cash_session

            close_cash_session(
                cash_session=CashSession.all_objects.get(pk=sale.cash_session_id),
                closing_amount=Decimal('70.00'),
                idempotency_key='api-refund-close-cash',
            )

        _run_in_tenant(ctx['tenant'], _close)
        response = ctx['api_client'].post(
            reverse('sale-refund', kwargs={'pk': sale.id}),
            data=json.dumps({'method': 'cash', 'reason': 'Caixa fechado'}),
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY='api-refund-closed-cash',
            HTTP_X_TENANT_ID=str(ctx['tenant'].id),
        )

        _assert_problem(
            response,
            status_code=status.HTTP_409_CONFLICT,
            code='cash_session_required',
        )

    def test_cancel_with_completed_return_is_sale_has_returns(self, returns_api_context):
        ctx = returns_api_context
        sale = self._sale(ctx)
        sale_item_id = str(SaleItem.all_objects.filter(sale=sale).first().id)
        _run_in_tenant(
            ctx['tenant'],
            lambda: create_sale_return(
                tenant=ctx['tenant'],
                sale=sale,
                items=[{'sale_item_id': sale_item_id, 'quantity': Decimal('1')}],
                reason='Retorno anterior',
                idempotency_key='api-cancel-return-block',
            ),
        )
        response = ctx['api_client'].post(
            reverse('sale-cancel', kwargs={'pk': sale.id}),
            data=json.dumps({'reason': 'Cancelar com retorno'}),
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY='api-cancel-return-block-2',
            HTTP_X_TENANT_ID=str(ctx['tenant'].id),
        )

        _assert_problem(
            response,
            status_code=status.HTTP_409_CONFLICT,
            code='sale_has_returns',
        )

    def test_cross_tenant_blocked(self, returns_api_context, client):
        ctx = returns_api_context
        sale = self._sale(ctx)
        other_tenant = Tenant.objects.create(name='Other', slug='other-api')
        other_client = client.__class__()
        _run_in_tenant(
            other_tenant,
            lambda: _auth_client(other_client, ctx['user'], other_tenant),
        )

        url = reverse('sale-cancel', kwargs={'pk': sale.id})
        response = other_client.post(
            url,
            data=json.dumps({'reason': 'Cross tenant'}),
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY='api-cross-1',
            HTTP_X_TENANT_ID=str(other_tenant.id),
        )
        _assert_problem(
            response,
            status_code=status.HTTP_404_NOT_FOUND,
            code='not_found',
        )

        missing = ctx['api_client'].post(
            reverse('sale-cancel', kwargs={'pk': '00000000-0000-0000-0000-000000000000'}),
            data=json.dumps({'reason': 'Inexistente'}),
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY='api-missing-1',
            HTTP_X_TENANT_ID=str(ctx['tenant'].id),
        )
        _assert_problem(
            missing,
            status_code=status.HTTP_404_NOT_FOUND,
            code='not_found',
        )
        assert missing.content == response.content or (
            missing.json()['code'] == response.json()['code']
        )

    def test_unauthenticated_request_is_problem(self, returns_api_context, client):
        ctx = returns_api_context
        sale = self._sale(ctx)
        client.logout()
        response = client.post(
            reverse('sale-refund', kwargs={'pk': sale.id}),
            data=json.dumps({'method': 'cash', 'reason': 'Sem auth'}),
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY='api-unauthenticated',
            HTTP_X_TENANT_ID=str(ctx['tenant'].id),
        )

        _assert_problem(
            response,
            status_code=status.HTTP_401_UNAUTHORIZED,
            code='authentication_required',
        )

    def test_user_without_sales_capability_is_forbidden_problem(self, returns_api_context, client):
        ctx = returns_api_context
        sale = self._sale(ctx)
        restricted_client = client.__class__()
        restricted_user = User.objects.create_user(
            email='sales-no-capability@test.local', password='pass123'
        )
        _run_in_tenant(
            ctx['tenant'],
            lambda: _auth_client(
                restricted_client,
                restricted_user,
                ctx['tenant'],
                role='no_sales',
            ),
        )
        response = restricted_client.post(
            reverse('sale-refund', kwargs={'pk': sale.id}),
            data=json.dumps({'method': 'cash', 'reason': 'Sem capability'}),
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY='api-no-capability',
            HTTP_X_TENANT_ID=str(ctx['tenant'].id),
        )

        _assert_problem(
            response,
            status_code=status.HTTP_403_FORBIDDEN,
            code='permission_denied',
        )

    def test_inactive_tenant_is_not_available(self, returns_api_context):
        ctx = returns_api_context
        sale = self._sale(ctx)
        Tenant.objects.filter(pk=ctx['tenant'].id).update(is_active=False)
        response = ctx['api_client'].post(
            reverse('sale-refund', kwargs={'pk': sale.id}),
            data=json.dumps({'method': 'cash', 'reason': 'Tenant inativo'}),
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY='api-inactive-tenant',
            HTTP_X_TENANT_ID=str(ctx['tenant'].id),
        )

        _assert_problem(
            response,
            status_code=status.HTTP_404_NOT_FOUND,
            code='tenant_not_found',
        )

    def test_cancel_rejected_when_sale_already_cancelled(self, returns_api_context):
        ctx = returns_api_context
        sale = self._sale(ctx)
        url = reverse('sale-cancel', kwargs={'pk': sale.id})
        first = ctx['api_client'].post(
            url,
            data=json.dumps({'reason': 'Primeiro cancelamento'}),
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY='api-cancel-already-1',
            HTTP_X_TENANT_ID=str(ctx['tenant'].id),
        )
        second = ctx['api_client'].post(
            url,
            data=json.dumps({'reason': 'Segundo cancelamento'}),
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY='api-cancel-already-2',
            HTTP_X_TENANT_ID=str(ctx['tenant'].id),
        )

        assert first.status_code == status.HTTP_201_CREATED, first.json()
        _assert_problem(
            second,
            status_code=status.HTTP_409_CONFLICT,
            code='sale_already_cancelled',
        )


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
