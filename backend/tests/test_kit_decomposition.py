import uuid
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.db import connection

from catalog.models import Product, ProductComposition, Unit
from catalog.services.product_extensions import resolve_composition
from inventory.kit_decomposition import InsufficientComponentStock, decompose_kit_sale
from inventory.models import StockBalance, StockLocation
from sales.models import CashSession, Sale
from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Branch, Company, Tenant

User = get_user_model()


def _run_in_tenant(tenant, callback):
    token = set_current_tenant_id(tenant.id)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SET app.current_tenant_id = %s', [str(tenant.id)])
        return callback()
    finally:
        reset_current_tenant_id(token)


def _build_kit_context():
    tenant = Tenant.objects.create(name='S23-Decompose', slug='s23-decomp')
    user = User.objects.create_user(email='s23dec@test.local', password='pass123')

    def _create():
        unit = Unit.all_objects.create(tenant=tenant, symbol='UN', name='Un')
        comp1 = Product.all_objects.create(
            tenant=tenant, sku='COMP-1', name='Comp1', base_unit=unit,
        )
        comp2 = Product.all_objects.create(
            tenant=tenant, sku='COMP-2', name='Comp2', base_unit=unit,
        )
        kit = Product.all_objects.create(
            tenant=tenant, sku='DECOMP-KIT', name='Kit', base_unit=unit, product_kind='kit',
        )

        company = Company.all_objects.create(tenant=tenant, name='DecompCo')
        branch = Branch.all_objects.create(tenant=tenant, company=company, name='DecompBranch')
        location = StockLocation.all_objects.create(
            tenant=tenant, branch=branch, code='DEFAULT', name='Default', is_primary=True,
        )

        StockBalance.all_objects.create(
            tenant=tenant, product=comp1, location=location, quantity=Decimal('50'),
        )
        StockBalance.all_objects.create(
            tenant=tenant, product=comp2, location=location, quantity=Decimal('50'),
        )

        ProductComposition.all_objects.create(
            tenant=tenant, kit=kit, component=comp1, quantity=Decimal('1'),
        )
        ProductComposition.all_objects.create(
            tenant=tenant, kit=kit, component=comp2, quantity=Decimal('2'),
        )

        cash_session = CashSession.all_objects.create(
            tenant=tenant,
            branch=branch,
            operator=user,
            opening_amount=Decimal('0'),
            expected_amount=Decimal('0'),
        )
        sale = Sale.all_objects.create(
            tenant=tenant,
            branch=branch,
            cash_session=cash_session,
            operator=user,
            status='confirmed',
            gross_total=Decimal('100'),
            discount_total=Decimal('0'),
            net_total=Decimal('100'),
        )

        return {
            'tenant': tenant,
            'unit': unit,
            'kit': kit,
            'comp1': comp1,
            'comp2': comp2,
            'branch': branch,
            'location': location,
            'sale': sale,
        }

    return _run_in_tenant(tenant, _create)


@pytest.fixture
def kit_setup():
    return _build_kit_context()


@pytest.mark.django_db
def test_decompose_kit_creates_movements(kit_setup):
    ctx = kit_setup
    event_id = uuid.uuid4()
    movements = decompose_kit_sale(
        tenant=ctx['tenant'], sale=ctx['sale'], kit_product=ctx['kit'],
        kit_quantity=Decimal('5'), sale_event_id=str(event_id),
        location=ctx['location'],
    )
    assert len(movements) == 2
    quantities = {m.product_id: m.quantity for m in movements}
    assert quantities[ctx['comp1'].id] == Decimal('5')
    assert quantities[ctx['comp2'].id] == Decimal('10')


@pytest.mark.django_db
def test_decompose_kit_idempotent(kit_setup):
    ctx = kit_setup
    event_id = uuid.uuid4()
    decompose_kit_sale(
        tenant=ctx['tenant'], sale=ctx['sale'], kit_product=ctx['kit'],
        kit_quantity=Decimal('1'), sale_event_id=str(event_id),
        location=ctx['location'],
    )
    movements2 = decompose_kit_sale(
        tenant=ctx['tenant'], sale=ctx['sale'], kit_product=ctx['kit'],
        kit_quantity=Decimal('1'), sale_event_id=str(event_id),
        location=ctx['location'],
    )
    assert movements2 == []


@pytest.mark.django_db
def test_insufficient_stock_blocked(kit_setup):
    ctx = kit_setup
    event_id = uuid.uuid4()
    with pytest.raises(InsufficientComponentStock):
        decompose_kit_sale(
            tenant=ctx['tenant'], sale=ctx['sale'], kit_product=ctx['kit'],
            kit_quantity=Decimal('100'),
            sale_event_id=str(event_id),
            location=ctx['location'],
        )


@pytest.mark.django_db
def test_resolve_composition_returns_correct_quantities(kit_setup):
    ctx = kit_setup
    data = resolve_composition(tenant=ctx['tenant'], kit_product_id=ctx['kit'].id)
    assert len(data) == 2
    comp_ids_qtys = {(row[0], row[2]) for row in data}
    assert (ctx['comp1'].id, Decimal('1')) in comp_ids_qtys
    assert (ctx['comp2'].id, Decimal('2')) in comp_ids_qtys


@pytest.mark.django_db
def test_decompose_kit_updates_stock_balances(kit_setup):
    ctx = kit_setup
    event_id = uuid.uuid4()
    decompose_kit_sale(
        tenant=ctx['tenant'], sale=ctx['sale'], kit_product=ctx['kit'],
        kit_quantity=Decimal('5'), sale_event_id=str(event_id),
        location=ctx['location'],
    )
    b1 = StockBalance.all_objects.get(
        tenant=ctx['tenant'], product=ctx['comp1'], location=ctx['location'],
    )
    b2 = StockBalance.all_objects.get(
        tenant=ctx['tenant'], product=ctx['comp2'], location=ctx['location'],
    )
    assert b1.quantity == Decimal('45')   # 50 - 5*1
    assert b2.quantity == Decimal('40')   # 50 - 5*2
