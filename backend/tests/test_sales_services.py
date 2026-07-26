from decimal import Decimal

import pytest
from django.db import connection
from django.utils import timezone

from catalog.models import Product, ProductPrice, Unit
from inventory.models import StockBalance, StockLocation
from inventory.services import create_receipt
from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Branch, Company, Tenant


def run_in_tenant(tenant, callback):
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
def sales_context(django_user_model):
    tenant = Tenant.objects.create(name='Sales Tenant', slug='sales-tenant')
    user = django_user_model.objects.create_user(
        email='seller@test.local',
        password='pass123',
    )

    def _create():
        unit = Unit.all_objects.create(
            tenant=tenant,
            symbol='UN',
            name='Unidade',
            precision=0,
        )
        product = Product.all_objects.create(
            tenant=tenant,
            sku='SALE-PROD',
            name='Produto Venda',
            base_unit=unit,
        )
        ProductPrice.all_objects.create(
            tenant=tenant,
            product=product,
            amount=Decimal('10.00'),
            valid_from=timezone.now(),
        )
        company = Company.all_objects.create(tenant=tenant, name='Empresa Venda')
        branch = Branch.all_objects.create(
            tenant=tenant,
            company=company,
            name='Filial Venda',
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
            Decimal('5'),
            unit,
            Decimal('1'),
            idempotency_key='sales-seed-stock',
            actor=user,
            reason='seed sale stock',
        )
        return {
            'tenant': tenant,
            'user': user,
            'unit': unit,
            'product': product,
            'branch': branch,
            'location': location,
        }

    return run_in_tenant(tenant, _create)


@pytest.mark.django_db
def test_open_cash_session_is_idempotent(sales_context):
    from sales.services import open_cash_session

    ctx = sales_context

    def _test():
        first = open_cash_session(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            opening_amount=Decimal('100.00'),
            idempotency_key='cash-open-1',
        )
        replay = open_cash_session(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            opening_amount=Decimal('100.00'),
            idempotency_key='cash-open-1',
        )

        assert replay.id == first.id
        assert first.status == 'open'
        assert first.opening_amount == Decimal('100.00')

    run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_counter_sale_requires_open_cash_session(sales_context):
    from sales.services import CashSessionRequired, create_counter_sale

    ctx = sales_context

    def _test():
        with pytest.raises(CashSessionRequired):
            create_counter_sale(
                tenant=ctx['tenant'],
                branch=ctx['branch'],
                operator=ctx['user'],
                stock_location=ctx['location'],
                items=[
                    {
                        'product': ctx['product'],
                        'unit': ctx['unit'],
                        'quantity': Decimal('1'),
                        'factor': Decimal('1'),
                    }
                ],
                payments=[{'method': 'cash', 'amount': Decimal('10.00')}],
                idempotency_key='sale-without-cash',
            )

    run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_counter_sale_records_payment_and_deducts_stock(sales_context):
    from sales.models import CashMovement, SalePayment
    from sales.services import create_counter_sale, open_cash_session

    ctx = sales_context

    def _test():
        session = open_cash_session(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            opening_amount=Decimal('50.00'),
            idempotency_key='cash-open-sale',
        )

        sale = create_counter_sale(
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
            idempotency_key='counter-sale-1',
        )

        balance = StockBalance.all_objects.get(
            tenant=ctx['tenant'],
            product=ctx['product'],
            location=ctx['location'],
            lot=None,
        )
        assert sale.cash_session_id == session.id
        assert sale.status == 'confirmed'
        assert sale.gross_total == Decimal('20.00')
        assert sale.net_total == Decimal('20.00')
        assert sale.items.count() == 1
        assert SalePayment.all_objects.filter(sale=sale, amount=Decimal('20.00')).exists()
        assert CashMovement.all_objects.filter(
            cash_session=session,
            movement_type='sale_payment',
            amount=Decimal('20.00'),
        ).exists()
        assert balance.quantity == Decimal('3.000000')

    run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_counter_sale_replay_returns_same_sale_and_changed_payload_conflicts(sales_context):
    from sales.services import DuplicateIdempotencyKey, create_counter_sale, open_cash_session

    ctx = sales_context

    def _test():
        open_cash_session(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            opening_amount=Decimal('0'),
            idempotency_key='cash-open-idem',
        )
        payload = {
            'tenant': ctx['tenant'],
            'branch': ctx['branch'],
            'operator': ctx['user'],
            'stock_location': ctx['location'],
            'items': [
                {
                    'product': ctx['product'],
                    'unit': ctx['unit'],
                    'quantity': Decimal('1'),
                    'factor': Decimal('1'),
                }
            ],
            'payments': [{'method': 'cash', 'amount': Decimal('10.00')}],
            'idempotency_key': 'counter-sale-idem',
        }

        first = create_counter_sale(**payload)
        replay = create_counter_sale(**payload)
        changed = {**payload, 'payments': [{'method': 'cash', 'amount': Decimal('11.00')}]}

        assert replay.id == first.id
        with pytest.raises(DuplicateIdempotencyKey):
            create_counter_sale(**changed)

    run_in_tenant(ctx['tenant'], _test)
