"""Sprint 26 — Verify service sale does not generate stock movement."""

from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.utils import timezone

from catalog.models import Product, ProductPrice, Unit
from inventory.models import StockBalance, StockLocation, StockMovement
from inventory.services import InsufficientStock, create_receipt
from sales.models import CashMovement, Sale, SalePayment
from sales.services import create_counter_sale, open_cash_session
from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Branch, Company, Tenant


def _sale_context(*, stock=10):
    """Create a minimal tenant/branch/product context for sale invariants."""
    User = get_user_model()
    tenant = Tenant.objects.create(name='Sale invariants', slug=f'sale-invariants-{stock}')
    user = User.objects.create_user(email=f'sale-{stock}@test.local', password='pass')
    token = set_current_tenant_id(tenant.id)
    with connection.cursor() as c:
        c.execute('SET app.current_tenant_id = %s', [str(tenant.id)])
    unit = Unit.objects.create(tenant=tenant, symbol='UN', name='Un')
    company = Company.objects.create(tenant=tenant, name='Co')
    branch = Branch.objects.create(tenant=tenant, company=company, name='Br')
    location = StockLocation.objects.create(
        tenant=tenant, branch=branch, code='SALE', name='Loc', is_primary=True
    )
    product = Product.objects.create(
        tenant=tenant, sku=f'SALE-{stock}', name='Prod', base_unit=unit, tracks_inventory=True
    )
    ProductPrice.objects.create(
        tenant=tenant, product=product, amount=Decimal('10.00'), valid_from=timezone.now()
    )
    create_receipt(
        tenant, branch, product, location, Decimal(str(stock)), unit, Decimal('1'),
        idempotency_key=f'seed-{stock}', actor=user, reason='seed',
    )
    open_cash_session(
        tenant=tenant, branch=branch, operator=user, opening_amount=Decimal('0'),
        idempotency_key=f'cash-{stock}',
    )
    return tenant, user, unit, branch, location, product, token


def _require_stock_policy_schema():
    if 'inventory_productstockpolicy' not in connection.introspection.table_names():
        pytest.skip(
            'Schema blocker: inventory_productstockpolicy is missing; '
            'apply inventory migration 0006 before exercising insufficient-stock paths.'
        )


@pytest.mark.django_db
def test_mixed_sale_only_product_generates_movement():
    User = get_user_model()
    tenant = Tenant.objects.create(name='S26 Mixed', slug='s26-mixed')
    user = User.objects.create_user(email='s26mixed@test.local', password='pass')
    token = set_current_tenant_id(tenant.id)
    with connection.cursor() as c:
        c.execute('SET app.current_tenant_id = %s', [str(tenant.id)])
    unit = Unit.objects.create(tenant=tenant, symbol='UN', name='Un')
    company = Company.objects.create(tenant=tenant, name='Co')
    branch = Branch.objects.create(tenant=tenant, company=company, name='Br')
    loc = StockLocation.objects.create(
        tenant=tenant, branch=branch, code='MIX', name='Loc', is_primary=True
    )
    product = Product.objects.create(
        tenant=tenant, sku='MIX-PROD', name='Prod', base_unit=unit, tracks_inventory=True
    )
    service = Product.objects.create(
        tenant=tenant,
        sku='MIX-SERV',
        name='Serv',
        base_unit=unit,
        product_kind='servico',
        tracks_inventory=False,
    )
    ProductPrice.objects.create(
        tenant=tenant, product=product, amount=Decimal('100.00'), valid_from=timezone.now()
    )
    ProductPrice.objects.create(
        tenant=tenant, product=service, amount=Decimal('100.00'), valid_from=timezone.now()
    )
    # Stock the product
    create_receipt(
        tenant,
        branch,
        product,
        loc,
        Decimal('50'),
        unit,
        Decimal('1'),
        idempotency_key='mix-stock',
        actor=user,
        reason='seed',
    )
    # Open cash session
    open_cash_session(
        tenant=tenant,
        branch=branch,
        operator=user,
        opening_amount=Decimal('100'),
        idempotency_key='mix-cash',
    )
    # Count movements before sale
    before = StockMovement.objects.filter(tenant=tenant).count()
    # Create sale with product + service
    create_counter_sale(
        tenant=tenant,
        branch=branch,
        operator=user,
        stock_location=loc,
        items=[
            {'product': product, 'unit': unit, 'quantity': Decimal('1'), 'factor': Decimal('1')},
            {'product': service, 'unit': unit, 'quantity': Decimal('1'), 'factor': Decimal('1')},
        ],
        payments=[{'method': 'cash', 'amount': Decimal('200.00')}],
        idempotency_key='mixed-sale',
    )
    after = StockMovement.objects.filter(tenant=tenant).count()
    reset_current_tenant_id(token)
    # Only 1 new movement (for the product), not 2
    assert after - before == 1


@pytest.mark.django_db
def test_counter_sale_reduces_stock_by_sold_quantity_and_replay_is_side_effect_free():
    tenant, user, unit, branch, location, product, token = _sale_context(stock=10)
    try:
        first = create_counter_sale(
            tenant=tenant, branch=branch, operator=user, stock_location=location,
            items=[
                {'product': product, 'unit': unit, 'quantity': Decimal('3'), 'factor': Decimal('1')}
            ],
            payments=[{'method': 'cash', 'amount': Decimal('30.00')}],
            idempotency_key='sale-replay',
        )
        balance = StockBalance.all_objects.get(
            tenant=tenant, product=product, location=location, lot=None
        )
        movement_count = StockMovement.all_objects.filter(tenant=tenant).count()
        payment_count = SalePayment.all_objects.filter(sale=first).count()
        cash_payment_count = CashMovement.all_objects.filter(
            cash_session=first.cash_session, movement_type='sale_payment'
        ).count()

        replay = create_counter_sale(
            tenant=tenant, branch=branch, operator=user, stock_location=location,
            items=[
                {'product': product, 'unit': unit, 'quantity': Decimal('3'), 'factor': Decimal('1')}
            ],
            payments=[{'method': 'cash', 'amount': Decimal('30.00')}],
            idempotency_key='sale-replay',
        )

        balance.refresh_from_db()
        assert replay.id == first.id
        assert balance.quantity == Decimal('7.000000')
        assert StockMovement.all_objects.filter(tenant=tenant).count() == movement_count
        assert SalePayment.all_objects.filter(sale=first).count() == payment_count
        assert CashMovement.all_objects.filter(
            cash_session=first.cash_session, movement_type='sale_payment'
        ).count() == cash_payment_count
    finally:
        reset_current_tenant_id(token)


@pytest.mark.django_db
def test_insufficient_stock_rolls_back_sale_payment_and_movement():
    _require_stock_policy_schema()
    tenant, user, unit, branch, location, product, token = _sale_context(stock=8)
    try:
        before_movements = StockMovement.all_objects.filter(tenant=tenant).count()
        before_sales = Sale.all_objects.filter(tenant=tenant).count()
        before_payments = SalePayment.all_objects.filter(tenant=tenant).count()
        before_cash_payments = CashMovement.all_objects.filter(
            tenant=tenant, movement_type='sale_payment'
        ).count()
        with pytest.raises(InsufficientStock):
            create_counter_sale(
                tenant=tenant, branch=branch, operator=user, stock_location=location,
                items=[
                    {
                        'product': product,
                        'unit': unit,
                        'quantity': Decimal('9'),
                        'factor': Decimal('1'),
                    }
                ],
                payments=[{'method': 'cash', 'amount': Decimal('90.00')}],
                idempotency_key='sale-insufficient',
            )
        balance = StockBalance.all_objects.get(
            tenant=tenant, product=product, location=location, lot=None
        )
        assert balance.quantity == Decimal('8.000000')
        assert StockMovement.all_objects.filter(tenant=tenant).count() == before_movements
        assert Sale.all_objects.filter(tenant=tenant).count() == before_sales
        assert SalePayment.all_objects.filter(tenant=tenant).count() == before_payments
        assert CashMovement.all_objects.filter(
            tenant=tenant, movement_type='sale_payment'
        ).count() == before_cash_payments
    finally:
        reset_current_tenant_id(token)


@pytest.mark.django_db
def test_non_stock_product_sale_does_not_create_stock_movement():
    tenant, user, unit, branch, location, _product, token = _sale_context(stock=10)
    service = Product.objects.create(
        tenant=tenant, sku='SALE-SERVICE', name='Serv', base_unit=unit,
        product_kind='servico', tracks_inventory=False,
    )
    ProductPrice.objects.create(
        tenant=tenant, product=service, amount=Decimal('10.00'), valid_from=timezone.now()
    )
    try:
        before = StockMovement.all_objects.filter(tenant=tenant).count()
        sale = create_counter_sale(
            tenant=tenant, branch=branch, operator=user, stock_location=location,
            items=[
                {'product': service, 'unit': unit, 'quantity': Decimal('1'), 'factor': Decimal('1')}
            ],
            payments=[{'method': 'cash', 'amount': Decimal('10.00')}],
            idempotency_key='sale-service',
        )
        assert sale.items.get().stock_operation is None
        assert StockMovement.all_objects.filter(tenant=tenant).count() == before
    finally:
        reset_current_tenant_id(token)


@pytest.mark.django_db
def test_mixed_sale_is_atomic_when_later_item_is_insufficient():
    _require_stock_policy_schema()
    tenant, user, unit, branch, location, product, token = _sale_context(stock=10)
    second = Product.objects.create(
        tenant=tenant, sku='SALE-SECOND', name='Second', base_unit=unit, tracks_inventory=True
    )
    ProductPrice.objects.create(
        tenant=tenant, product=second, amount=Decimal('10.00'), valid_from=timezone.now()
    )
    try:
        before = StockMovement.all_objects.filter(tenant=tenant).count()
        before_cash_payments = CashMovement.all_objects.filter(
            tenant=tenant, movement_type='sale_payment'
        ).count()
        with pytest.raises(InsufficientStock):
            create_counter_sale(
                tenant=tenant, branch=branch, operator=user, stock_location=location,
                items=[
                    {
                        'product': product,
                        'unit': unit,
                        'quantity': Decimal('3'),
                        'factor': Decimal('1'),
                    },
                    {
                        'product': second,
                        'unit': unit,
                        'quantity': Decimal('1'),
                        'factor': Decimal('1'),
                    },
                ],
                payments=[{'method': 'cash', 'amount': Decimal('40.00')}],
                idempotency_key='sale-mixed-atomic',
            )
        first_balance = StockBalance.all_objects.get(
            tenant=tenant, product=product, location=location, lot=None
        )
        second_balance = StockBalance.all_objects.filter(
            tenant=tenant, product=second, location=location, lot=None
        ).first()
        assert first_balance.quantity == Decimal('10.000000')
        assert second_balance is None or second_balance.quantity == Decimal('0.000000')
        assert StockMovement.all_objects.filter(tenant=tenant).count() == before
        assert not Sale.all_objects.filter(
            tenant=tenant, idempotency_key='sale-mixed-atomic'
        ).exists()
        assert not SalePayment.all_objects.filter(tenant=tenant).exists()
        assert CashMovement.all_objects.filter(
            tenant=tenant, movement_type='sale_payment'
        ).count() == before_cash_payments
    finally:
        reset_current_tenant_id(token)
