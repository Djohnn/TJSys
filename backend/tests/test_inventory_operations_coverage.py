"""Testes de cobertura para inventory/services/operations.py."""

from datetime import date
from decimal import Decimal

import pytest
from django.db import connection

from catalog.models import Product, Unit
from inventory.models import (
    ProductStockPolicy,
    StockBalance,
    StockLocation,
    StockLot,
    StockOperation,
)
from inventory.services.operations import (
    ExpiredLotError,
    InsufficientStock,
    InvalidLotError,
    QuantityPrecisionError,
    _apply_balance_delta,
    _find_idempotent_operation,
    _get_balance,
    _json_default,
    _payload_hash,
    _validate_lot_rules,
    create_adjustment,
    create_issue,
    create_operation,
    create_receipt,
    create_stock_movement,
    create_transfer,
    get_available_stock,
    get_stock_balance,
    normalize_quantity,
    process_operation,
    reconcile_stock_balances,
    release_reservation,
    reserve_stock,
    reverse_operation,
)
from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Branch, Company


def _run_in_tenant(tenant, callback):
    token = set_current_tenant_id(tenant.id)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT set_config('app.current_tenant_id', %s, true)",
                [str(tenant.id)],
            )
        return callback()
    finally:
        reset_current_tenant_id(token)


# ── Fixtures locais ──────────────────────────────────────────────────


@pytest.fixture
def ctx(inv_tenant):
    """Cria infra base: company, branch, location, unit, product."""

    def _create():
        company = Company.objects.create(tenant=inv_tenant, name='OpsCo')
        branch = Branch.objects.create(tenant=inv_tenant, company=company, name='OpsBranch')
        location = StockLocation.objects.create(
            tenant=inv_tenant, branch=branch, code='OPSW', name='Dep Ops'
        )
        unit = Unit.all_objects.create(
            tenant=inv_tenant, symbol='kg', name='Quilograma', precision=3
        )
        product = Product.all_objects.create(
            tenant=inv_tenant,
            sku='OPS-001',
            name='Produto Ops',
            base_unit=unit,
            requires_lot=False,
            requires_expiry=False,
        )
        return {
            'company': company,
            'branch': branch,
            'location': location,
            'unit': unit,
            'product': product,
        }

    return _run_in_tenant(inv_tenant, _create)


@pytest.fixture
def ctx_lot(inv_tenant):
    """Produto que exige lote + validade."""

    def _create():
        company = Company.objects.create(tenant=inv_tenant, name='LotCo')
        branch = Branch.objects.create(tenant=inv_tenant, company=company, name='LotBranch')
        location = StockLocation.objects.create(
            tenant=inv_tenant, branch=branch, code='LOTW', name='Dep Lot'
        )
        unit = Unit.all_objects.create(tenant=inv_tenant, symbol='un', name='Un', precision=0)
        product = Product.all_objects.create(
            tenant=inv_tenant,
            sku='LOT-001',
            name='Produto Lote',
            base_unit=unit,
            requires_lot=True,
            requires_expiry=True,
        )
        lot = StockLot.all_objects.create(
            tenant=inv_tenant,
            product=product,
            lot_number='L-100',
            manufacture_date=date(2024, 1, 1),
            expiry_date=date(2030, 12, 31),
        )
        return {
            'company': company,
            'branch': branch,
            'location': location,
            'unit': unit,
            'product': product,
            'lot': lot,
        }

    return _run_in_tenant(inv_tenant, _create)


@pytest.fixture
def ctx_branch2(inv_tenant):
    """Segunda filial para testes de transferência."""

    def _create():
        company = Company.objects.create(tenant=inv_tenant, name='XferCo')
        b1 = Branch.objects.create(tenant=inv_tenant, company=company, name='SrcBranch')
        b2 = Branch.objects.create(tenant=inv_tenant, company=company, name='DstBranch')
        loc1 = StockLocation.objects.create(tenant=inv_tenant, branch=b1, code='SRC', name='Origem')
        loc2 = StockLocation.objects.create(
            tenant=inv_tenant, branch=b2, code='DST', name='Destino'
        )
        unit = Unit.all_objects.create(tenant=inv_tenant, symbol='un', name='Un', precision=0)
        product = Product.all_objects.create(
            tenant=inv_tenant,
            sku='XFER-001',
            name='Produto Xfer',
            base_unit=unit,
            requires_lot=False,
            requires_expiry=False,
        )
        return {
            'branch1': b1,
            'branch2': b2,
            'loc1': loc1,
            'loc2': loc2,
            'unit': unit,
            'product': product,
        }

    return _run_in_tenant(inv_tenant, _create)


@pytest.fixture
def ctx_notrack(inv_tenant):
    """Produto que NÃO rastreia estoque."""

    def _create():
        company = Company.objects.create(tenant=inv_tenant, name='NTCo')
        branch = Branch.objects.create(tenant=inv_tenant, company=company, name='NTBranch')
        location = StockLocation.objects.create(
            tenant=inv_tenant, branch=branch, code='NTW', name='Dep NT'
        )
        unit = Unit.all_objects.create(tenant=inv_tenant, symbol='un', name='Un', precision=0)
        product = Product.all_objects.create(
            tenant=inv_tenant,
            sku='NT-001',
            name='Produto NT',
            base_unit=unit,
            tracks_inventory=False,
        )
        return {
            'branch': branch,
            'location': location,
            'unit': unit,
            'product': product,
        }

    return _run_in_tenant(inv_tenant, _create)


# ── normalize_quantity ───────────────────────────────────────────────


@pytest.mark.django_db
def test_normalize_quantity_valid(inv_tenant, ctx):
    result = _run_in_tenant(
        inv_tenant,
        lambda: normalize_quantity(Decimal('1.234'), ctx['unit']),
    )
    assert result == Decimal('1.234')


@pytest.mark.django_db
def test_normalize_quantity_precision_error(inv_tenant, ctx):
    unit = ctx['unit']  # precision=3
    with pytest.raises(QuantityPrecisionError):
        _run_in_tenant(
            inv_tenant,
            lambda: normalize_quantity(Decimal('1.2345'), unit),
        )


@pytest.mark.django_db
def test_normalize_quantity_zero_precision(inv_tenant):
    unit = _run_in_tenant(
        inv_tenant,
        lambda: Unit.all_objects.create(tenant=inv_tenant, symbol='un', name='Un', precision=0),
    )
    result = _run_in_tenant(inv_tenant, lambda: normalize_quantity(Decimal('5'), unit))
    assert result == Decimal('5')


@pytest.mark.django_db
def test_normalize_quantity_rejects_fractional_on_zero_precision(inv_tenant):
    unit = _run_in_tenant(
        inv_tenant,
        lambda: Unit.all_objects.create(tenant=inv_tenant, symbol='un', name='Un', precision=0),
    )
    with pytest.raises(QuantityPrecisionError):
        _run_in_tenant(
            inv_tenant,
            lambda: normalize_quantity(Decimal('5.5'), unit),
        )


# ── get_available_stock ─────────────────────────────────────────────


@pytest.mark.django_db
def test_get_available_stock_no_balance(inv_tenant, ctx):
    result = _run_in_tenant(
        inv_tenant,
        lambda: get_available_stock(inv_tenant, ctx['product'], ctx['location']),
    )
    assert result == Decimal('0')


@pytest.mark.django_db
def test_get_available_stock_with_balance(inv_tenant, ctx):
    def _setup():
        StockBalance.all_objects.create(
            tenant=inv_tenant,
            product=ctx['product'],
            location=ctx['location'],
            quantity=Decimal('100'),
            reserved=Decimal('20'),
        )

    _run_in_tenant(inv_tenant, _setup)

    qty = _run_in_tenant(
        inv_tenant,
        lambda: get_available_stock(inv_tenant, ctx['product'], ctx['location']),
    )
    assert qty == Decimal('100')

    avail = _run_in_tenant(
        inv_tenant,
        lambda: get_available_stock(
            inv_tenant,
            ctx['product'],
            ctx['location'],
            exclude_reserved=True,
        ),
    )
    assert avail == Decimal('80')


@pytest.mark.django_db
def test_get_available_stock_exclude_reserved_floor_zero(inv_tenant, ctx):
    def _setup():
        StockBalance.all_objects.create(
            tenant=inv_tenant,
            product=ctx['product'],
            location=ctx['location'],
            quantity=Decimal('5'),
            reserved=Decimal('10'),
        )

    _run_in_tenant(inv_tenant, _setup)

    avail = _run_in_tenant(
        inv_tenant,
        lambda: get_available_stock(
            inv_tenant,
            ctx['product'],
            ctx['location'],
            exclude_reserved=True,
        ),
    )
    assert avail == Decimal('0')


@pytest.mark.django_db
def test_get_available_stock_with_lot(inv_tenant, ctx_lot):
    def _setup():
        StockBalance.all_objects.create(
            tenant=inv_tenant,
            product=ctx_lot['product'],
            location=ctx_lot['location'],
            lot=ctx_lot['lot'],
            quantity=Decimal('50'),
            reserved=Decimal('0'),
        )

    _run_in_tenant(inv_tenant, _setup)

    qty = _run_in_tenant(
        inv_tenant,
        lambda: get_available_stock(
            inv_tenant,
            ctx_lot['product'],
            ctx_lot['location'],
            lot=ctx_lot['lot'],
        ),
    )
    assert qty == Decimal('50')


# ── reserve_stock / release_reservation ─────────────────────────────


@pytest.mark.django_db
def test_reserve_stock_success(inv_tenant, ctx):
    def _seed():
        StockBalance.all_objects.create(
            tenant=inv_tenant,
            product=ctx['product'],
            location=ctx['location'],
            quantity=Decimal('100'),
            reserved=Decimal('0'),
        )

    _run_in_tenant(inv_tenant, _seed)

    bal = _run_in_tenant(
        inv_tenant,
        lambda: reserve_stock(inv_tenant, ctx['product'], ctx['location'], Decimal('30')),
    )
    assert bal.reserved == Decimal('30')
    assert bal.quantity == Decimal('100')

    avail = _run_in_tenant(
        inv_tenant,
        lambda: get_available_stock(
            inv_tenant,
            ctx['product'],
            ctx['location'],
            exclude_reserved=True,
        ),
    )
    assert avail == Decimal('70')


@pytest.mark.django_db
def test_reserve_stock_insufficient(inv_tenant, ctx):
    def _seed():
        StockBalance.all_objects.create(
            tenant=inv_tenant,
            product=ctx['product'],
            location=ctx['location'],
            quantity=Decimal('10'),
            reserved=Decimal('0'),
        )

    _run_in_tenant(inv_tenant, _seed)

    with pytest.raises(InsufficientStock):
        _run_in_tenant(
            inv_tenant,
            lambda: reserve_stock(inv_tenant, ctx['product'], ctx['location'], Decimal('15')),
        )


@pytest.mark.django_db
def test_reserve_stock_negative_rejected(inv_tenant, ctx):
    def _seed():
        StockBalance.all_objects.create(
            tenant=inv_tenant,
            product=ctx['product'],
            location=ctx['location'],
            quantity=Decimal('10'),
            reserved=Decimal('0'),
        )

    _run_in_tenant(inv_tenant, _seed)

    with pytest.raises(ValueError, match='must be positive'):
        _run_in_tenant(
            inv_tenant,
            lambda: reserve_stock(inv_tenant, ctx['product'], ctx['location'], Decimal('-1')),
        )


@pytest.mark.django_db
def test_release_reservation_success(inv_tenant, ctx):
    def _seed():
        StockBalance.all_objects.create(
            tenant=inv_tenant,
            product=ctx['product'],
            location=ctx['location'],
            quantity=Decimal('100'),
            reserved=Decimal('30'),
        )

    _run_in_tenant(inv_tenant, _seed)

    bal = _run_in_tenant(
        inv_tenant,
        lambda: release_reservation(inv_tenant, ctx['product'], ctx['location'], Decimal('10')),
    )
    assert bal.reserved == Decimal('20')


@pytest.mark.django_db
def test_release_reservation_caps_zero(inv_tenant, ctx):
    def _seed():
        StockBalance.all_objects.create(
            tenant=inv_tenant,
            product=ctx['product'],
            location=ctx['location'],
            quantity=Decimal('100'),
            reserved=Decimal('5'),
        )

    _run_in_tenant(inv_tenant, _seed)

    bal = _run_in_tenant(
        inv_tenant,
        lambda: release_reservation(inv_tenant, ctx['product'], ctx['location'], Decimal('20')),
    )
    assert bal.reserved == Decimal('0')


@pytest.mark.django_db
def test_release_reservation_negative_rejected(inv_tenant, ctx):
    def _seed():
        StockBalance.all_objects.create(
            tenant=inv_tenant,
            product=ctx['product'],
            location=ctx['location'],
            quantity=Decimal('100'),
            reserved=Decimal('30'),
        )

    _run_in_tenant(inv_tenant, _seed)

    with pytest.raises(ValueError, match='must be positive'):
        _run_in_tenant(
            inv_tenant,
            lambda: release_reservation(inv_tenant, ctx['product'], ctx['location'], Decimal('-1')),
        )


# ── _validate_lot_rules ─────────────────────────────────────────────


@pytest.mark.django_db
def test_validate_lot_rules_lot_required(inv_tenant):
    def _test():
        product = Product.all_objects.create(
            tenant=inv_tenant,
            sku='VLR-001',
            name='VL Prod',
            base_unit=Unit.all_objects.create(
                tenant=inv_tenant, symbol='un', name='Un', precision=0
            ),
            requires_lot=True,
        )
        with pytest.raises(InvalidLotError, match='requires a lot'):
            _validate_lot_rules(product, None)

    _run_in_tenant(inv_tenant, _test)


@pytest.mark.django_db
def test_validate_lot_rules_wrong_product(inv_tenant):
    def _test():
        unit = Unit.all_objects.create(tenant=inv_tenant, symbol='un', name='Un', precision=0)
        p1 = Product.all_objects.create(
            tenant=inv_tenant,
            sku='VLR-A',
            name='A',
            base_unit=unit,
            requires_lot=True,
        )
        p2 = Product.all_objects.create(
            tenant=inv_tenant,
            sku='VLR-B',
            name='B',
            base_unit=unit,
            requires_lot=False,
        )
        lot = StockLot.all_objects.create(tenant=inv_tenant, product=p1, lot_number='WRONG-LOT')
        with pytest.raises(InvalidLotError, match='same product'):
            _validate_lot_rules(p2, lot)

    _run_in_tenant(inv_tenant, _test)


@pytest.mark.django_db
def test_validate_lot_rules_expiry_required(inv_tenant):
    def _test():
        unit = Unit.all_objects.create(tenant=inv_tenant, symbol='un', name='Un', precision=0)
        product = Product.all_objects.create(
            tenant=inv_tenant,
            sku='VLR-EXP',
            name='Exp',
            base_unit=unit,
            requires_lot=False,
            requires_expiry=True,
        )
        with pytest.raises(InvalidLotError, match='expiry date'):
            _validate_lot_rules(product, None)

    _run_in_tenant(inv_tenant, _test)


@pytest.mark.django_db
def test_validate_lot_rules_expired_lot_rejected(inv_tenant):
    def _test():
        unit = Unit.all_objects.create(tenant=inv_tenant, symbol='un', name='Un', precision=0)
        product = Product.all_objects.create(
            tenant=inv_tenant,
            sku='VLR-OLD',
            name='Old',
            base_unit=unit,
            requires_lot=True,
        )
        lot = StockLot.all_objects.create(
            tenant=inv_tenant,
            product=product,
            lot_number='OLD-001',
            expiry_date=date(2020, 1, 1),
        )
        assert lot.is_expired
        with pytest.raises(ExpiredLotError):
            _validate_lot_rules(product, lot)

    _run_in_tenant(inv_tenant, _test)


@pytest.mark.django_db
def test_validate_lot_rules_expired_lot_allowed(inv_tenant):
    def _test():
        unit = Unit.all_objects.create(tenant=inv_tenant, symbol='un', name='Un', precision=0)
        product = Product.all_objects.create(
            tenant=inv_tenant,
            sku='VLR-AEX',
            name='AEX',
            base_unit=unit,
            requires_lot=True,
        )
        lot = StockLot.all_objects.create(
            tenant=inv_tenant,
            product=product,
            lot_number='AEX-001',
            expiry_date=date(2020, 1, 1),
        )
        assert lot.is_expired
        _validate_lot_rules(product, lot, allow_expired_lot=True)

    _run_in_tenant(inv_tenant, _test)


@pytest.mark.django_db
def test_validate_lot_rules_lot_without_expiry_on_requires_expiry(inv_tenant):
    def _test():
        unit = Unit.all_objects.create(tenant=inv_tenant, symbol='un', name='Un', precision=0)
        product = Product.all_objects.create(
            tenant=inv_tenant,
            sku='VLR-NOEXP',
            name='NoExp',
            base_unit=unit,
            requires_lot=True,
            requires_expiry=True,
        )
        lot = StockLot.all_objects.create(
            tenant=inv_tenant,
            product=product,
            lot_number='NOEXP-001',
            expiry_date=None,
        )
        with pytest.raises(InvalidLotError, match='expiry date'):
            _validate_lot_rules(product, lot)

    _run_in_tenant(inv_tenant, _test)


# ── create_receipt ───────────────────────────────────────────────────


@pytest.mark.django_db
def test_create_receipt_basic(inv_tenant, ctx):
    op = _run_in_tenant(
        inv_tenant,
        lambda: create_receipt(
            inv_tenant,
            ctx['branch'],
            ctx['product'],
            ctx['location'],
            Decimal('50'),
            ctx['unit'],
            Decimal('1'),
            idempotency_key='rcpt-001',
        ),
    )
    assert op.operation_type == 'receipt'

    mov_count = _run_in_tenant(
        inv_tenant,
        lambda: op.movements.count(),
    )
    assert mov_count == 1

    bal = _run_in_tenant(
        inv_tenant,
        lambda: get_available_stock(inv_tenant, ctx['product'], ctx['location']),
    )
    assert bal == Decimal('50')


@pytest.mark.django_db
def test_create_receipt_with_lot(inv_tenant, ctx_lot):
    op = _run_in_tenant(
        inv_tenant,
        lambda: create_receipt(
            inv_tenant,
            ctx_lot['branch'],
            ctx_lot['product'],
            ctx_lot['location'],
            Decimal('20'),
            ctx_lot['unit'],
            Decimal('1'),
            lot=ctx_lot['lot'],
            idempotency_key='rcpt-lot-001',
        ),
    )
    assert op.operation_type == 'receipt'

    mov_count = _run_in_tenant(
        inv_tenant,
        lambda: op.movements.count(),
    )
    assert mov_count == 1

    bal = _run_in_tenant(
        inv_tenant,
        lambda: get_available_stock(
            inv_tenant,
            ctx_lot['product'],
            ctx_lot['location'],
            lot=ctx_lot['lot'],
        ),
    )
    assert bal == Decimal('20')


@pytest.mark.django_db
def test_create_receipt_idempotent_replay(inv_tenant, ctx):
    op1 = _run_in_tenant(
        inv_tenant,
        lambda: create_receipt(
            inv_tenant,
            ctx['branch'],
            ctx['product'],
            ctx['location'],
            Decimal('10'),
            ctx['unit'],
            Decimal('1'),
            idempotency_key='rcpt-idem-001',
        ),
    )
    op2 = _run_in_tenant(
        inv_tenant,
        lambda: create_receipt(
            inv_tenant,
            ctx['branch'],
            ctx['product'],
            ctx['location'],
            Decimal('10'),
            ctx['unit'],
            Decimal('1'),
            idempotency_key='rcpt-idem-001',
        ),
    )
    assert op1.id == op2.id

    bal = _run_in_tenant(
        inv_tenant,
        lambda: get_available_stock(inv_tenant, ctx['product'], ctx['location']),
    )
    assert bal == Decimal('10')


@pytest.mark.django_db
def test_create_receipt_with_expiry(inv_tenant):
    def _create():
        company = Company.objects.create(tenant=inv_tenant, name='ExpCo')
        branch = Branch.objects.create(tenant=inv_tenant, company=company, name='ExpBr')
        location = StockLocation.objects.create(
            tenant=inv_tenant, branch=branch, code='EXP', name='Dep Exp'
        )
        unit = Unit.all_objects.create(tenant=inv_tenant, symbol='un', name='Un', precision=0)
        product = Product.all_objects.create(
            tenant=inv_tenant,
            sku='EXP-001',
            name='Produto Exp',
            base_unit=unit,
            requires_lot=True,
            requires_expiry=True,
        )
        lot = StockLot.all_objects.create(
            tenant=inv_tenant,
            product=product,
            lot_number='EXPL-001',
            expiry_date=date(2028, 6, 15),
        )
        return {
            'branch': branch,
            'location': location,
            'unit': unit,
            'product': product,
            'lot': lot,
        }

    c = _run_in_tenant(inv_tenant, _create)
    op = _run_in_tenant(
        inv_tenant,
        lambda: create_receipt(
            inv_tenant,
            c['branch'],
            c['product'],
            c['location'],
            Decimal('25'),
            c['unit'],
            Decimal('1'),
            lot=c['lot'],
            idempotency_key='rcpt-exp-001',
        ),
    )
    mov_count = _run_in_tenant(
        inv_tenant,
        lambda: op.movements.count(),
    )
    assert mov_count == 1
    mov = _run_in_tenant(
        inv_tenant,
        lambda: op.movements.first(),
    )
    assert mov.lot == c['lot']


# ── create_issue ─────────────────────────────────────────────────────


@pytest.mark.django_db
def test_create_issue_success(inv_tenant, ctx):
    _run_in_tenant(
        inv_tenant,
        lambda: create_receipt(
            inv_tenant,
            ctx['branch'],
            ctx['product'],
            ctx['location'],
            Decimal('50'),
            ctx['unit'],
            Decimal('1'),
            idempotency_key='iss-seed-001',
        ),
    )
    op = _run_in_tenant(
        inv_tenant,
        lambda: create_issue(
            inv_tenant,
            ctx['branch'],
            ctx['product'],
            ctx['location'],
            Decimal('15'),
            ctx['unit'],
            Decimal('1'),
            idempotency_key='iss-001',
        ),
    )
    assert op.operation_type == 'issue'

    mov_count = _run_in_tenant(
        inv_tenant,
        lambda: op.movements.count(),
    )
    assert mov_count == 1

    bal = _run_in_tenant(
        inv_tenant,
        lambda: get_available_stock(inv_tenant, ctx['product'], ctx['location']),
    )
    assert bal == Decimal('35')


@pytest.mark.django_db
def test_create_issue_insufficient_stock(inv_tenant, ctx):
    _run_in_tenant(
        inv_tenant,
        lambda: create_receipt(
            inv_tenant,
            ctx['branch'],
            ctx['product'],
            ctx['location'],
            Decimal('5'),
            ctx['unit'],
            Decimal('1'),
            idempotency_key='iss-low-seed',
        ),
    )
    with pytest.raises(InsufficientStock):
        _run_in_tenant(
            inv_tenant,
            lambda: create_issue(
                inv_tenant,
                ctx['branch'],
                ctx['product'],
                ctx['location'],
                Decimal('10'),
                ctx['unit'],
                Decimal('1'),
                idempotency_key='iss-low-001',
            ),
        )


@pytest.mark.django_db
def test_create_issue_non_tracked_returns_none(inv_tenant, ctx_notrack):
    result = _run_in_tenant(
        inv_tenant,
        lambda: create_issue(
            inv_tenant,
            ctx_notrack['branch'],
            ctx_notrack['product'],
            ctx_notrack['location'],
            Decimal('5'),
            ctx_notrack['unit'],
            Decimal('1'),
            idempotency_key='iss-nt-001',
        ),
    )
    assert result is None


@pytest.mark.django_db
def test_create_issue_idempotent(inv_tenant, ctx):
    _run_in_tenant(
        inv_tenant,
        lambda: create_receipt(
            inv_tenant,
            ctx['branch'],
            ctx['product'],
            ctx['location'],
            Decimal('50'),
            ctx['unit'],
            Decimal('1'),
            idempotency_key='iss-idem-seed',
        ),
    )
    op1 = _run_in_tenant(
        inv_tenant,
        lambda: create_issue(
            inv_tenant,
            ctx['branch'],
            ctx['product'],
            ctx['location'],
            Decimal('5'),
            ctx['unit'],
            Decimal('1'),
            idempotency_key='iss-idem-001',
        ),
    )
    op2 = _run_in_tenant(
        inv_tenant,
        lambda: create_issue(
            inv_tenant,
            ctx['branch'],
            ctx['product'],
            ctx['location'],
            Decimal('5'),
            ctx['unit'],
            Decimal('1'),
            idempotency_key='iss-idem-001',
        ),
    )
    assert op1.id == op2.id

    bal = _run_in_tenant(
        inv_tenant,
        lambda: get_available_stock(inv_tenant, ctx['product'], ctx['location']),
    )
    assert bal == Decimal('45')


# ── create_adjustment ───────────────────────────────────────────────


@pytest.mark.django_db
def test_create_adjustment_positive(inv_tenant, ctx):
    op = _run_in_tenant(
        inv_tenant,
        lambda: create_adjustment(
            inv_tenant,
            ctx['branch'],
            ctx['product'],
            ctx['location'],
            Decimal('20'),
            ctx['unit'],
            Decimal('1'),
            idempotency_key='adj-pos-001',
            reason='Contagem física',
        ),
    )
    assert op.operation_type == 'adjustment'
    mov = _run_in_tenant(
        inv_tenant,
        lambda: op.movements.first(),
    )
    assert mov.direction == 'in'

    bal = _run_in_tenant(
        inv_tenant,
        lambda: get_available_stock(inv_tenant, ctx['product'], ctx['location']),
    )
    assert bal == Decimal('20')


@pytest.mark.django_db
def test_create_adjustment_negative(inv_tenant, ctx):
    _run_in_tenant(
        inv_tenant,
        lambda: create_receipt(
            inv_tenant,
            ctx['branch'],
            ctx['product'],
            ctx['location'],
            Decimal('30'),
            ctx['unit'],
            Decimal('1'),
            idempotency_key='adj-seed',
        ),
    )
    op = _run_in_tenant(
        inv_tenant,
        lambda: create_adjustment(
            inv_tenant,
            ctx['branch'],
            ctx['product'],
            ctx['location'],
            Decimal('-5'),
            ctx['unit'],
            Decimal('1'),
            idempotency_key='adj-neg-001',
        ),
    )
    mov = _run_in_tenant(
        inv_tenant,
        lambda: op.movements.first(),
    )
    assert mov.direction == 'out'

    bal = _run_in_tenant(
        inv_tenant,
        lambda: get_available_stock(inv_tenant, ctx['product'], ctx['location']),
    )
    assert bal == Decimal('25')


@pytest.mark.django_db
def test_create_adjustment_idempotent(inv_tenant, ctx):
    op1 = _run_in_tenant(
        inv_tenant,
        lambda: create_adjustment(
            inv_tenant,
            ctx['branch'],
            ctx['product'],
            ctx['location'],
            Decimal('10'),
            ctx['unit'],
            Decimal('1'),
            idempotency_key='adj-idem-001',
        ),
    )
    op2 = _run_in_tenant(
        inv_tenant,
        lambda: create_adjustment(
            inv_tenant,
            ctx['branch'],
            ctx['product'],
            ctx['location'],
            Decimal('10'),
            ctx['unit'],
            Decimal('1'),
            idempotency_key='adj-idem-001',
        ),
    )
    assert op1.id == op2.id
    mov_count = _run_in_tenant(
        inv_tenant,
        lambda: op1.movements.count(),
    )
    assert mov_count == 1


@pytest.mark.django_db
def test_create_adjustment_expired_lot_allowed(inv_tenant):
    def _create():
        company = Company.objects.create(tenant=inv_tenant, name='AlExpCo')
        branch = Branch.objects.create(tenant=inv_tenant, company=company, name='AlExpBr')
        location = StockLocation.objects.create(
            tenant=inv_tenant, branch=branch, code='ALEXP', name='Dep AlExp'
        )
        unit = Unit.all_objects.create(tenant=inv_tenant, symbol='un', name='Un', precision=0)
        product = Product.all_objects.create(
            tenant=inv_tenant,
            sku='ALEXP-001',
            name='Produto AlExp',
            base_unit=unit,
            requires_lot=True,
        )
        lot = StockLot.all_objects.create(
            tenant=inv_tenant,
            product=product,
            lot_number='ALEXP-L1',
            expiry_date=date(2020, 1, 1),
        )
        return {
            'branch': branch,
            'location': location,
            'unit': unit,
            'product': product,
            'lot': lot,
        }

    c = _run_in_tenant(inv_tenant, _create)
    op = _run_in_tenant(
        inv_tenant,
        lambda: create_adjustment(
            inv_tenant,
            c['branch'],
            c['product'],
            c['location'],
            Decimal('10'),
            c['unit'],
            Decimal('1'),
            lot=c['lot'],
            idempotency_key='adj-exp-001',
            allow_expired_lot=True,
        ),
    )
    mov_count = _run_in_tenant(
        inv_tenant,
        lambda: op.movements.count(),
    )
    assert mov_count == 1


# ── create_transfer ─────────────────────────────────────────────────


@pytest.mark.django_db
def test_create_transfer_between_locations(inv_tenant, ctx_branch2):
    c = ctx_branch2
    _run_in_tenant(
        inv_tenant,
        lambda: create_receipt(
            inv_tenant,
            c['branch1'],
            c['product'],
            c['loc1'],
            Decimal('40'),
            c['unit'],
            Decimal('1'),
            idempotency_key='xfer-seed',
        ),
    )
    op = _run_in_tenant(
        inv_tenant,
        lambda: create_transfer(
            inv_tenant,
            c['branch1'],
            c['branch2'],
            c['product'],
            c['loc1'],
            c['loc2'],
            Decimal('15'),
            c['unit'],
            Decimal('1'),
            idempotency_key='xfer-001',
        ),
    )
    assert op.operation_type == 'transfer'
    mov_count = _run_in_tenant(
        inv_tenant,
        lambda: op.movements.count(),
    )
    assert mov_count == 2

    src_bal = _run_in_tenant(
        inv_tenant,
        lambda: get_available_stock(inv_tenant, c['product'], c['loc1']),
    )
    dst_bal = _run_in_tenant(
        inv_tenant,
        lambda: get_available_stock(inv_tenant, c['product'], c['loc2']),
    )
    assert src_bal == Decimal('25')
    assert dst_bal == Decimal('15')


@pytest.mark.django_db
def test_create_transfer_same_location_no_op(inv_tenant, ctx_branch2):
    c = ctx_branch2
    _run_in_tenant(
        inv_tenant,
        lambda: create_receipt(
            inv_tenant,
            c['branch1'],
            c['product'],
            c['loc1'],
            Decimal('40'),
            c['unit'],
            Decimal('1'),
            idempotency_key='xfer-same-seed',
        ),
    )
    op = _run_in_tenant(
        inv_tenant,
        lambda: create_transfer(
            inv_tenant,
            c['branch1'],
            c['branch1'],
            c['product'],
            c['loc1'],
            c['loc1'],
            Decimal('15'),
            c['unit'],
            Decimal('1'),
            idempotency_key='xfer-same-001',
        ),
    )
    assert op.operation_type == 'transfer'
    bal = _run_in_tenant(
        inv_tenant,
        lambda: get_available_stock(inv_tenant, c['product'], c['loc1']),
    )
    assert bal == Decimal('40')


@pytest.mark.django_db
def test_create_transfer_idempotent(inv_tenant, ctx_branch2):
    c = ctx_branch2
    _run_in_tenant(
        inv_tenant,
        lambda: create_receipt(
            inv_tenant,
            c['branch1'],
            c['product'],
            c['loc1'],
            Decimal('40'),
            c['unit'],
            Decimal('1'),
            idempotency_key='xfer-idem-seed',
        ),
    )
    op1 = _run_in_tenant(
        inv_tenant,
        lambda: create_transfer(
            inv_tenant,
            c['branch1'],
            c['branch2'],
            c['product'],
            c['loc1'],
            c['loc2'],
            Decimal('10'),
            c['unit'],
            Decimal('1'),
            idempotency_key='xfer-idem-001',
        ),
    )
    op2 = _run_in_tenant(
        inv_tenant,
        lambda: create_transfer(
            inv_tenant,
            c['branch1'],
            c['branch2'],
            c['product'],
            c['loc1'],
            c['loc2'],
            Decimal('10'),
            c['unit'],
            Decimal('1'),
            idempotency_key='xfer-idem-001',
        ),
    )
    assert op1.id == op2.id

    src = _run_in_tenant(
        inv_tenant,
        lambda: get_available_stock(inv_tenant, c['product'], c['loc1']),
    )
    assert src == Decimal('30')


# ── create_operation ─────────────────────────────────────────────────


@pytest.mark.django_db
def test_create_operation_requires_idempotency_key(inv_tenant):
    with pytest.raises(ValueError, match='Idempotency-Key is required'):
        _run_in_tenant(
            inv_tenant,
            lambda: create_operation(
                tenant=inv_tenant,
                operation_type='receipt',
                idempotency_key='',
            ),
        )


@pytest.mark.django_db
def test_create_operation_duplicate_key_diff_payload(inv_tenant, ctx):
    _run_in_tenant(
        inv_tenant,
        lambda: create_operation(
            tenant=inv_tenant,
            operation_type='receipt',
            idempotency_key='dup-key-001',
            payload={'a': 1},
        ),
    )
    from inventory.services.operations import DuplicateIdempotencyKey

    with pytest.raises(DuplicateIdempotencyKey):
        _run_in_tenant(
            inv_tenant,
            lambda: create_operation(
                tenant=inv_tenant,
                operation_type='receipt',
                idempotency_key='dup-key-001',
                payload={'b': 2},
            ),
        )


# ── reverse_operation ───────────────────────────────────────────────


@pytest.mark.django_db
def test_reverse_operation_success(inv_tenant, ctx):
    _run_in_tenant(
        inv_tenant,
        lambda: create_receipt(
            inv_tenant,
            ctx['branch'],
            ctx['product'],
            ctx['location'],
            Decimal('50'),
            ctx['unit'],
            Decimal('1'),
            idempotency_key='rev-seed-001',
        ),
    )
    op = _run_in_tenant(
        inv_tenant,
        lambda: StockOperation.all_objects.filter(
            tenant=inv_tenant, idempotency_key='rev-seed-001'
        ).first(),
    )

    reversal = _run_in_tenant(
        inv_tenant,
        lambda: reverse_operation(
            op,
            reason='Erro de lançamento',
            idempotency_key='rev-001',
        ),
    )
    assert reversal.operation_type == 'reversal'
    mov_count = _run_in_tenant(
        inv_tenant,
        lambda: reversal.movements.count(),
    )
    assert mov_count == 1
    mov = _run_in_tenant(
        inv_tenant,
        lambda: reversal.movements.first(),
    )
    assert mov.direction == 'out'

    op.refresh_from_db()
    assert op.status == 'reversed'

    bal = _run_in_tenant(
        inv_tenant,
        lambda: get_available_stock(inv_tenant, ctx['product'], ctx['location']),
    )
    assert bal == Decimal('0')


@pytest.mark.django_db
def test_reverse_operation_already_reversed(inv_tenant, ctx):
    _run_in_tenant(
        inv_tenant,
        lambda: create_receipt(
            inv_tenant,
            ctx['branch'],
            ctx['product'],
            ctx['location'],
            Decimal('50'),
            ctx['unit'],
            Decimal('1'),
            idempotency_key='rev-dup-seed',
        ),
    )
    op = _run_in_tenant(
        inv_tenant,
        lambda: StockOperation.all_objects.filter(
            tenant=inv_tenant, idempotency_key='rev-dup-seed'
        ).first(),
    )
    _run_in_tenant(
        inv_tenant,
        lambda: reverse_operation(op, reason='First', idempotency_key='rev-dup-001'),
    )
    with pytest.raises(ValueError, match='already reversed'):
        _run_in_tenant(
            inv_tenant,
            lambda: reverse_operation(op, reason='Second', idempotency_key='rev-dup-002'),
        )


@pytest.mark.django_db
def test_reverse_operation_not_confirmed(inv_tenant, ctx):
    def _create_draft():
        return StockOperation.all_objects.create(
            tenant=inv_tenant,
            operation_type='receipt',
            branch=ctx['branch'],
            status='draft',
            idempotency_key='rev-draft-001',
        )

    op = _run_in_tenant(inv_tenant, _create_draft)
    with pytest.raises(ValueError, match='Only confirmed'):
        _run_in_tenant(
            inv_tenant,
            lambda: reverse_operation(op, reason='x', idempotency_key='rev-draft-r'),
        )


# ── reconcile_stock_balances ────────────────────────────────────────


@pytest.mark.django_db
def test_reconcile_matching(inv_tenant, ctx):
    _run_in_tenant(
        inv_tenant,
        lambda: create_receipt(
            inv_tenant,
            ctx['branch'],
            ctx['product'],
            ctx['location'],
            Decimal('25'),
            ctx['unit'],
            Decimal('1'),
            idempotency_key='rec-match',
        ),
    )
    divs = _run_in_tenant(inv_tenant, lambda: reconcile_stock_balances(inv_tenant))
    assert divs == []


@pytest.mark.django_db
def test_reconcile_divergent(inv_tenant, ctx):
    _run_in_tenant(
        inv_tenant,
        lambda: create_receipt(
            inv_tenant,
            ctx['branch'],
            ctx['product'],
            ctx['location'],
            Decimal('20'),
            ctx['unit'],
            Decimal('1'),
            idempotency_key='rec-div-seed',
        ),
    )
    _run_in_tenant(
        inv_tenant,
        lambda: StockBalance.all_objects.filter(
            tenant=inv_tenant,
            product=ctx['product'],
            location=ctx['location'],
        ).update(quantity=Decimal('100')),
    )
    divs = _run_in_tenant(inv_tenant, lambda: reconcile_stock_balances(inv_tenant))
    assert len(divs) == 1
    assert divs[0]['difference'] == Decimal('80')
    assert divs[0]['projected_quantity'] == Decimal('100')
    assert divs[0]['movement_quantity'] == Decimal('20')


@pytest.mark.django_db
def test_reconcile_empty(inv_tenant):
    divs = _run_in_tenant(inv_tenant, lambda: reconcile_stock_balances(inv_tenant))
    assert divs == []


# ── _payload_hash e _apply_balance_delta ─────────────────────────────


@pytest.mark.django_db
def test_payload_hash_deterministic():
    p1 = _payload_hash({'a': 1, 'b': 'x'})
    p2 = _payload_hash({'b': 'x', 'a': 1})
    assert p1 == p2


@pytest.mark.django_db
def test_payload_hash_decimal_serialization():
    h = _payload_hash({'qty': Decimal('1.234')})
    assert isinstance(h, str)
    assert len(h) == 64


@pytest.mark.django_db
def test_apply_balance_delta_negative_raises(inv_tenant, ctx):
    with pytest.raises(InsufficientStock):
        _run_in_tenant(
            inv_tenant,
            lambda: _apply_balance_delta(
                inv_tenant,
                ctx['product'],
                ctx['location'],
                Decimal('-10'),
            ),
        )


@pytest.mark.django_db
def test_apply_balance_delta_negative_allowed(inv_tenant, ctx):
    def _setup():
        branch = ctx['branch']
        location = ctx['location']
        ProductStockPolicy.all_objects.create(
            tenant=inv_tenant,
            product=ctx['product'],
            branch=branch,
            location=location,
            allow_negative=True,
        )

    _run_in_tenant(inv_tenant, _setup)

    bal = _run_in_tenant(
        inv_tenant,
        lambda: _apply_balance_delta(
            inv_tenant,
            ctx['product'],
            ctx['location'],
            Decimal('-10'),
        ),
    )
    assert bal.quantity == Decimal('-10')
    assert bal.version == 2


@pytest.mark.django_db
def test_get_balance_creates_if_missing(inv_tenant, ctx):
    bal = _run_in_tenant(
        inv_tenant,
        lambda: _get_balance(inv_tenant, ctx['product'], ctx['location']),
    )
    assert bal.quantity == Decimal('0')
    assert bal.reserved == Decimal('0')
    assert bal.version == 1


@pytest.mark.django_db
def test_get_balance_for_update(inv_tenant, ctx):
    _run_in_tenant(
        inv_tenant,
        lambda: StockBalance.all_objects.create(
            tenant=inv_tenant,
            product=ctx['product'],
            location=ctx['location'],
            quantity=Decimal('10'),
            reserved=Decimal('0'),
        ),
    )
    bal = _run_in_tenant(
        inv_tenant,
        lambda: _get_balance(inv_tenant, ctx['product'], ctx['location'], for_update=True),
    )
    assert bal.quantity == Decimal('10')


# ── create_stock_movement ───────────────────────────────────────────


@pytest.mark.django_db
def test_create_stock_movement_zero_quantity_raises(inv_tenant, ctx):
    def _test():
        op = StockOperation.all_objects.create(
            tenant=inv_tenant,
            operation_type='receipt',
            branch=ctx['branch'],
            status='confirmed',
            idempotency_key='mov-zero',
        )
        with pytest.raises(ValueError, match='must be positive'):
            create_stock_movement(
                operation=op,
                product=ctx['product'],
                location=ctx['location'],
                direction='in',
                quantity=Decimal('0'),
                unit=ctx['unit'],
                factor=Decimal('1'),
            )

    _run_in_tenant(inv_tenant, _test)


@pytest.mark.django_db
def test_create_stock_movement_out_direction(inv_tenant, ctx):
    _run_in_tenant(
        inv_tenant,
        lambda: create_receipt(
            inv_tenant,
            ctx['branch'],
            ctx['product'],
            ctx['location'],
            Decimal('30'),
            ctx['unit'],
            Decimal('1'),
            idempotency_key='mov-out-seed',
        ),
    )
    op = _run_in_tenant(
        inv_tenant,
        lambda: create_issue(
            inv_tenant,
            ctx['branch'],
            ctx['product'],
            ctx['location'],
            Decimal('10'),
            ctx['unit'],
            Decimal('1'),
            idempotency_key='mov-out-001',
        ),
    )
    mov = _run_in_tenant(
        inv_tenant,
        lambda: op.movements.first(),
    )
    assert mov.direction == 'out'

    bal = _run_in_tenant(
        inv_tenant,
        lambda: get_available_stock(inv_tenant, ctx['product'], ctx['location']),
    )
    assert bal == Decimal('20')


# ── process_operation e get_stock_balance ────────────────────────────


@pytest.mark.django_db
def test_get_stock_balance(inv_tenant, ctx):
    def _seed():
        StockBalance.all_objects.create(
            tenant=inv_tenant,
            product=ctx['product'],
            location=ctx['location'],
            quantity=Decimal('75'),
        )

    _run_in_tenant(inv_tenant, _seed)

    qty = _run_in_tenant(
        inv_tenant,
        lambda: get_available_stock(inv_tenant, ctx['product'], ctx['location']),
    )
    assert qty == Decimal('75')


# ── _json_default fallback ──────────────────────────────────────────


def test_json_default_fallback_string():
    assert _json_default('hello') == 'hello'


def test_json_default_fallback_int():
    assert _json_default(42) == '42'


def test_json_default_fallback_date():
    from datetime import date

    result = _json_default(date(2024, 6, 15))
    assert result == '2024-06-15'


# ── _find_idempotent_operation ──────────────────────────────────────


@pytest.mark.django_db
def test_find_idempotent_operation_none_key(inv_tenant):
    result = _run_in_tenant(
        inv_tenant,
        lambda: _find_idempotent_operation(inv_tenant, None),
    )
    assert result is None


@pytest.mark.django_db
def test_find_idempotent_operation_empty_key(inv_tenant):
    result = _run_in_tenant(
        inv_tenant,
        lambda: _find_idempotent_operation(inv_tenant, ''),
    )
    assert result is None


# ── process_operation ───────────────────────────────────────────────


@pytest.mark.django_db
def test_process_operation(inv_tenant, ctx):
    def _create():
        c = create_receipt(
            inv_tenant,
            ctx['branch'],
            ctx['product'],
            ctx['location'],
            Decimal('10'),
            ctx['unit'],
            Decimal('1'),
            idempotency_key='process-op-1',
        )
        result = process_operation(c)
        return result.id

    op_id = _run_in_tenant(inv_tenant, _create)
    assert op_id is not None


# ── get_stock_balance (direct) ─────────────────────────────────────


@pytest.mark.django_db
def test_get_stock_balance_direct(inv_tenant, ctx):
    def _test():
        StockBalance.all_objects.create(
            tenant=inv_tenant,
            product=ctx['product'],
            location=ctx['location'],
            quantity=Decimal('42'),
        )
        return get_stock_balance(inv_tenant, ctx['product'], ctx['location'])

    qty = _run_in_tenant(inv_tenant, _test)
    assert qty == Decimal('42')


@pytest.mark.django_db
def test_get_stock_balance_missing(inv_tenant, ctx):
    qty = _run_in_tenant(
        inv_tenant,
        lambda: get_stock_balance(inv_tenant, ctx['product'], ctx['location']),
    )
    assert qty == Decimal('0')
