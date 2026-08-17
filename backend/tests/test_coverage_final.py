"""Targeted tests for remaining coverage gaps — inventory, sales, purchasing,
platform_admin, fiscal, and catalog modules.

All DB writes wrapped in _run_in_tenant to satisfy RLS.
"""
import uuid
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import connection
from rest_framework.test import APIRequestFactory

from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Branch, Company, Tenant, TenantMembership

pytestmark = pytest.mark.django_db
User = get_user_model()


def _run_in_tenant(tenant, callback):
    token = set_current_tenant_id(tenant.id)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SET app.current_tenant_id = %s', [str(tenant.id)])
        return callback()
    finally:
        reset_current_tenant_id(token)


def _t(slug=None):
    slug = slug or f'tc-{uuid.uuid4().hex[:8]}'
    return Tenant.objects.get_or_create(slug=slug, defaults={'name': slug})[0]


def _b(tenant, name=None):
    name = name or f'B-{uuid.uuid4().hex[:6]}'
    def _c():
        co, _ = Company.all_objects.get_or_create(tenant=tenant, name=f'Co-{tenant.slug}')
        return Branch.all_objects.get_or_create(company=co, tenant=tenant, name=name)[0]
    return _run_in_tenant(tenant, _c)


def _u(tenant, email=None, is_staff=False):
    email = email or f'u-{uuid.uuid4().hex[:8]}@t.co'
    def _c():
        user, created = User.objects.get_or_create(email=email, defaults={'is_staff': is_staff})
        if created:
            user.set_password('pass123')
            user.save()
        TenantMembership.objects.get_or_create(user=user, tenant=tenant, defaults={'role': 'admin'})
        return user
    return _run_in_tenant(tenant, _c)


def _unit(tenant, sym='UN'):
    from catalog.models import Unit
    return _run_in_tenant(tenant, lambda: Unit.all_objects.get_or_create(
        tenant=tenant, symbol=sym, defaults={'name': f'Un-{sym}'},
    )[0])


def _prd(tenant, sku=None, unit=None):
    from catalog.models import Product
    if unit is None:
        unit = _unit(tenant)
    sku = sku or f'P-{uuid.uuid4().hex[:6]}'
    return _run_in_tenant(tenant, lambda: Product.all_objects.get_or_create(
        tenant=tenant, sku=sku, defaults={'name': sku, 'base_unit': unit},
    )[0])


def _loc(tenant, branch, code='LOC'):
    from inventory.models import StockLocation
    return _run_in_tenant(tenant, lambda: StockLocation.all_objects.get_or_create(
        tenant=tenant, branch=branch, code=code, defaults={'name': code, 'is_primary': True},
    )[0])


# ── inventory/models.py ──────────────────────────────────────────


class TestStockLocationClean:
    def test_delete_with_movements_raises(self):
        from inventory.models import StockMovement, StockOperation
        t = _t()
        b = _b(t)
        loc = _loc(t, b, 'DLM')
        product = _prd(t, 'DLM-P')
        op = StockOperation.all_objects.create(tenant=t, operation_type='adjustment', status='draft')
        StockMovement.all_objects.create(
            tenant=t, operation=op, product=product, location=loc,
            direction='in', quantity=1, unit=product.base_unit,
        )
        with pytest.raises(ValidationError, match='history'):
            loc.delete()

    def test_delete_with_nonzero_balance_raises(self):
        from inventory.models import StockBalance
        t = _t()
        b = _b(t)
        loc = _loc(t, b, 'DLB')
        product = _prd(t, 'DLB-P')
        StockBalance.all_objects.create(tenant=t, product=product, location=loc, quantity=5)
        with pytest.raises(ValidationError, match='history'):
            loc.delete()

    def test_clean_cross_tenant_branch(self):
        from inventory.models import StockLocation
        t = _t('t1'); t2 = _t('t2')
        b = _b(t2)
        with pytest.raises(ValidationError):
            StockLocation(tenant=t, branch=b, code='X', name='X').clean()


class TestStockLotClean:
    def test_expiry_before_manufacture(self):
        from datetime import date

        from inventory.models import StockLot
        t = _t(); product = _prd(t, 'LOT-P')
        lot = StockLot(tenant=t, product=product, lot_number='LOT1',
                       manufacture_date=date(2025, 12, 31), expiry_date=date(2025, 1, 1))
        with pytest.raises(ValidationError, match='Expiry'):
            lot.clean()

    def test_cross_tenant_product(self):
        from inventory.models import StockLot
        t = _t(); t2 = _t('tlot2'); product = _prd(t2, 'LOT-XP')
        with pytest.raises(ValidationError):
            StockLot(tenant=t, product=product, lot_number='X').clean()

    def test_is_expired(self):
        from datetime import date

        from inventory.models import StockLot
        t = _t(); product = _prd(t, 'LOT-EXP')
        lot = StockLot.all_objects.create(tenant=t, product=product, lot_number='E', expiry_date=date(2020, 1, 1))
        assert lot.is_expired is True
        lot2 = StockLot.all_objects.create(tenant=t, product=product, lot_number='F', expiry_date=date(2099, 12, 31))
        assert lot2.is_expired is False

    def test_str(self):
        from inventory.models import StockLot
        t = _t(); product = _prd(t, 'LOT-S')
        lot = StockLot.all_objects.create(tenant=t, product=product, lot_number='LS')
        assert 'LS' in str(lot)


class TestStockOperationClean:
    def test_cross_tenant_branch(self):
        from inventory.models import StockOperation
        t = _t(); t2 = _t('top2')
        with pytest.raises(ValidationError):
            StockOperation(tenant=t, branch=_b(t2), operation_type='receipt').clean()

    def test_duplicate_idempotency_key(self):
        from inventory.models import StockOperation
        t = _t()
        def _c():
            StockOperation.all_objects.create(tenant=t, operation_type='receipt', idempotency_key='DK')
            with pytest.raises(ValidationError, match='Idempotency'):
                StockOperation(tenant=t, operation_type='receipt', idempotency_key='DK').clean()
        _run_in_tenant(t, _c)


class TestStockMovementClean:
    def test_quantity_not_positive(self):
        from inventory.models import StockMovement, StockOperation
        t = _t(); product = _prd(t, 'MQ0'); loc = _loc(t, _b(t))
        op = StockOperation.all_objects.create(tenant=t, operation_type='adjustment', status='draft')
        mov = StockMovement(tenant=t, operation=op, product=product, location=loc,
                            direction='in', quantity=0, unit=product.base_unit)
        with pytest.raises(ValidationError, match='Quantity'):
            mov.clean()

    def test_factor_not_positive(self):
        from inventory.models import StockMovement, StockOperation
        t = _t(); product = _prd(t, 'MF0'); loc = _loc(t, _b(t))
        op = StockOperation.all_objects.create(tenant=t, operation_type='adjustment', status='draft')
        mov = StockMovement(tenant=t, operation=op, product=product, location=loc,
                            direction='in', quantity=1, unit=product.base_unit, factor=0)
        with pytest.raises(ValidationError, match='Factor'):
            mov.clean()

    def test_cross_tenant_product(self):
        from inventory.models import StockMovement, StockOperation
        t = _t(); t2 = _t('tm2'); product = _prd(t2, 'MXP'); loc = _loc(t, _b(t))
        op = StockOperation.all_objects.create(tenant=t, operation_type='adjustment', status='draft')
        with pytest.raises(ValidationError):
            StockMovement(tenant=t, operation=op, product=product, location=loc,
                          direction='in', quantity=1, unit=product.base_unit).clean()

    def test_cross_tenant_unit(self):
        from inventory.models import StockMovement, StockOperation
        t = _t(); t2 = _t('tmu2'); unit = _unit(t2, 'XT'); product = _prd(t, 'MUP')
        loc = _loc(t, _b(t))
        op = StockOperation.all_objects.create(tenant=t, operation_type='adjustment', status='draft')
        with pytest.raises(ValidationError):
            StockMovement(tenant=t, operation=op, product=product, location=loc,
                          direction='in', quantity=1, unit=unit).clean()

    def test_cross_tenant_lot(self):
        from inventory.models import StockLot, StockMovement, StockOperation
        t = _t(); t2 = _t('tlot3'); product = _prd(t, 'MLT3'); product2 = _prd(t2, 'MLT4')
        lot = StockLot.all_objects.create(tenant=t2, product=product2, lot_number='LX')
        loc = _loc(t, _b(t))
        op = StockOperation.all_objects.create(tenant=t, operation_type='adjustment', status='draft')
        with pytest.raises(ValidationError, match='Lot'):
            StockMovement(tenant=t, operation=op, product=product, location=loc,
                          direction='in', quantity=1, unit=product.base_unit, lot=lot).clean()

    def test_lot_different_product(self):
        from inventory.models import StockLot, StockMovement, StockOperation
        t = _t(); p1 = _prd(t, 'MLP1'); p2 = _prd(t, 'MLP2')
        lot = StockLot.all_objects.create(tenant=t, product=p2, lot_number='LD')
        loc = _loc(t, _b(t))
        op = StockOperation.all_objects.create(tenant=t, operation_type='adjustment', status='draft')
        with pytest.raises(ValidationError, match='product'):
            StockMovement(tenant=t, operation=op, product=p1, location=loc,
                          direction='in', quantity=1, unit=p1.base_unit, lot=lot).clean()

    def test_immutable_on_save(self):
        from inventory.models import StockMovement, StockOperation
        t = _t(); product = _prd(t, 'MIM'); loc = _loc(t, _b(t))
        op = StockOperation.all_objects.create(tenant=t, operation_type='adjustment', status='confirmed')
        mov = StockMovement.all_objects.create(
            tenant=t, operation=op, product=product, location=loc,
            direction='in', quantity=1, unit=product.base_unit,
        )
        mov.quantity = 5
        with pytest.raises(ValidationError, match='immutable'):
            mov.save()

    def test_immutable_on_delete(self):
        from inventory.models import StockMovement, StockOperation
        t = _t(); product = _prd(t, 'MDL'); loc = _loc(t, _b(t))
        op = StockOperation.all_objects.create(tenant=t, operation_type='adjustment', status='confirmed')
        mov = StockMovement.all_objects.create(
            tenant=t, operation=op, product=product, location=loc,
            direction='in', quantity=1, unit=product.base_unit,
        )
        with pytest.raises(ValidationError, match='Confirmed stock movements cannot be deleted'):
            mov.delete()


class TestStockBalanceClean:
    def test_negative_quantity_without_policy(self):
        from inventory.models import StockBalance
        t = _t(); product = _prd(t, 'BNP'); loc = _loc(t, _b(t))
        with pytest.raises(ValidationError, match='Negative'):
            StockBalance(tenant=t, product=product, location=loc, quantity=-1).clean()

    def test_negative_reserved(self):
        from inventory.models import StockBalance
        t = _t(); product = _prd(t, 'BNR'); loc = _loc(t, _b(t))
        with pytest.raises(ValidationError, match='Reserved cannot be negative'):
            StockBalance(tenant=t, product=product, location=loc, quantity=5, reserved=-1).clean()

    def test_reserved_exceeds_quantity(self):
        from inventory.models import StockBalance
        t = _t(); product = _prd(t, 'BRE'); loc = _loc(t, _b(t))
        with pytest.raises(ValidationError, match='Reserved cannot exceed'):
            StockBalance(tenant=t, product=product, location=loc, quantity=5, reserved=10).clean()

    def test_allow_negative_policy_passes(self):
        from inventory.models import ProductStockPolicy, StockBalance
        t = _t(); product = _prd(t, 'BAN'); branch = _b(t); loc = _loc(t, branch)
        ProductStockPolicy.all_objects.create(
            tenant=t, product=product, branch=branch, location=loc, allow_negative=True,
        )
        StockBalance(tenant=t, product=product, location=loc, quantity=-1).clean()

    def test_available(self):
        from inventory.models import StockBalance
        t = _t(); product = _prd(t, 'BAV'); loc = _loc(t, _b(t))
        bal = StockBalance(tenant=t, product=product, location=loc,
                           quantity=Decimal('10'), reserved=Decimal('3'))
        assert bal.available == Decimal('7')

    def test_str_with_lot(self):
        from inventory.models import StockBalance, StockLot
        t = _t(); product = _prd(t, 'BSL'); loc = _loc(t, _b(t))
        lot = StockLot.all_objects.create(tenant=t, product=product, lot_number='BL1')
        assert 'BL1' in str(StockBalance(tenant=t, product=product, location=loc, lot=lot, quantity=5))

    def test_str_no_lot(self):
        from inventory.models import StockBalance
        t = _t(); product = _prd(t, 'BSN'); loc = _loc(t, _b(t))
        assert product.sku in str(StockBalance(tenant=t, product=product, location=loc, quantity=5))

    def test_cross_tenant_product(self):
        from inventory.models import StockBalance
        t = _t(); t2 = _t('tsb2'); product = _prd(t2, 'BXP'); loc = _loc(t, _b(t))
        with pytest.raises(ValidationError):
            StockBalance(tenant=t, product=product, location=loc, quantity=0).clean()

    def test_cross_tenant_lot(self):
        from inventory.models import StockBalance, StockLot
        t = _t(); t2 = _t('tsbl'); p1 = _prd(t, 'BXL1'); p2 = _prd(t2, 'BXL2')
        lot = StockLot.all_objects.create(tenant=t2, product=p2, lot_number='XLL')
        loc = _loc(t, _b(t))
        with pytest.raises(ValidationError, match='Lot'):
            StockBalance(tenant=t, product=p1, location=loc, lot=lot, quantity=0).clean()

    def test_lot_different_product(self):
        from inventory.models import StockBalance, StockLot
        t = _t(); p1 = _prd(t, 'BLD1'); p2 = _prd(t, 'BLD2')
        lot = StockLot.all_objects.create(tenant=t, product=p2, lot_number='BLD')
        loc = _loc(t, _b(t))
        with pytest.raises(ValidationError, match='product'):
            StockBalance(tenant=t, product=p1, location=loc, lot=lot, quantity=0).clean()

    def test_cross_tenant_location(self):
        from inventory.models import StockBalance
        t = _t(); t2 = _t('tsbl2'); product = _prd(t, 'BXLOCL')
        loc = _loc(t2, _b(t2))
        with pytest.raises(ValidationError):
            StockBalance(tenant=t, product=product, location=loc, quantity=0).clean()


class TestStockOperationReversalClean:
    def test_cross_tenant_original(self):
        from inventory.models import StockOperation, StockOperationReversal
        t = _t(); t2 = _t('trv2')
        op1 = _run_in_tenant(t, lambda: StockOperation.all_objects.create(tenant=t, operation_type='receipt'))
        op2 = _run_in_tenant(t, lambda: StockOperation.all_objects.create(tenant=t, operation_type='reversal'))
        with pytest.raises(ValidationError):
            StockOperationReversal(tenant=t2, original_operation=op1, reversal_operation=op2, reason='x').clean()

    def test_cross_tenant_reversal(self):
        from inventory.models import StockOperation, StockOperationReversal
        t = _t(); t2 = _t('trv3')
        op1 = _run_in_tenant(t, lambda: StockOperation.all_objects.create(tenant=t, operation_type='receipt'))
        op2 = _run_in_tenant(t2, lambda: StockOperation.all_objects.create(tenant=t2, operation_type='reversal'))
        with pytest.raises(ValidationError):
            StockOperationReversal(tenant=t, original_operation=op1, reversal_operation=op2, reason='x').clean()


class TestProductStockPolicyClean:
    def test_service_product(self):
        from catalog.models import Product
        from inventory.models import ProductStockPolicy
        t = _t(); unit = _unit(t, 'SVC')
        product = Product.all_objects.create(tenant=t, sku='SVC', name='S', base_unit=unit, product_kind='servico')
        branch = _b(t); loc = _loc(t, branch)
        with pytest.raises(ValidationError):
            ProductStockPolicy(tenant=t, product=product, branch=branch, location=loc).clean()

    def test_max_less_than_min(self):
        from inventory.models import ProductStockPolicy
        t = _t(); product = _prd(t, 'PSP-MAX'); branch = _b(t); loc = _loc(t, branch)
        with pytest.raises(ValidationError):
            ProductStockPolicy(tenant=t, product=product, branch=branch, location=loc,
                               minimum_quantity=10, maximum_quantity=5).clean()

    def test_negative_minimum(self):
        from inventory.models import ProductStockPolicy
        t = _t(); product = _prd(t, 'PSP-NM'); branch = _b(t); loc = _loc(t, branch)
        with pytest.raises(ValidationError):
            ProductStockPolicy(tenant=t, product=product, branch=branch, location=loc,
                               minimum_quantity=-1).clean()

    def test_negative_reorder(self):
        from inventory.models import ProductStockPolicy
        t = _t(); product = _prd(t, 'PSP-NR'); branch = _b(t); loc = _loc(t, branch)
        with pytest.raises(ValidationError):
            ProductStockPolicy(tenant=t, product=product, branch=branch, location=loc,
                               reorder_point=-1).clean()

    def test_location_wrong_branch(self):
        from inventory.models import ProductStockPolicy
        t = _t(); product = _prd(t, 'PSP-WB'); branch = _b(t); loc = _loc(t, _b(t, 'BR2'))
        with pytest.raises(ValidationError):
            ProductStockPolicy(tenant=t, product=product, branch=branch, location=loc).clean()

    def test_cross_tenant_product(self):
        from inventory.models import ProductStockPolicy
        t = _t(); t2 = _t('tpsp2'); product = _prd(t2, 'PSP-XP')
        branch = _b(t); loc = _loc(t, branch)
        with pytest.raises(ValidationError):
            ProductStockPolicy(tenant=t, product=product, branch=branch, location=loc).clean()

    def test_cross_tenant_branch(self):
        from inventory.models import ProductStockPolicy
        t = _t(); t2 = _t('tpsp3'); product = _prd(t, 'PSP-XB')
        with pytest.raises(ValidationError):
            ProductStockPolicy(tenant=t, product=product, branch=_b(t2), location=_loc(t, _b(t))).clean()

    def test_cross_tenant_location(self):
        from inventory.models import ProductStockPolicy
        t = _t(); t2 = _t('tpsp4'); product = _prd(t, 'PSP-XL')
        with pytest.raises(ValidationError):
            ProductStockPolicy(tenant=t, product=product, branch=_b(t), location=_loc(t2, _b(t2))).clean()

    def test_valid(self):
        from inventory.models import ProductStockPolicy
        t = _t(); product = _prd(t, 'PSP-OK'); branch = _b(t); loc = _loc(t, branch)
        ProductStockPolicy(tenant=t, product=product, branch=branch, location=loc,
                           minimum_quantity=0, maximum_quantity=100, reorder_point=10).clean()


# ── sales/models.py ──────────────────────────────────────────


class TestCashSessionClean:
    def test_cross_tenant_branch(self):
        from sales.models import CashSession
        t = _t(); t2 = _t('tcs2'); user = _u(t)
        with pytest.raises(ValidationError):
            CashSession(tenant=t, branch=_b(t2), operator=user).clean()


class TestCashMovementClean:
    def test_negative_amount(self):
        from sales.models import CashMovement, CashSession
        t = _t(); user = _u(t); branch = _b(t)
        cs = CashSession.all_objects.create(tenant=t, branch=branch, operator=user, opening_amount=0)
        with pytest.raises(ValidationError, match='Amount cannot be negative'):
            CashMovement(tenant=t, cash_session=cs, movement_type='cash_out', amount=-1).clean()

    def test_cross_tenant_session(self):
        from sales.models import CashMovement, CashSession
        t = _t(); t2 = _t('tcm2'); user2 = _u(t2, 'cm2@t.co')
        cs = CashSession.all_objects.create(tenant=t2, branch=_b(t2), operator=user2, opening_amount=0)
        with pytest.raises(ValidationError):
            CashMovement(tenant=t, cash_session=cs, movement_type='cash_out', amount=10).clean()


class TestSaleClean:
    def test_cross_tenant_branch(self):
        from sales.models import CashSession, Sale
        t = _t(); t2 = _t('tsl2'); user = _u(t)
        cs = CashSession.all_objects.create(tenant=t, branch=_b(t), operator=user, opening_amount=0)
        with pytest.raises(ValidationError):
            Sale(tenant=t, branch=_b(t2), cash_session=cs, operator=user).clean()

    def test_cross_tenant_cash_session(self):
        from sales.models import CashSession, Sale
        t = _t(); t2 = _t('tsl3'); user = _u(t); user2 = _u(t2, 'sl3@t.co')
        cs = CashSession.all_objects.create(tenant=t2, branch=_b(t2), operator=user2, opening_amount=0)
        with pytest.raises(ValidationError):
            Sale(tenant=t, branch=_b(t), cash_session=cs, operator=user).clean()

    def test_cross_tenant_customer(self):
        from people.models import Person
        from sales.models import CashSession, Sale
        t = _t(); t2 = _t('tsl4'); user = _u(t)
        cust = Person.all_objects.create(tenant=t2, name='XPTO')
        cs = CashSession.all_objects.create(tenant=t, branch=_b(t), operator=user, opening_amount=0)
        with pytest.raises(ValidationError):
            Sale(tenant=t, branch=_b(t), cash_session=cs, operator=user, customer=cust).clean()


class TestSaleItemClean:
    def test_quantity_not_positive(self):
        from sales.models import SaleItem
        with pytest.raises(ValidationError):
            SaleItem(tenant=_t(), quantity=0, factor=1, unit_price=1, line_total=0).clean()

    def test_factor_not_positive(self):
        from sales.models import SaleItem
        with pytest.raises(ValidationError):
            SaleItem(tenant=_t(), quantity=1, factor=0, unit_price=1, line_total=0).clean()

    def test_negative_discount(self):
        from sales.models import SaleItem
        with pytest.raises(ValidationError):
            SaleItem(tenant=_t(), quantity=1, factor=1, unit_price=1, line_total=0, discount_amount=-1).clean()

    def test_valid(self):
        from sales.models import SaleItem
        SaleItem(tenant=_t(), quantity=1, factor=1, unit_price=10, line_total=10).clean()


class TestSalePaymentClean:
    def test_non_positive(self):
        from sales.models import SalePayment
        with pytest.raises(ValidationError):
            SalePayment(tenant=_t(), method='cash', amount=0).clean()


class TestSaleReturnClean:
    def test_cross_tenant_sale(self):
        from sales.models import CashSession, Sale, SaleReturn
        t = _t(); t2 = _t('tsr2'); user2 = _u(t2, 'sr2@t.co')
        cs = CashSession.all_objects.create(tenant=t2, branch=_b(t2), operator=user2, opening_amount=0)
        sale = Sale.all_objects.create(tenant=t2, branch=_b(t2), cash_session=cs, operator=user2, status='confirmed')
        with pytest.raises(ValidationError):
            SaleReturn(tenant=t, sale=sale, reason='x', status='draft').clean()


class TestSaleReturnItemClean:
    def test_quantity_not_positive(self):
        from sales.models import SaleReturnItem
        with pytest.raises(ValidationError):
            SaleReturnItem(tenant=_t(), quantity=0, factor=1).clean()

    def test_factor_not_positive(self):
        from sales.models import SaleReturnItem
        with pytest.raises(ValidationError):
            SaleReturnItem(tenant=_t(), quantity=1, factor=0).clean()

    def test_cross_tenant_sale_return(self):
        from sales.models import CashSession, Sale, SaleReturn, SaleReturnItem
        t = _t(); t2 = _t('tsri2'); user2 = _u(t2, 'sri2@t.co')
        cs = CashSession.all_objects.create(tenant=t2, branch=_b(t2), operator=user2, opening_amount=0)
        sale = Sale.all_objects.create(tenant=t2, branch=_b(t2), cash_session=cs, operator=user2, status='confirmed')
        sr = SaleReturn.all_objects.create(tenant=t2, sale=sale, reason='x', status='draft')
        with pytest.raises(ValidationError):
            SaleReturnItem(tenant=t, sale_return=sr, quantity=1, factor=1).clean()


class TestSaleRefundClean:
    def test_non_positive(self):
        from sales.models import SaleRefund
        with pytest.raises(ValidationError):
            SaleRefund(tenant=_t(), method='cash', amount=0, status='pending').clean()

    def test_cross_tenant_sale(self):
        from sales.models import CashSession, Sale, SaleRefund
        t = _t(); t2 = _t('tsrf2'); user2 = _u(t2, 'srf2@t.co')
        cs = CashSession.all_objects.create(tenant=t2, branch=_b(t2), operator=user2, opening_amount=0)
        sale = Sale.all_objects.create(tenant=t2, branch=_b(t2), cash_session=cs, operator=user2, status='confirmed')
        with pytest.raises(ValidationError):
            SaleRefund(tenant=t, sale=sale, method='cash', amount=10, status='pending').clean()


class TestSaleCancellationClean:
    def test_cross_tenant_sale(self):
        from sales.models import CashSession, Sale, SaleCancellation
        t = _t(); t2 = _t('tsc2'); user2 = _u(t2, 'sc2@t.co')
        cs = CashSession.all_objects.create(tenant=t2, branch=_b(t2), operator=user2, opening_amount=0)
        sale = Sale.all_objects.create(tenant=t2, branch=_b(t2), cash_session=cs, operator=user2, status='confirmed')
        with pytest.raises(ValidationError):
            SaleCancellation(tenant=t, sale=sale, reason='x', status='draft').clean()


# ── purchasing/models.py ──────────────────────────────────────────


class TestSupplierClean:
    def test_cross_tenant_person(self):
        from people.models import Person
        from purchasing.models import Supplier
        t = _t(); t2 = _t('tsup2')
        person = Person.all_objects.create(tenant=t2, name='P2')
        with pytest.raises(ValidationError):
            Supplier(tenant=t, name='S', person=person).clean()

    def test_str(self):
        from purchasing.models import Supplier
        t = _t()
        assert 'Forn' in str(Supplier.all_objects.create(tenant=t, name='Fornecedor'))


class TestPurchaseOrderClean:
    def test_cross_tenant_supplier(self):
        from purchasing.models import PurchaseOrder, Supplier
        t = _t(); t2 = _t('tpo2')
        with pytest.raises(ValidationError):
            PurchaseOrder(tenant=t, supplier=Supplier.all_objects.create(tenant=t2, name='S2'), branch=_b(t)).clean()

    def test_cross_tenant_branch(self):
        from purchasing.models import PurchaseOrder, Supplier
        t = _t(); t2 = _t('tpo3')
        with pytest.raises(ValidationError):
            PurchaseOrder(tenant=t, supplier=Supplier.all_objects.create(tenant=t, name='S3'), branch=_b(t2)).clean()

    def test_str(self):
        from purchasing.models import PurchaseOrder, Supplier
        t = _t(); sup = Supplier.all_objects.create(tenant=t, name='Fornecedor')
        po = PurchaseOrder.all_objects.create(tenant=t, supplier=sup, branch=_b(t))
        assert 'Fornecedor' in str(po)


class TestPurchaseOrderItemClean:
    def test_quantity_not_positive(self):
        from purchasing.models import PurchaseOrderItem
        with pytest.raises(ValidationError):
            PurchaseOrderItem(tenant=_t(), quantity=0, unit_cost=1, factor=1).clean()

    def test_unit_cost_not_positive(self):
        from purchasing.models import PurchaseOrderItem
        with pytest.raises(ValidationError):
            PurchaseOrderItem(tenant=_t(), quantity=1, unit_cost=0, factor=1).clean()

    def test_factor_not_positive(self):
        from purchasing.models import PurchaseOrderItem
        with pytest.raises(ValidationError):
            PurchaseOrderItem(tenant=_t(), quantity=1, unit_cost=1, factor=0).clean()

    def test_line_total(self):
        from purchasing.models import PurchaseOrderItem
        poi = PurchaseOrderItem(tenant=_t(), quantity=Decimal('3'), unit_cost=Decimal('10'), factor=Decimal('2'))
        assert poi.line_total() == Decimal('60')


class TestPurchaseReceiptClean:
    def test_cross_tenant_order(self):
        from purchasing.models import PurchaseOrder, PurchaseReceipt, Supplier
        t = _t(); t2 = _t('tpr2')
        sup = Supplier.all_objects.create(tenant=t2, name='S-PR')
        po = PurchaseOrder.all_objects.create(tenant=t2, supplier=sup, branch=_b(t2))
        with pytest.raises(ValidationError):
            PurchaseReceipt(tenant=t, purchase_order=po).clean()

    def test_str(self):
        from purchasing.models import PurchaseOrder, PurchaseReceipt, Supplier
        t = _t(); sup = Supplier.all_objects.create(tenant=t, name='Forn')
        po = PurchaseOrder.all_objects.create(tenant=t, supplier=sup, branch=_b(t))
        assert 'RCT-' in str(PurchaseReceipt.all_objects.create(tenant=t, purchase_order=po))


class TestPurchaseReceiptItemClean:
    def test_quantity_not_positive(self):
        from purchasing.models import PurchaseReceiptItem
        with pytest.raises(ValidationError):
            PurchaseReceiptItem(tenant=_t(), quantity_received=0, unit_cost=1).clean()

    def test_unit_cost_not_positive(self):
        from purchasing.models import PurchaseReceiptItem
        with pytest.raises(ValidationError):
            PurchaseReceiptItem(tenant=_t(), quantity_received=1, unit_cost=0).clean()

    def test_line_total(self):
        from purchasing.models import PurchaseReceiptItem
        pri = PurchaseReceiptItem(tenant=_t(), quantity_received=Decimal('5'), unit_cost=Decimal('3'))
        assert pri.line_total() == Decimal('15')


class TestPurchaseOrderCancellationClean:
    def test_cross_tenant(self):
        from purchasing.models import PurchaseOrder, PurchaseOrderCancellation, Supplier
        t = _t(); t2 = _t('tpoc2')
        sup = Supplier.all_objects.create(tenant=t2, name='S')
        po = PurchaseOrder.all_objects.create(tenant=t2, supplier=sup, branch=_b(t2))
        with pytest.raises(ValidationError):
            PurchaseOrderCancellation(tenant=t, purchase_order=po, reason='x').clean()

    def test_str(self):
        from purchasing.models import PurchaseOrder, PurchaseOrderCancellation, Supplier
        t = _t(); sup = Supplier.all_objects.create(tenant=t, name='Forn')
        po = PurchaseOrder.all_objects.create(tenant=t, supplier=sup, branch=_b(t))
        poc = PurchaseOrderCancellation.all_objects.create(tenant=t, purchase_order=po, reason='x', idempotency_key=f'pc-{uuid.uuid4()}')
        assert 'POC-' in str(poc)


class TestPurchaseReceiptCancellationClean:
    def test_cross_tenant(self):
        from purchasing.models import (
            PurchaseOrder,
            PurchaseReceipt,
            PurchaseReceiptCancellation,
            Supplier,
        )
        t = _t(); t2 = _t('tprc2')
        sup = Supplier.all_objects.create(tenant=t2, name='S')
        po = PurchaseOrder.all_objects.create(tenant=t2, supplier=sup, branch=_b(t2))
        pr = PurchaseReceipt.all_objects.create(tenant=t2, purchase_order=po)
        with pytest.raises(ValidationError):
            PurchaseReceiptCancellation(tenant=t, receipt=pr, reason='x').clean()

    def test_str(self):
        from purchasing.models import (
            PurchaseOrder,
            PurchaseReceipt,
            PurchaseReceiptCancellation,
            Supplier,
        )
        t = _t(); sup = Supplier.all_objects.create(tenant=t, name='Forn')
        po = PurchaseOrder.all_objects.create(tenant=t, supplier=sup, branch=_b(t))
        pr = PurchaseReceipt.all_objects.create(tenant=t, purchase_order=po)
        prc = PurchaseReceiptCancellation.all_objects.create(tenant=t, receipt=pr, reason='x', idempotency_key=f'prc-{uuid.uuid4()}')
        assert 'PRC-' in str(prc)


class TestSupplierReturnClean:
    def test_cross_tenant(self):
        from purchasing.models import PurchaseOrder, PurchaseReceipt, Supplier, SupplierReturn
        t = _t(); t2 = _t('tsr-p')
        sup = Supplier.all_objects.create(tenant=t2, name='S')
        po = PurchaseOrder.all_objects.create(tenant=t2, supplier=sup, branch=_b(t2))
        pr = PurchaseReceipt.all_objects.create(tenant=t2, purchase_order=po)
        with pytest.raises(ValidationError):
            SupplierReturn(tenant=t, receipt=pr, reason='x').clean()

    def test_str(self):
        from purchasing.models import PurchaseOrder, PurchaseReceipt, Supplier, SupplierReturn
        t = _t(); sup = Supplier.all_objects.create(tenant=t, name='Forn')
        po = PurchaseOrder.all_objects.create(tenant=t, supplier=sup, branch=_b(t))
        pr = PurchaseReceipt.all_objects.create(tenant=t, purchase_order=po)
        sr = SupplierReturn.all_objects.create(tenant=t, receipt=pr, reason='x', idempotency_key=f'sr-{uuid.uuid4()}')
        assert 'RET-' in str(sr)


class TestSupplierReturnItemClean:
    def test_quantity_not_positive(self):
        from purchasing.models import SupplierReturnItem
        with pytest.raises(ValidationError):
            SupplierReturnItem(tenant=_t(), quantity=0, unit_cost=1).clean()

    def test_unit_cost_not_positive(self):
        from purchasing.models import SupplierReturnItem
        with pytest.raises(ValidationError):
            SupplierReturnItem(tenant=_t(), quantity=1, unit_cost=0).clean()

    def test_line_total(self):
        from purchasing.models import SupplierReturnItem
        sri = SupplierReturnItem(tenant=_t(), quantity=Decimal('4'), unit_cost=Decimal('5'))
        assert sri.line_total() == Decimal('20')


class TestRecurringTemplateClean:
    def test_cross_tenant_supplier(self):
        from purchasing.models import RecurringPurchaseOrderTemplate, Supplier
        t = _t(); t2 = _t('trpt2')
        with pytest.raises(ValidationError):
            RecurringPurchaseOrderTemplate(tenant=t, supplier=Supplier.all_objects.create(tenant=t2, name='S'), branch=_b(t)).clean()

    def test_cross_tenant_branch(self):
        from purchasing.models import RecurringPurchaseOrderTemplate, Supplier
        t = _t(); t2 = _t('trpt3')
        with pytest.raises(ValidationError):
            RecurringPurchaseOrderTemplate(tenant=t, supplier=Supplier.all_objects.create(tenant=t, name='S'), branch=_b(t2)).clean()

    def test_str(self):
        from purchasing.models import RecurringPurchaseOrderTemplate, Supplier
        t = _t(); sup = Supplier.all_objects.create(tenant=t, name='Forn')
        rpt = RecurringPurchaseOrderTemplate.all_objects.create(tenant=t, supplier=sup, branch=_b(t), frequency='monthly')
        assert 'Recurring' in str(rpt)


class TestRecurringTemplateItemClean:
    def test_quantity_not_positive(self):
        from purchasing.models import RecurringTemplateItem
        with pytest.raises(ValidationError):
            RecurringTemplateItem(tenant=_t(), quantity=0, unit_cost=1, factor=1).clean()

    def test_unit_cost_not_positive(self):
        from purchasing.models import RecurringTemplateItem
        with pytest.raises(ValidationError):
            RecurringTemplateItem(tenant=_t(), quantity=1, unit_cost=0, factor=1).clean()

    def test_line_total(self):
        from purchasing.models import RecurringTemplateItem
        rti = RecurringTemplateItem(tenant=_t(), quantity=Decimal('2'), unit_cost=Decimal('5'), factor=Decimal('3'))
        assert rti.line_total() == Decimal('30')


# ── sales/views.py ──────────────────────────────────────────


class TestSalesBatchOperations:
    def test_unknown_op_type(self):
        from sales.views import _route_batch_operation
        request = MagicMock(); request.tenant = _t()
        with pytest.raises(ValueError, match='Unknown operation type'):
            _route_batch_operation(request, {'type': 'x:y', 'payload': {}, 'idempotency_key': 'x'})

    def test_close_missing_session_id(self):
        from sales.views import _route_batch_operation
        t = _t(); request = MagicMock(); request.tenant = t; request.user = _u(t, 'bc@t.co')
        with pytest.raises(ValueError, match='session_id is required'):
            _route_batch_operation(request, {'type': 'cash-session:close', 'payload': {'closing_amount': 0}, 'idempotency_key': 'bk'})


class TestSalesPermissions:
    def test_cash_session_mfa_for_open_close(self):
        from sales.views import CashSessionViewSet
        from tenancy.permissions import HasVerifiedMFA
        for act in ['open', 'close']:
            vs = CashSessionViewSet(); vs.kwargs = {}; vs.format_kwarg = None; vs.action = act
            assert any(isinstance(p, HasVerifiedMFA) for p in vs.get_permissions())

    def test_cash_session_no_mfa_for_list(self):
        from sales.views import CashSessionViewSet
        from tenancy.permissions import HasVerifiedMFA
        vs = CashSessionViewSet(); vs.kwargs = {}; vs.format_kwarg = None; vs.action = 'list'
        assert not any(isinstance(p, HasVerifiedMFA) for p in vs.get_permissions())

    def test_sale_mfa_for_counter(self):
        from sales.views import SaleViewSet
        from tenancy.permissions import HasVerifiedMFA
        vs = SaleViewSet(); vs.kwargs = {}; vs.format_kwarg = None; vs.action = 'counter'
        assert any(isinstance(p, HasVerifiedMFA) for p in vs.get_permissions())

    def test_sale_no_mfa_for_list(self):
        from sales.views import SaleViewSet
        from tenancy.permissions import HasVerifiedMFA
        vs = SaleViewSet(); vs.kwargs = {}; vs.format_kwarg = None; vs.action = 'list'
        assert not any(isinstance(p, HasVerifiedMFA) for p in vs.get_permissions())


class TestSalesErrorHandler:
    def _vs(self, cls):
        from sales.views import CashSessionViewSet, SaleViewSet
        vs = cls() if cls == SaleViewSet else CashSessionViewSet()
        return vs

    def test_not_found(self):
        from django.core.exceptions import ObjectDoesNotExist

        from sales.views import SaleViewSet
        assert self._vs(SaleViewSet)._handle_sales_error(ObjectDoesNotExist()).status_code == 404

    def test_cash_session_required(self):
        from sales.services import CashSessionRequired
        from sales.views import SaleViewSet
        assert self._vs(SaleViewSet)._handle_sales_error(CashSessionRequired('x')).status_code == 409

    def test_payment_mismatch(self):
        from sales.services import PaymentMismatch
        from sales.views import SaleViewSet
        assert self._vs(SaleViewSet)._handle_sales_error(PaymentMismatch('x')).status_code == 400

    def test_insufficient_returnable(self):
        from sales.services import InsufficientReturnableQuantity
        from sales.views import SaleViewSet
        assert self._vs(SaleViewSet)._handle_sales_error(InsufficientReturnableQuantity('x')).status_code == 409

    def test_already_cancelled(self):
        from sales.services import SaleAlreadyCancelled
        from sales.views import SaleViewSet
        assert self._vs(SaleViewSet)._handle_sales_error(SaleAlreadyCancelled('x')).status_code == 409

    def test_empty_sale(self):
        from sales.services import EmptySale
        from sales.views import SaleViewSet
        assert self._vs(SaleViewSet)._handle_sales_error(EmptySale('x')).status_code == 400

    def test_value_error(self):
        from sales.views import SaleViewSet
        assert self._vs(SaleViewSet)._handle_sales_error(ValueError('x')).status_code == 400

    def test_unhandled_reraise(self):
        from sales.views import SaleViewSet
        with pytest.raises(RuntimeError):
            self._vs(SaleViewSet)._handle_sales_error(RuntimeError('boom'))

    def test_cash_session_not_found(self):
        from django.core.exceptions import ObjectDoesNotExist

        from sales.views import CashSessionViewSet
        assert self._vs(CashSessionViewSet)._handle_sales_error(ObjectDoesNotExist()).status_code == 404

    def test_cash_session_exists(self):
        from sales.services import OpenCashSessionExists
        from sales.views import CashSessionViewSet
        assert self._vs(CashSessionViewSet)._handle_sales_error(OpenCashSessionExists('x')).status_code == 409

    def test_cash_session_value_error(self):
        from sales.views import CashSessionViewSet
        assert self._vs(CashSessionViewSet)._handle_sales_error(ValueError('x')).status_code == 400

    def test_cash_session_unhandled(self):
        from sales.views import CashSessionViewSet
        with pytest.raises(RuntimeError):
            self._vs(CashSessionViewSet)._handle_sales_error(RuntimeError('boom'))


class TestSalesIdempotencyKey:
    def test_missing(self):
        from sales.views import _idempotency_key
        with pytest.raises(ValueError, match='Idempotency-Key'):
            _idempotency_key(MagicMock(headers={}))

    def test_empty(self):
        from sales.views import _idempotency_key
        with pytest.raises(ValueError, match='Idempotency-Key'):
            _idempotency_key(MagicMock(headers={'Idempotency-Key': '  '}))


# ── purchasing/views.py ──────────────────────────────────────────


class TestPurchasingIdempotencyKey:
    def test_missing(self):
        from purchasing.views import _idempotency_key
        with pytest.raises(ValueError, match='Idempotency-Key'):
            _idempotency_key(MagicMock(headers={}))


class TestPurchasingPermissions:
    def test_supplier_mfa(self):
        from purchasing.views import SupplierViewSet
        from tenancy.permissions import HasVerifiedMFA
        vs = SupplierViewSet(); vs.kwargs = {}; vs.format_kwarg = None
        for act in ['create', 'update', 'partial_update', 'destroy', 'auto_onboard']:
            vs.action = act
            assert any(isinstance(p, HasVerifiedMFA) for p in vs.get_permissions())

    def test_po_mfa(self):
        from purchasing.views import PurchaseOrderViewSet
        from tenancy.permissions import HasVerifiedMFA
        vs = PurchaseOrderViewSet(); vs.kwargs = {}; vs.format_kwarg = None
        for act in ['create', 'update', 'partial_update', 'destroy', 'approve', 'receive', 'cancel']:
            vs.action = act
            assert any(isinstance(p, HasVerifiedMFA) for p in vs.get_permissions())

    def test_receipt_mfa(self):
        from purchasing.views import PurchaseReceiptViewSet
        from tenancy.permissions import HasVerifiedMFA
        vs = PurchaseReceiptViewSet(); vs.kwargs = {}; vs.format_kwarg = None
        for act in ['cancel', 'return']:
            vs.action = act
            assert any(isinstance(p, HasVerifiedMFA) for p in vs.get_permissions())


class TestPurchasingSerializerClass:
    def test_retrieve(self):
        from purchasing.serializers import PurchaseOrderDetailSerializer
        from purchasing.views import PurchaseOrderViewSet
        vs = PurchaseOrderViewSet(); vs.action = 'retrieve'
        assert vs.get_serializer_class() == PurchaseOrderDetailSerializer

    def test_list(self):
        from purchasing.serializers import PurchaseOrderListSerializer
        from purchasing.views import PurchaseOrderViewSet
        vs = PurchaseOrderViewSet(); vs.action = 'list'
        assert vs.get_serializer_class() == PurchaseOrderListSerializer


# ── purchasing/services.py ──────────────────────────────────────


class TestPurchasingServices:
    def test_payload_hash(self):
        from purchasing.services import _payload_hash
        h1 = _payload_hash({'a': 1, 'b': 'x'}); h2 = _payload_hash({'b': 'x', 'a': 1})
        assert h1 == h2 and len(h1) == 64

    def test_exceptions(self):
        from purchasing.services import (
            AlreadyCancelled,
            CannotCancelPurchaseOrder,
            DuplicateIdempotencyKey,
            OverReceiptError,
            ReceiptWithoutApprovedOrder,
        )
        obj = MagicMock(); obj.idempotency_key = 'k123'
        assert 'k123' in str(DuplicateIdempotencyKey(obj))
        assert 'too many' in str(OverReceiptError('too many'))
        assert 'bad' in str(ReceiptWithoutApprovedOrder('bad'))
        assert 'recv' in str(CannotCancelPurchaseOrder('recv'))
        assert 'yep' in str(AlreadyCancelled('yep'))

    def test_cancel_wrong_tenant(self):
        from purchasing.services import cancel_purchase_order
        t = _t(); t2 = _t('tcpo2')
        po = MagicMock(); po.tenant_id = t2.id
        with pytest.raises(ValueError, match='does not belong'):
            cancel_purchase_order(tenant=t, purchase_order=po, reason='x')

    def test_cancel_already_cancelled(self):
        from purchasing.models import PurchaseOrder, Supplier
        from purchasing.services import AlreadyCancelled, cancel_purchase_order
        t = _t()
        supplier = Supplier.all_objects.create(tenant=t, name='Cancelado')
        po = PurchaseOrder.all_objects.create(
            tenant=t,
            supplier=supplier,
            branch=_b(t),
            status='cancelled',
        )
        with pytest.raises(AlreadyCancelled):
            cancel_purchase_order(tenant=t, purchase_order=po, reason='x', idempotency_key='ck1')

    def test_cancel_cannot_cancel_received(self):
        from purchasing.models import PurchaseOrder, Supplier
        from purchasing.services import CannotCancelPurchaseOrder, cancel_purchase_order
        t = _t()
        supplier = Supplier.all_objects.create(tenant=t, name='Recebido')
        po = PurchaseOrder.all_objects.create(
            tenant=t,
            supplier=supplier,
            branch=_b(t),
            status='received',
        )
        with pytest.raises(CannotCancelPurchaseOrder):
            cancel_purchase_order(tenant=t, purchase_order=po, reason='x', idempotency_key='ck2')

    def test_receive_wrong_tenant(self):
        from purchasing.services import receive_purchase_order
        t = _t(); t2 = _t('trpo2')
        po = MagicMock(); po.tenant_id = t2.id
        with pytest.raises(ValueError, match='does not belong'):
            receive_purchase_order(tenant=t, purchase_order=po, items=[], idempotency_key='rk1')

    def test_receive_not_approved(self):
        from purchasing.models import PurchaseOrder, Supplier
        from purchasing.services import ReceiptWithoutApprovedOrder, receive_purchase_order
        t = _t()
        supplier = Supplier.all_objects.create(tenant=t, name='Rascunho')
        po = PurchaseOrder.all_objects.create(
            tenant=t,
            supplier=supplier,
            branch=_b(t),
            status='draft',
        )
        with pytest.raises(ReceiptWithoutApprovedOrder):
            receive_purchase_order(tenant=t, purchase_order=po, items=[], idempotency_key='rk2')

    def test_advance_schedule(self):
        from datetime import date, timedelta

        from purchasing.models import RecurringPurchaseOrderTemplate, Supplier
        from purchasing.services import advance_recurring_template_schedule
        t = _t(); sup = Supplier.all_objects.create(tenant=t, name='SA')
        for freq, delta in [('daily', timedelta(1)), ('weekly', timedelta(7)), ('biweekly', timedelta(14))]:
            tpl = RecurringPurchaseOrderTemplate.all_objects.create(
                tenant=t, supplier=sup, branch=_b(t), frequency=freq, next_run=date(2025, 6, 1),
            )
            advance_recurring_template_schedule(tpl)
            tpl.refresh_from_db()
            assert tpl.next_run == date(2025, 6, 1) + delta

    def test_advance_no_next_run(self):
        from purchasing.models import RecurringPurchaseOrderTemplate, Supplier
        from purchasing.services import advance_recurring_template_schedule
        t = _t(); sup = Supplier.all_objects.create(tenant=t, name='SN')
        tpl = RecurringPurchaseOrderTemplate.all_objects.create(
            tenant=t, supplier=sup, branch=_b(t), frequency='daily', next_run=None,
        )
        advance_recurring_template_schedule(tpl)
        tpl.refresh_from_db()
        assert tpl.next_run is None

    def test_auto_onboard_new(self):
        from purchasing.services import auto_onboard_supplier
        t = _t()
        sup = _run_in_tenant(t, lambda: auto_onboard_supplier(tenant=t, cnpj='99988877766655', name='Novo'))
        assert sup.name == 'Novo'

    def test_auto_onboard_existing(self):
        from purchasing.models import Supplier
        from purchasing.services import auto_onboard_supplier
        t = _t(); existing = Supplier.all_objects.create(tenant=t, name='Ex', cnpj='11122233344455')
        result = _run_in_tenant(t, lambda: auto_onboard_supplier(tenant=t, cnpj='11122233344455', name='Outro'))
        assert result.pk == existing.pk

    def test_summary(self):
        from purchasing.services import purchasing_summary
        t = _t(); result = _run_in_tenant(t, lambda: purchasing_summary(tenant=t))
        assert 'purchase_orders' in result and 'payables' in result


# ── sales/services.py ──────────────────────────────────────────


class TestSalesServiceHelpers:
    def test_payload_hash(self):
        from sales.services import _payload_hash
        assert len(_payload_hash({'x': 1})) == 64

    def test_json_default(self):
        from sales.services import _json_default
        obj = MagicMock(); obj.id = uuid.uuid4()
        assert str(obj.id) in _json_default(obj)
        assert _json_default(Decimal('1.23')) == '1.23'
        assert _json_default('fallback') == 'fallback'

    def test_close_already_closed(self):
        from sales.models import CashSession
        from sales.services import close_cash_session
        t = _t(); user = _u(t, 'ccs@t.co')
        cs = CashSession.all_objects.create(tenant=t, branch=_b(t), operator=user, opening_amount=0, status='closed')
        assert close_cash_session(cash_session=cs, closing_amount=0, idempotency_key='cc').pk == cs.pk

    def test_return_no_items(self):
        from sales.services import create_sale_return
        with pytest.raises(ValueError, match='at least one item'):
            create_sale_return(tenant=_t(), sale=MagicMock(), items=[], reason='x', idempotency_key='r1')

    def test_return_no_reason(self):
        from sales.services import create_sale_return
        with pytest.raises(ValueError, match='Reason'):
            create_sale_return(tenant=_t(), sale=MagicMock(),
                               items=[{'sale_item_id': str(uuid.uuid4()), 'quantity': 1}],
                               reason='', idempotency_key='r2')

    def test_refund_zero(self):
        from sales.services import create_sale_refund
        with pytest.raises(ValueError, match='positive'):
            create_sale_refund(tenant=_t(), sale=MagicMock(), method='cash', amount=Decimal('0'), idempotency_key='rf1')

    def test_refund_negative(self):
        from sales.services import create_sale_refund
        with pytest.raises(ValueError, match='positive'):
            create_sale_refund(tenant=_t(), sale=MagicMock(), method='pix', amount=Decimal('-5'), idempotency_key='rf2')

    def test_cancel_already_cancelled(self):
        from sales.services import SaleAlreadyCancelled, cancel_sale
        sale = MagicMock(); sale.status = 'cancelled'
        with pytest.raises(SaleAlreadyCancelled):
            cancel_sale(tenant=_t(), sale=sale, reason='x', idempotency_key='cs1')

    def test_cancel_no_reason(self):
        from sales.services import cancel_sale
        sale = MagicMock(); sale.status = 'confirmed'
        with pytest.raises(ValueError, match='Reason'):
            cancel_sale(tenant=_t(), sale=sale, reason='', idempotency_key='cs2')


# ── platform_admin/views.py ──────────────────────────────────────


class TestPlatformAdminPerm:
    def test_non_staff(self):
        from platform_admin.views import PlatformAdminPermission
        req = MagicMock(); req.user.is_staff = False
        assert not PlatformAdminPermission().has_permission(req, MagicMock())

    def test_staff(self):
        from platform_admin.views import PlatformAdminPermission
        req = MagicMock(); req.user.is_staff = True
        assert PlatformAdminPermission().has_permission(req, MagicMock())


class TestContainsUniqueError:
    def test_dict(self):
        from rest_framework.exceptions import ErrorDetail

        from platform_admin.views import _contains_unique_error
        assert _contains_unique_error({'n': [ErrorDetail('d', code='unique')]})

    def test_list(self):
        from rest_framework.exceptions import ErrorDetail

        from platform_admin.views import _contains_unique_error
        assert _contains_unique_error([ErrorDetail('d', code='unique')])

    def test_string(self):
        from platform_admin.views import _contains_unique_error
        assert not _contains_unique_error('simple')

    def test_nested(self):
        from rest_framework.exceptions import ErrorDetail

        from platform_admin.views import _contains_unique_error
        assert _contains_unique_error({'o': {'i': [ErrorDetail('d', code='unique')]}})


class TestProblemResponse:
    def test_format(self):
        from platform_admin.views import _problem_response
        resp = _problem_response('msg', 'code', 400)
        assert resp.status_code == 400 and resp.data['code'] == 'code'


class TestSupportAccessApproveRevoke:
    def test_approve_non_staff(self):
        from platform_admin.views import SupportAccessViewSet
        factory = APIRequestFactory()
        request = factory.post('/sa/a/')
        request.user = MagicMock(is_staff=False); request.tenant = _t()
        vs = SupportAccessViewSet(); vs.kwargs = {}; vs.format_kwarg = None
        assert vs.approve(request, pk=str(uuid.uuid4())).status_code == 403

    def test_revoke_non_staff(self):
        from platform_admin.views import SupportAccessViewSet
        factory = APIRequestFactory()
        request = factory.post('/sa/r/')
        request.user = MagicMock(is_staff=False); request.tenant = _t()
        vs = SupportAccessViewSet(); vs.kwargs = {}; vs.format_kwarg = None
        assert vs.revoke(request, pk=str(uuid.uuid4())).status_code == 403

    def test_approve_not_found(self):
        from platform_admin.views import SupportAccessViewSet
        factory = APIRequestFactory()
        request = factory.post('/sa/a/')
        request.user = MagicMock(is_staff=True); request.tenant = _t()
        vs = SupportAccessViewSet(); vs.kwargs = {}; vs.format_kwarg = None
        with patch('platform_admin.views.approve_support_access', side_effect=ValueError('not found')):
            assert vs.approve(request, pk=str(uuid.uuid4())).status_code == 404

    def test_approve_conflict(self):
        from platform_admin.views import SupportAccessViewSet
        factory = APIRequestFactory()
        request = factory.post('/sa/a/')
        request.user = MagicMock(is_staff=True); request.tenant = _t()
        vs = SupportAccessViewSet(); vs.kwargs = {}; vs.format_kwarg = None
        with patch('platform_admin.views.approve_support_access', side_effect=ValueError('already')):
            assert vs.approve(request, pk=str(uuid.uuid4())).status_code == 409

    def test_revoke_not_found(self):
        from platform_admin.views import SupportAccessViewSet
        factory = APIRequestFactory()
        request = factory.post('/sa/r/')
        request.user = MagicMock(is_staff=True); request.tenant = _t()
        vs = SupportAccessViewSet(); vs.kwargs = {}; vs.format_kwarg = None
        with patch('platform_admin.views.revoke_support_access', side_effect=ValueError('not found')):
            assert vs.revoke(request, pk=str(uuid.uuid4())).status_code == 404

    def test_revoke_conflict(self):
        from platform_admin.views import SupportAccessViewSet
        factory = APIRequestFactory()
        request = factory.post('/sa/r/')
        request.user = MagicMock(is_staff=True); request.tenant = _t()
        vs = SupportAccessViewSet(); vs.kwargs = {}; vs.format_kwarg = None
        with patch('platform_admin.views.revoke_support_access', side_effect=ValueError('already')):
            assert vs.revoke(request, pk=str(uuid.uuid4())).status_code == 409


# ── fiscal/services.py ──────────────────────────────────────────


class TestFiscalHelpers:
    def test_validation_issue(self):
        from fiscal.services import FiscalValidationIssue
        i = FiscalValidationIssue('f', 'm', 'warning')
        assert i.as_dict() == {'field': 'f', 'message': 'm', 'severity': 'warning'}
        assert FiscalValidationIssue('f', 'm').severity == 'error'

    def test_cfop(self):
        from fiscal.services import _get_cfop_for_operation
        assert _get_cfop_for_operation('interna') == '1102'
        assert _get_cfop_for_operation('externa') == '2102'


class TestResolveBranch:
    def test_none(self):
        from fiscal.services import _resolve_branch
        doc = MagicMock(); doc.sale_id = None; doc.purchase_order_id = None; doc.receipt_id = None
        assert _resolve_branch(doc) is None

    def test_sale(self):
        from fiscal.services import _resolve_branch
        doc = MagicMock(); doc.sale_id = 'x'
        assert _resolve_branch(doc) == doc.sale.branch

    def test_po(self):
        from fiscal.services import _resolve_branch
        doc = MagicMock(); doc.sale_id = None; doc.purchase_order_id = 'x'
        assert _resolve_branch(doc) == doc.purchase_order.branch

    def test_receipt(self):
        from fiscal.services import _resolve_branch
        doc = MagicMock(); doc.sale_id = None; doc.purchase_order_id = None; doc.receipt_id = 'x'
        assert _resolve_branch(doc) == doc.receipt.purchase_order.branch


class TestBuildItemDict:
    def test_with_config(self):
        from fiscal.services import build_item_dict
        item = MagicMock(); item.product.sku = 'T'; item.product.ncm = '123'; item.unit.symbol = 'UN'
        cfg = MagicMock(); cfg.origem = '1'; cfg.cst_icms = '00'; cfg.cst_pis = '01'
        cfg.cst_cofins = '02'; cfg.aliquota_icms = Decimal('18')
        with patch('fiscal.services.resolve_product_config', return_value=cfg):
            r = build_item_dict(item)
        assert r['ncm'] == '123' and r['cst_icms'] == '00'

    def test_no_config(self):
        from fiscal.services import build_item_dict
        item = MagicMock(); item.product.sku = 'N'; item.product.ncm = ''; item.unit.symbol = 'KG'
        with patch('fiscal.services.resolve_product_config', return_value=None):
            r = build_item_dict(item)
        assert r['origem'] == '0' and r['cst_pis'] == '99'


class TestBuildPaymentDict:
    def test_builds(self):
        from fiscal.services import build_payment_dict
        p = MagicMock(); p.method = 'pix'; p.amount = Decimal('25.50')
        assert build_payment_dict(p) == {'method': 'pix', 'amount': Decimal('25.50')}


class TestApplyProviderQueryResult:
    def test_concluded(self):
        from fiscal.services import apply_provider_query_result
        doc = MagicMock(); result = MagicMock()
        result.status = 'CONCLUIDO'; result.protocol = 'P'; result.xml_url = 'x'; result.pdf_url = 'p'
        apply_provider_query_result(doc, result)
        doc.save.assert_called_once()

    def test_rejected(self):
        from fiscal.services import apply_provider_query_result
        doc = MagicMock(); doc.attempt_number = 0
        result = MagicMock(); result.status = 'REJEITADO'; result.error_reason = 'bad'
        with patch('fiscal.services.FiscalDocument'):
            apply_provider_query_result(doc, result)
        assert doc.is_active is False

    def test_cancelled(self):
        from fiscal.services import apply_provider_query_result
        doc = MagicMock(); result = MagicMock(); result.status = 'CANCELADO'; result.error_reason = 'c'
        apply_provider_query_result(doc, result)
        assert doc.is_active is False

    def test_unknown(self):
        from fiscal.services import apply_provider_query_result
        doc = MagicMock(); result = MagicMock(); result.status = 'PROCESSING'
        apply_provider_query_result(doc, result)
        doc.save.assert_called()


class TestEmitNfce:
    def test_existing(self):
        from fiscal.models import FiscalDocument
        from fiscal.services import emit_nfce
        t = _t(); sale = MagicMock(); existing = MagicMock()
        with patch.object(FiscalDocument.all_objects, 'filter',
                          MagicMock(return_value=MagicMock(first=MagicMock(return_value=existing)))):
            assert emit_nfce(sale, t) == existing


class TestEmitDocument:
    def test_no_emitter(self):
        from fiscal.services import emit_document
        doc = MagicMock()
        with patch('fiscal.services.resolve_emitter', return_value=None):
            assert emit_document(doc).status == 'FAILED'


class TestReconcileExistingDoc:
    def test_existing(self):
        from fiscal.models import FiscalDocument
        from fiscal.services import reconcile_receipt_fiscal
        t = _t(); receipt = MagicMock(); existing = MagicMock()
        with patch.object(FiscalDocument.all_objects, 'filter',
                          MagicMock(return_value=MagicMock(first=MagicMock(return_value=existing)))):
            with patch('fiscal.services.validate_fiscal_config_for_receipt', return_value=[]):
                assert reconcile_receipt_fiscal(receipt, t)['document'] == existing


# ── catalog/serializers.py ──────────────────────────────────────


class TestApplyProductSerializer:
    def test_tracks_inventory_no_stock(self):
        from catalog.serializers import ApplyProductSerializer
        ser = ApplyProductSerializer(data={
            'command_id': 'c',
            'product': {'tracks_inventory': True, 'product_kind': 'produto', 'name': 'P', 'base_unit': str(uuid.uuid4())},
        })
        assert not ser.is_valid() and 'stock' in ser.errors

    def test_service_with_stock(self):
        from catalog.serializers import ApplyProductSerializer
        ser = ApplyProductSerializer(data={
            'command_id': 'c',
            'product': {'tracks_inventory': False, 'product_kind': 'servico', 'name': 'S', 'base_unit': str(uuid.uuid4())},
            'stock': {'location': str(uuid.uuid4())},
        })
        assert not ser.is_valid() and 'stock' in ser.errors
