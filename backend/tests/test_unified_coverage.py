"""Unified coverage tests targeting the 9 files with largest coverage gaps."""
from __future__ import annotations

import uuid
from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.utils import timezone

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
        user=user, tenant=tenant,
        defaults={'role': 'admin', 'is_active': True},
    )
    client.force_login(user)
    session = client.session
    session['mfa_tenant_id'] = str(tenant.id)
    session['mfa_method'] = 'totp'
    session.save()
    return client


def _mk_fake_location():
    """Return a fake location that won't match any DB row."""
    return SimpleNamespace(id=uuid.uuid4())


@pytest.fixture
def uc(client):
    from catalog.models import Product, ProductPrice, Unit
    from fiscal.models import FiscalEmitter
    from inventory.models import StockLocation
    from inventory.services import create_receipt
    from sales.services import create_counter_sale, open_cash_session

    tenant = Tenant.objects.create(name='UC Tenant', slug='uc-tenant')
    user = User.objects.create_user(email='uc@test.local', password='pass123')
    _auth_client(client, user, tenant)

    def _create():
        unit = Unit.all_objects.create(tenant=tenant, symbol='UN', name='Unidade')
        product = Product.all_objects.create(
            tenant=tenant, sku='UC-PROD', name='Produto UC', base_unit=unit, ncm='12345678',
        )
        ProductPrice.all_objects.create(
            tenant=tenant, product=product, amount=Decimal('25.00'), valid_from=timezone.now(),
        )
        company = Company.all_objects.create(tenant=tenant, name='Empresa UC', cnpj='11223344000155')
        branch = Branch.all_objects.create(tenant=tenant, company=company, name='Filial UC')
        FiscalEmitter.all_objects.create(
            tenant=tenant, branch=branch, provider='plugnotas',
            cpf_cnpj='11223344000155', registered_at_provider=True,
        )
        location = StockLocation.all_objects.create(
            tenant=tenant, branch=branch, code='BALC', name='Balcão', is_primary=True,
        )
        create_receipt(
            tenant, branch, product, location, Decimal('100'), unit, Decimal('1'),
            idempotency_key='uc-seed', actor=user, reason='seed',
        )
        open_cash_session(
            tenant=tenant, branch=branch, operator=user,
            opening_amount=Decimal('0'), idempotency_key='uc-cash',
        )
        sale = create_counter_sale(
            tenant=tenant, branch=branch, operator=user, stock_location=location,
            items=[{'product': product, 'unit': unit, 'quantity': Decimal('1'), 'factor': Decimal('1')}],
            payments=[{'method': 'cash', 'amount': Decimal('25.00')}],
            idempotency_key='uc-sale',
        )
        return {
            'tenant': tenant, 'user': user, 'unit': unit, 'product': product,
            'company': company, 'branch': branch, 'location': location,
            'client': client, 'sale': sale,
        }

    return _run_in_tenant(tenant, _create)


# ═══════════════════════════════════════════════════════════════════
# 1. inventory/services/product_stock.py
# ═══════════════════════════════════════════════════════════════════

class TestProductStockHelpers:
    @pytest.mark.django_db
    def test_compute_stock_status_negative(self):
        from inventory.services.product_stock import compute_stock_status
        assert compute_stock_status(available=-5, reorder_point=10) == 'negative'

    @pytest.mark.django_db
    def test_compute_stock_status_zero(self):
        from inventory.services.product_stock import compute_stock_status
        assert compute_stock_status(available=0, reorder_point=10) == 'zero'

    @pytest.mark.django_db
    def test_compute_stock_status_low(self):
        from inventory.services.product_stock import compute_stock_status
        assert compute_stock_status(available=3, reorder_point=5) == 'low'

    @pytest.mark.django_db
    def test_compute_stock_status_normal(self):
        from inventory.services.product_stock import compute_stock_status
        assert compute_stock_status(available=50, reorder_point=10) == 'normal'

    @pytest.mark.django_db
    def test_format_quantity(self):
        from inventory.services.product_stock import _format_quantity
        assert _format_quantity(Decimal('10.000')) == '10'
        assert _format_quantity(Decimal('0')) == '0'
        assert _format_quantity(Decimal('3.140')) == '3.14'

    @pytest.mark.django_db
    def test_build_summary_with_balance(self, uc):
        from inventory.models import ProductStockPolicy, StockBalance
        from inventory.services.product_stock import build_product_stock_summary
        balance = StockBalance.all_objects.filter(
            tenant=uc['tenant'], product=uc['product'], location=uc['location'],
        ).first()
        policy = ProductStockPolicy.all_objects.create(
            tenant=uc['tenant'], product=uc['product'], branch=uc['branch'],
            location=uc['location'], reorder_point=Decimal('10'),
            minimum_quantity=Decimal('5'), maximum_quantity=Decimal('200'),
        )
        s = build_product_stock_summary(product=uc['product'], policy=policy, balance=balance)
        assert s['status'] in ('normal', 'low')
        assert s['maximum_quantity'] is not None

    @pytest.mark.django_db
    def test_build_summary_no_balance(self, uc):
        from inventory.models import ProductStockPolicy
        from inventory.services.product_stock import build_product_stock_summary
        policy = ProductStockPolicy.all_objects.create(
            tenant=uc['tenant'], product=uc['product'], branch=uc['branch'],
            location=uc['location'], reorder_point=Decimal('0'),
        )
        s = build_product_stock_summary(product=uc['product'], policy=policy, balance=None)
        assert s['quantity'] == '0'
        assert s['maximum_quantity'] is None


class TestApplyInitialProductStock:
    @pytest.mark.django_db
    def test_with_initial_quantity(self, uc):
        from inventory.services.product_stock import apply_initial_product_stock
        data = {
            'branch': str(uc['branch'].id), 'location': str(uc['location'].id),
            'minimum_quantity': 0, 'reorder_point': 0, 'initial_quantity': 10,
        }
        result = apply_initial_product_stock(
            tenant=uc['tenant'], product=uc['product'], actor=uc['user'],
            command_id='cmd-init-1', data=data, correlation_id='corr-1',
        )
        assert result.policy is not None
        assert result.operation is not None

    @pytest.mark.django_db
    def test_without_initial_quantity(self, uc):
        from inventory.models import ProductStockPolicy
        from inventory.services.product_stock import apply_initial_product_stock
        data = {
            'branch': str(uc['branch'].id), 'location': str(uc['location'].id),
            'minimum_quantity': 5, 'maximum_quantity': 100, 'reorder_point': 10,
        }
        result = apply_initial_product_stock(
            tenant=uc['tenant'], product=uc['product'], actor=uc['user'],
            command_id='cmd-init-2', data=data,
        )
        assert result.operation is None
        policy = ProductStockPolicy.all_objects.get(tenant=uc['tenant'], product=uc['product'])
        assert policy.minimum_quantity == Decimal('5')
        assert policy.maximum_quantity == Decimal('100')


class TestDeactivateProductStockControl:
    @pytest.mark.django_db
    def test_missing_command_id(self, uc):
        from inventory.services.product_stock import (
            ProductStockControlError,
            deactivate_product_stock_control,
        )
        with pytest.raises(ProductStockControlError) as e:
            deactivate_product_stock_control(
                tenant=uc['tenant'], product=uc['product'],
                actor=uc['user'], command_id='',
            )
        assert e.value.code == 'MISSING_COMMAND_ID'

    @pytest.mark.django_db
    def test_happy_path(self, uc):
        from inventory.models import ProductStockPolicy, StockBalance
        from inventory.services.product_stock import deactivate_product_stock_control
        StockBalance.all_objects.filter(
            tenant=uc['tenant'], product=uc['product'],
        ).update(quantity=Decimal('0'))
        ProductStockPolicy.objects.create(
            tenant=uc['tenant'], product=uc['product'], branch=uc['branch'],
            location=uc['location'], is_active=True,
        )
        result = deactivate_product_stock_control(
            tenant=uc['tenant'], product=uc['product'],
            actor=uc['user'], command_id='deact-1',
        )
        assert result.action == 'deactivate'
        assert result.policy_updated >= 1

    @pytest.mark.django_db
    def test_idempotent_replay(self, uc):
        from inventory.models import ProductStockPolicy, StockBalance
        from inventory.services.product_stock import deactivate_product_stock_control
        StockBalance.all_objects.filter(
            tenant=uc['tenant'], product=uc['product'],
        ).update(quantity=Decimal('0'))
        ProductStockPolicy.objects.create(
            tenant=uc['tenant'], product=uc['product'], branch=uc['branch'],
            location=uc['location'], is_active=True,
        )
        deactivate_product_stock_control(
            tenant=uc['tenant'], product=uc['product'],
            actor=uc['user'], command_id='deact-2',
        )
        result = deactivate_product_stock_control(
            tenant=uc['tenant'], product=uc['product'],
            actor=uc['user'], command_id='deact-2',
        )
        assert result.action == 'deactivate'

    @pytest.mark.django_db
    def test_payload_mismatch(self, uc):
        from inventory.models import ProductStockControlCommand, ProductStockPolicy
        from inventory.services.product_stock import (
            ProductStockControlError,
            deactivate_product_stock_control,
        )
        ProductStockPolicy.objects.create(
            tenant=uc['tenant'], product=uc['product'], branch=uc['branch'],
            location=uc['location'], is_active=True,
        )
        ProductStockControlCommand.all_objects.create(
            tenant=uc['tenant'], command_id='deact-mm',
            action='deactivate', payload_hash='wrong',
            response_json={'policy_updated': 0}, correlation_id=uuid.uuid4(),
        )
        with pytest.raises(ProductStockControlError) as e:
            deactivate_product_stock_control(
                tenant=uc['tenant'], product=uc['product'],
                actor=uc['user'], command_id='deact-mm',
            )
        assert e.value.code == 'COMMAND_PAYLOAD_MISMATCH'

    @pytest.mark.django_db
    def test_has_reservations(self, uc):
        from inventory.models import ProductStockPolicy, StockBalance
        from inventory.services.product_stock import (
            ProductStockControlError,
            deactivate_product_stock_control,
        )
        ProductStockPolicy.objects.create(
            tenant=uc['tenant'], product=uc['product'], branch=uc['branch'],
            location=uc['location'], is_active=True,
        )
        StockBalance.objects.create(
            tenant=uc['tenant'], product=uc['product'],
            location=uc['location'], quantity=Decimal('10'), reserved=Decimal('5'),
        )
        with pytest.raises(ProductStockControlError) as e:
            deactivate_product_stock_control(
                tenant=uc['tenant'], product=uc['product'],
                actor=uc['user'], command_id='deact-res',
            )
        assert e.value.code == 'STOCK_CONTROL_HAS_RESERVATIONS'

    @pytest.mark.django_db
    def test_has_nonzero_balance(self, uc):
        from inventory.models import ProductStockPolicy, StockBalance
        from inventory.services.product_stock import (
            ProductStockControlError,
            deactivate_product_stock_control,
        )
        ProductStockPolicy.objects.create(
            tenant=uc['tenant'], product=uc['product'], branch=uc['branch'],
            location=uc['location'], is_active=True,
        )
        StockBalance.objects.create(
            tenant=uc['tenant'], product=uc['product'],
            location=uc['location'], quantity=Decimal('5'), reserved=Decimal('0'),
        )
        with pytest.raises(ProductStockControlError) as e:
            deactivate_product_stock_control(
                tenant=uc['tenant'], product=uc['product'],
                actor=uc['user'], command_id='deact-nz',
            )
        assert e.value.code == 'STOCK_CONTROL_HAS_NONZERO_BALANCE'


class TestReactivateProductStockControl:
    @pytest.mark.django_db
    def test_missing_command_id(self, uc):
        from inventory.services.product_stock import (
            ProductStockControlError,
            reactivate_product_stock_control,
        )
        with pytest.raises(ProductStockControlError) as e:
            reactivate_product_stock_control(
                tenant=uc['tenant'], product=uc['product'],
                actor=uc['user'], command_id='',
            )
        assert e.value.code == 'MISSING_COMMAND_ID'

    @pytest.mark.django_db
    def test_no_policies(self, uc):
        from inventory.services.product_stock import (
            ProductStockControlError,
            reactivate_product_stock_control,
        )
        with pytest.raises(ProductStockControlError) as e:
            reactivate_product_stock_control(
                tenant=uc['tenant'], product=uc['product'],
                actor=uc['user'], command_id='react-1',
            )
        assert e.value.code == 'STOCK_CONTROL_REACTIVATION_NOT_ALLOWED'

    @pytest.mark.django_db
    def test_happy_path_without_stocks(self, uc):
        from inventory.models import ProductStockPolicy
        from inventory.services.product_stock import reactivate_product_stock_control
        ProductStockPolicy.objects.create(
            tenant=uc['tenant'], product=uc['product'], branch=uc['branch'],
            location=uc['location'], is_active=False,
        )
        result = reactivate_product_stock_control(
            tenant=uc['tenant'], product=uc['product'],
            actor=uc['user'], command_id='react-2',
        )
        assert result.action == 'reactivate'

    @pytest.mark.django_db
    def test_invalid_stock_entry_not_dict(self, uc):
        from inventory.models import ProductStockPolicy
        from inventory.services.product_stock import (
            ProductStockControlError,
            reactivate_product_stock_control,
        )
        ProductStockPolicy.objects.create(
            tenant=uc['tenant'], product=uc['product'], branch=uc['branch'],
            location=uc['location'], is_active=False,
        )
        with pytest.raises(ProductStockControlError) as e:
            reactivate_product_stock_control(
                tenant=uc['tenant'], product=uc['product'],
                actor=uc['user'], command_id='react-3',
                initial_stocks=['not-a-dict'],
            )
        assert e.value.code == 'INVALID_INITIAL_STOCK'

    @pytest.mark.django_db
    def test_invalid_location_id(self, uc):
        from inventory.models import ProductStockPolicy
        from inventory.services.product_stock import (
            ProductStockControlError,
            reactivate_product_stock_control,
        )
        ProductStockPolicy.objects.create(
            tenant=uc['tenant'], product=uc['product'], branch=uc['branch'],
            location=uc['location'], is_active=False,
        )
        with pytest.raises(ProductStockControlError) as e:
            reactivate_product_stock_control(
                tenant=uc['tenant'], product=uc['product'],
                actor=uc['user'], command_id='react-4',
                initial_stocks=[{'location_id': 'not-a-uuid', 'quantity': '5'}],
            )
        assert e.value.code == 'INVALID_INITIAL_STOCK'

    @pytest.mark.django_db
    def test_invalid_quantity_type(self, uc):
        from inventory.models import ProductStockPolicy
        from inventory.services.product_stock import (
            ProductStockControlError,
            reactivate_product_stock_control,
        )
        ProductStockPolicy.objects.create(
            tenant=uc['tenant'], product=uc['product'], branch=uc['branch'],
            location=uc['location'], is_active=False,
        )
        with pytest.raises(ProductStockControlError) as e:
            reactivate_product_stock_control(
                tenant=uc['tenant'], product=uc['product'],
                actor=uc['user'], command_id='react-5',
                initial_stocks=[{'location_id': str(uc['location'].id), 'quantity': 'abc'}],
            )
        assert e.value.code == 'INVALID_INITIAL_STOCK'

    @pytest.mark.django_db
    def test_zero_quantity(self, uc):
        from inventory.models import ProductStockPolicy
        from inventory.services.product_stock import (
            ProductStockControlError,
            reactivate_product_stock_control,
        )
        ProductStockPolicy.objects.create(
            tenant=uc['tenant'], product=uc['product'], branch=uc['branch'],
            location=uc['location'], is_active=False,
        )
        with pytest.raises(ProductStockControlError) as e:
            reactivate_product_stock_control(
                tenant=uc['tenant'], product=uc['product'],
                actor=uc['user'], command_id='react-6',
                initial_stocks=[{'location_id': str(uc['location'].id), 'quantity': '0'}],
            )
        assert e.value.code == 'INVALID_INITIAL_STOCK'

    @pytest.mark.django_db
    def test_idempotent_replay(self, uc):
        from inventory.models import ProductStockPolicy
        from inventory.services.product_stock import reactivate_product_stock_control
        ProductStockPolicy.objects.create(
            tenant=uc['tenant'], product=uc['product'], branch=uc['branch'],
            location=uc['location'], is_active=False,
        )
        reactivate_product_stock_control(
            tenant=uc['tenant'], product=uc['product'],
            actor=uc['user'], command_id='react-idem',
        )
        result = reactivate_product_stock_control(
            tenant=uc['tenant'], product=uc['product'],
            actor=uc['user'], command_id='react-idem',
        )
        assert result.action == 'reactivate'

    @pytest.mark.django_db
    def test_payload_mismatch(self, uc):
        from inventory.models import ProductStockControlCommand, ProductStockPolicy
        from inventory.services.product_stock import (
            ProductStockControlError,
            reactivate_product_stock_control,
        )
        ProductStockPolicy.objects.create(
            tenant=uc['tenant'], product=uc['product'], branch=uc['branch'],
            location=uc['location'], is_active=False,
        )
        ProductStockControlCommand.all_objects.create(
            tenant=uc['tenant'], command_id='react-mm',
            action='reactivate', payload_hash='wrong_hash',
            response_json={}, correlation_id=uuid.uuid4(),
        )
        with pytest.raises(ProductStockControlError) as e:
            reactivate_product_stock_control(
                tenant=uc['tenant'], product=uc['product'],
                actor=uc['user'], command_id='react-mm',
            )
        assert e.value.code == 'COMMAND_PAYLOAD_MISMATCH'

    @pytest.mark.django_db
    def test_location_not_in_policies(self, uc):
        from inventory.models import ProductStockPolicy, StockLocation
        from inventory.services.product_stock import (
            ProductStockControlError,
            reactivate_product_stock_control,
        )
        ProductStockPolicy.objects.create(
            tenant=uc['tenant'], product=uc['product'], branch=uc['branch'],
            location=uc['location'], is_active=False,
        )
        other_loc = StockLocation.objects.create(
            tenant=uc['tenant'], branch=uc['branch'], code='X', name='X',
        )
        with pytest.raises(ProductStockControlError) as e:
            reactivate_product_stock_control(
                tenant=uc['tenant'], product=uc['product'],
                actor=uc['user'], command_id='react-noloc',
                initial_stocks=[{'location_id': str(other_loc.id), 'quantity': '5'}],
            )
        assert e.value.code == 'INVALID_INITIAL_STOCK'

    @pytest.mark.django_db
    def test_negative_quantity(self, uc):
        from inventory.models import ProductStockPolicy
        from inventory.services.product_stock import (
            ProductStockControlError,
            reactivate_product_stock_control,
        )
        ProductStockPolicy.objects.create(
            tenant=uc['tenant'], product=uc['product'], branch=uc['branch'],
            location=uc['location'], is_active=False,
        )
        with pytest.raises(ProductStockControlError) as e:
            reactivate_product_stock_control(
                tenant=uc['tenant'], product=uc['product'],
                actor=uc['user'], command_id='react-neg',
                initial_stocks=[{'location_id': str(uc['location'].id), 'quantity': '-5'}],
            )
        assert e.value.code == 'INVALID_INITIAL_STOCK'


# ═══════════════════════════════════════════════════════════════════
# 2. inventory/services/operations.py
# ═══════════════════════════════════════════════════════════════════

class TestNormalizeQuantity:
    @pytest.mark.django_db
    def test_valid(self, uc):
        from inventory.services.operations import normalize_quantity
        assert normalize_quantity(Decimal('10'), uc['unit']) == Decimal('10')

    @pytest.mark.django_db
    def test_precision_error(self, uc):
        from inventory.services.operations import QuantityPrecisionError, normalize_quantity
        with pytest.raises(QuantityPrecisionError):
            normalize_quantity(Decimal('10.12345'), uc['unit'])


class TestValidateLotRules:
    @pytest.mark.django_db
    def test_requires_lot_but_none(self, uc):
        from inventory.services.operations import InvalidLotError, _validate_lot_rules
        product = uc['product']
        product.requires_lot = True
        product.save()
        with pytest.raises(InvalidLotError):
            _validate_lot_rules(product, None)

    @pytest.mark.django_db
    def test_lot_wrong_product(self, uc):
        from inventory.models import StockLot
        from inventory.services.operations import InvalidLotError, _validate_lot_rules
        lot = StockLot.all_objects.create(
            tenant=uc['tenant'], product=uc['product'], lot_number='L1',
        )
        fake_product = SimpleNamespace(
            id=uuid.uuid4(), requires_lot=False, requires_expiry=False,
        )
        with pytest.raises(InvalidLotError):
            _validate_lot_rules(fake_product, lot)

    @pytest.mark.django_db
    def test_requires_expiry_but_none(self, uc):
        from inventory.services.operations import InvalidLotError, _validate_lot_rules
        product = uc['product']
        product.requires_expiry = True
        product.requires_lot = False
        product.save()
        with pytest.raises(InvalidLotError):
            _validate_lot_rules(product, None)

    @pytest.mark.django_db
    def test_expired_lot(self, uc):
        from datetime import date

        from inventory.models import StockLot
        from inventory.services.operations import ExpiredLotError, _validate_lot_rules
        product = uc['product']
        product.requires_lot = False
        product.requires_expiry = False
        product.save()
        lot = StockLot.all_objects.create(
            tenant=uc['tenant'], product=product, lot_number='EXP',
            expiry_date=date(2020, 1, 1),
        )
        with pytest.raises(ExpiredLotError):
            _validate_lot_rules(product, lot)


class TestApplyBalanceDelta:
    @pytest.mark.django_db
    def test_positive_delta(self, uc):
        from inventory.services.operations import _apply_balance_delta, _get_balance
        balance = _get_balance(uc['tenant'], uc['product'], uc['location'])
        initial = balance.quantity
        result = _apply_balance_delta(uc['tenant'], uc['product'], uc['location'], Decimal('50'))
        assert result.quantity == initial + Decimal('50')

    @pytest.mark.django_db
    def test_negative_insufficient(self, uc):
        from inventory.services.operations import InsufficientStock, _apply_balance_delta
        with pytest.raises(InsufficientStock):
            _apply_balance_delta(uc['tenant'], uc['product'], uc['location'], Decimal('-9999'))


class TestGetAvailableStock:
    @pytest.mark.django_db
    def test_with_balance(self, uc):
        from inventory.services.operations import get_available_stock
        result = get_available_stock(uc['tenant'], uc['product'], uc['location'])
        assert result > 0

    @pytest.mark.django_db
    def test_no_balance(self, uc):
        from inventory.models import StockLocation
        from inventory.services.operations import get_available_stock
        loc2 = StockLocation.objects.create(
            tenant=uc['tenant'], branch=uc['branch'], code='EMPTY', name='Empty',
        )
        result = get_available_stock(uc['tenant'], uc['product'], loc2)
        assert result == Decimal('0')

    @pytest.mark.django_db
    def test_exclude_reserved(self, uc):
        from inventory.services.operations import get_available_stock
        result = get_available_stock(
            uc['tenant'], uc['product'], uc['location'], exclude_reserved=True,
        )
        assert result >= 0


class TestReserveStock:
    @pytest.mark.django_db
    def test_happy_path(self, uc):
        from inventory.services.operations import reserve_stock
        balance = reserve_stock(uc['tenant'], uc['product'], uc['location'], Decimal('5'))
        assert balance.reserved == Decimal('5')

    @pytest.mark.django_db
    def test_zero_quantity(self, uc):
        from inventory.services.operations import reserve_stock
        with pytest.raises(ValueError):
            reserve_stock(uc['tenant'], uc['product'], uc['location'], Decimal('0'))

    @pytest.mark.django_db
    def test_insufficient(self, uc):
        from inventory.services.operations import InsufficientStock, reserve_stock
        with pytest.raises(InsufficientStock):
            reserve_stock(uc['tenant'], uc['product'], uc['location'], Decimal('9999'))


class TestReleaseReservation:
    @pytest.mark.django_db
    def test_happy_path(self, uc):
        from inventory.services.operations import release_reservation, reserve_stock
        reserve_stock(uc['tenant'], uc['product'], uc['location'], Decimal('5'))
        balance = release_reservation(uc['tenant'], uc['product'], uc['location'], Decimal('3'))
        assert balance.reserved == Decimal('2')

    @pytest.mark.django_db
    def test_zero_quantity(self, uc):
        from inventory.services.operations import release_reservation
        with pytest.raises(ValueError):
            release_reservation(uc['tenant'], uc['product'], uc['location'], Decimal('0'))


class TestCreateOperation:
    @pytest.mark.django_db
    def test_missing_key(self, uc):
        from inventory.services.operations import create_operation
        with pytest.raises(ValueError):
            create_operation(tenant=uc['tenant'], operation_type='receipt')

    @pytest.mark.django_db
    def test_idempotent_replay(self, uc):
        from inventory.services.operations import create_operation
        op = create_operation(
            tenant=uc['tenant'], operation_type='receipt',
            idempotency_key='op-idem-1', actor=uc['user'],
        )
        op2 = create_operation(
            tenant=uc['tenant'], operation_type='receipt',
            idempotency_key='op-idem-1', actor=uc['user'],
        )
        assert op.id == op2.id

    @pytest.mark.django_db
    def test_payload_mismatch(self, uc):
        from inventory.services.operations import DuplicateIdempotencyKey, create_operation
        create_operation(
            tenant=uc['tenant'], operation_type='receipt',
            idempotency_key='op-mm', payload={'a': 1},
        )
        with pytest.raises(DuplicateIdempotencyKey):
            create_operation(
                tenant=uc['tenant'], operation_type='receipt',
                idempotency_key='op-mm', payload={'a': 2},
            )


class TestCreateIssueNoTracking:
    @pytest.mark.django_db
    def test_tracks_inventory_false(self, uc):
        from inventory.services.operations import create_issue
        product = uc['product']
        product.tracks_inventory = False
        product.save()
        result = create_issue(
            uc['tenant'], uc['branch'], product, uc['location'],
            Decimal('1'), uc['unit'], Decimal('1'),
        )
        assert result is None


class TestCreateAdjustment:
    @pytest.mark.django_db
    def test_positive(self, uc):
        from inventory.services.operations import create_adjustment
        op = create_adjustment(
            uc['tenant'], uc['branch'], uc['product'], uc['location'],
            Decimal('10'), uc['unit'], Decimal('1'), idempotency_key='adj-pos',
        )
        assert op.operation_type == 'adjustment'

    @pytest.mark.django_db
    def test_negative(self, uc):
        from inventory.services.operations import create_adjustment
        op = create_adjustment(
            uc['tenant'], uc['branch'], uc['product'], uc['location'],
            Decimal('-3'), uc['unit'], Decimal('1'), idempotency_key='adj-neg',
        )
        assert op.operation_type == 'adjustment'


class TestCreateTransfer:
    @pytest.mark.django_db
    def test_happy_path(self, uc):
        from inventory.models import StockLocation
        from inventory.services.operations import create_transfer
        loc2 = StockLocation.objects.create(
            tenant=uc['tenant'], branch=uc['branch'], code='DEST', name='Destino',
        )
        op = create_transfer(
            uc['tenant'], uc['branch'], uc['branch'], uc['product'],
            uc['location'], loc2, Decimal('5'), uc['unit'], Decimal('1'),
            idempotency_key='xfer-1',
        )
        assert op.operation_type == 'transfer'


class TestReverseOperation:
    @pytest.mark.django_db
    def test_not_confirmed(self, uc):
        from inventory.services.operations import create_operation, reverse_operation
        op = create_operation(
            tenant=uc['tenant'], operation_type='receipt',
            idempotency_key='rev-draft', status='draft',
        )
        with pytest.raises(ValueError, match='Only confirmed'):
            reverse_operation(op, reason='x')

    @pytest.mark.django_db
    def test_already_reversed(self, uc):
        from inventory.services.operations import create_receipt, reverse_operation
        op = create_receipt(
            uc['tenant'], uc['branch'], uc['product'], uc['location'],
            Decimal('5'), uc['unit'], Decimal('1'), idempotency_key='rev-1',
        )
        reverse_operation(op, reason='r1', idempotency_key='rev-r1')
        with pytest.raises(ValueError, match='Only confirmed'):
            reverse_operation(op, reason='r2', idempotency_key='rev-r2')

    @pytest.mark.django_db
    def test_happy_path(self, uc):
        from inventory.services.operations import create_receipt, reverse_operation
        op = create_receipt(
            uc['tenant'], uc['branch'], uc['product'], uc['location'],
            Decimal('10'), uc['unit'], Decimal('1'), idempotency_key='rev-ok',
        )
        reversal = reverse_operation(op, reason='test reverse', idempotency_key='rev-ok-r')
        assert reversal.operation_type == 'reversal'


class TestGetStockBalance:
    @pytest.mark.django_db
    def test_with_balance(self, uc):
        from inventory.services.operations import get_stock_balance
        qty = get_stock_balance(uc['tenant'], uc['product'], uc['location'])
        assert qty > 0

    @pytest.mark.django_db
    def test_no_balance(self, uc):
        from inventory.models import StockLocation
        from inventory.services.operations import get_stock_balance
        loc2 = StockLocation.objects.create(
            tenant=uc['tenant'], branch=uc['branch'], code='NB', name='NB',
        )
        qty = get_stock_balance(uc['tenant'], uc['product'], loc2)
        assert qty == Decimal('0')


class TestReconcileStockBalances:
    @pytest.mark.django_db
    def test_no_divergences(self, uc):
        from inventory.services.operations import reconcile_stock_balances
        divs = reconcile_stock_balances(uc['tenant'])
        assert isinstance(divs, list)


class TestProcessOperation:
    @pytest.mark.django_db
    def test_process(self, uc):
        from inventory.services.operations import create_receipt, process_operation
        op = create_receipt(
            uc['tenant'], uc['branch'], uc['product'], uc['location'],
            Decimal('5'), uc['unit'], Decimal('1'), idempotency_key='proc-1',
        )
        result = process_operation(op)
        assert result.status == 'confirmed'


# ═══════════════════════════════════════════════════════════════════
# 3. sales/services.py
# ═══════════════════════════════════════════════════════════════════

class TestCloseCashSession:
    @pytest.mark.django_db
    def test_missing_key(self, uc):
        from sales.models import CashSession
        from sales.services import close_cash_session
        session = CashSession.all_objects.filter(tenant=uc['tenant']).first()
        with pytest.raises(ValueError):
            close_cash_session(cash_session=session, closing_amount=0, idempotency_key='')

    @pytest.mark.django_db
    def test_already_closed(self, uc):
        from sales.models import CashSession
        from sales.services import close_cash_session
        session = CashSession.all_objects.filter(tenant=uc['tenant']).first()
        session.status = 'closed'
        session.save()
        result = close_cash_session(cash_session=session, closing_amount=0, idempotency_key='cc-1')
        assert result.status == 'closed'

    @pytest.mark.django_db
    def test_with_difference(self, uc):
        from sales.models import CashSession
        from sales.services import close_cash_session
        session = CashSession.all_objects.filter(tenant=uc['tenant']).first()
        result = close_cash_session(
            cash_session=session, closing_amount=Decimal('100.00'),
            idempotency_key='cc-diff',
        )
        assert result.status == 'closed'


class TestCreateCounterSale:
    @pytest.mark.django_db
    def test_empty_items(self, uc):
        from sales.services import EmptySale, create_counter_sale
        with pytest.raises(EmptySale):
            create_counter_sale(
                tenant=uc['tenant'], branch=uc['branch'], operator=uc['user'],
                stock_location=uc['location'], items=[], payments=[],
                idempotency_key='cs-empty',
            )

    @pytest.mark.django_db
    def test_no_payments(self, uc):
        from sales.services import PaymentMismatch, create_counter_sale
        with pytest.raises(PaymentMismatch):
            create_counter_sale(
                tenant=uc['tenant'], branch=uc['branch'], operator=uc['user'],
                stock_location=uc['location'],
                items=[{'product': uc['product'], 'unit': uc['unit'],
                        'quantity': Decimal('1'), 'factor': Decimal('1')}],
                payments=[], idempotency_key='cs-nopay',
            )

    @pytest.mark.django_db
    def test_idempotent_replay(self, uc):
        from sales.services import create_counter_sale
        def _run():
            sale = create_counter_sale(
                tenant=uc['tenant'], branch=uc['branch'], operator=uc['user'],
                stock_location=uc['location'],
                items=[{'product': uc['product'], 'unit': uc['unit'],
                        'quantity': Decimal('1'), 'factor': Decimal('1')}],
                payments=[{'method': 'cash', 'amount': Decimal('25.00')}],
                idempotency_key='cs-idem',
            )
            sale2 = create_counter_sale(
                tenant=uc['tenant'], branch=uc['branch'], operator=uc['user'],
                stock_location=uc['location'],
                items=[{'product': uc['product'], 'unit': uc['unit'],
                        'quantity': Decimal('1'), 'factor': Decimal('1')}],
                payments=[{'method': 'cash', 'amount': Decimal('25.00')}],
                idempotency_key='cs-idem',
            )
            assert sale.id == sale2.id
        _run_in_tenant(uc['tenant'], _run)

    @pytest.mark.django_db
    def test_payment_mismatch(self, uc):
        from sales.services import PaymentMismatch, create_counter_sale
        def _run():
            with pytest.raises(PaymentMismatch):
                create_counter_sale(
                    tenant=uc['tenant'], branch=uc['branch'], operator=uc['user'],
                    stock_location=uc['location'],
                    items=[{'product': uc['product'], 'unit': uc['unit'],
                            'quantity': Decimal('1'), 'factor': Decimal('1')}],
                    payments=[{'method': 'cash', 'amount': Decimal('1.00')}],
                    idempotency_key='cs-mismatch',
                )
        _run_in_tenant(uc['tenant'], _run)

    @pytest.mark.django_db
    def test_no_cash_session(self, uc):
        from sales.models import CashSession
        from sales.services import CashSessionRequired, create_counter_sale
        CashSession.all_objects.filter(tenant=uc['tenant']).update(status='closed')
        with pytest.raises(CashSessionRequired):
            create_counter_sale(
                tenant=uc['tenant'], branch=uc['branch'], operator=uc['user'],
                stock_location=uc['location'],
                items=[{'product': uc['product'], 'unit': uc['unit'],
                        'quantity': Decimal('1'), 'factor': Decimal('1')}],
                payments=[{'method': 'cash', 'amount': Decimal('25.00')}],
                idempotency_key='cs-nosess',
            )


class TestCreateSaleReturn:
    @pytest.mark.django_db
    def test_missing_key(self, uc):
        from sales.services import create_sale_return
        with pytest.raises(ValueError):
            create_sale_return(
                tenant=uc['tenant'], sale=uc['sale'], items=[], reason='x',
                idempotency_key='',
            )

    @pytest.mark.django_db
    def test_empty_items(self, uc):
        from sales.services import create_sale_return
        with pytest.raises(ValueError):
            create_sale_return(
                tenant=uc['tenant'], sale=uc['sale'], items=[], reason='x',
                idempotency_key='sr-empty',
            )

    @pytest.mark.django_db
    def test_no_reason(self, uc):
        from sales.services import create_sale_return
        with pytest.raises(ValueError):
            create_sale_return(
                tenant=uc['tenant'], sale=uc['sale'],
                items=[{'sale_item_id': uuid.uuid4(), 'quantity': 1}],
                reason='', idempotency_key='sr-noreason',
            )

    @pytest.mark.django_db
    def test_happy_path(self, uc):
        from sales.models import SaleItem
        from sales.services import create_sale_return
        sale_item = SaleItem.all_objects.filter(tenant=uc['tenant']).first()
        ret = create_sale_return(
            tenant=uc['tenant'], sale=uc['sale'],
            items=[{'sale_item_id': str(sale_item.id), 'quantity': 1}],
            reason='wrong item', idempotency_key='sr-happy', actor=uc['user'],
        )
        assert ret.status == 'completed'

    @pytest.mark.django_db
    def test_idempotent_replay(self, uc):
        from sales.models import SaleItem
        from sales.services import create_sale_return
        sale_item = SaleItem.all_objects.filter(tenant=uc['tenant']).first()
        create_sale_return(
            tenant=uc['tenant'], sale=uc['sale'],
            items=[{'sale_item_id': str(sale_item.id), 'quantity': 1}],
            reason='test', idempotency_key='sr-idem', actor=uc['user'],
        )
        ret2 = create_sale_return(
            tenant=uc['tenant'], sale=uc['sale'],
            items=[{'sale_item_id': str(sale_item.id), 'quantity': 1}],
            reason='test', idempotency_key='sr-idem', actor=uc['user'],
        )
        assert ret2 is not None

    @pytest.mark.django_db
    def test_item_not_found(self, uc):
        from sales.services import create_sale_return
        with pytest.raises(ValueError, match='not found'):
            create_sale_return(
                tenant=uc['tenant'], sale=uc['sale'],
                items=[{'sale_item_id': str(uuid.uuid4()), 'quantity': 1}],
                reason='x', idempotency_key='sr-notfound',
            )

    @pytest.mark.django_db
    def test_insufficient_returnable(self, uc):
        from sales.models import SaleItem
        from sales.services import InsufficientReturnableQuantity, create_sale_return
        sale_item = SaleItem.all_objects.filter(tenant=uc['tenant']).first()
        with pytest.raises(InsufficientReturnableQuantity):
            create_sale_return(
                tenant=uc['tenant'], sale=uc['sale'],
                items=[{'sale_item_id': str(sale_item.id), 'quantity': 9999}],
                reason='x', idempotency_key='sr-insuf',
            )


class TestCreateSaleRefund:
    @pytest.mark.django_db
    def test_missing_key(self, uc):
        from sales.services import create_sale_refund
        with pytest.raises(ValueError):
            create_sale_refund(
                tenant=uc['tenant'], sale=uc['sale'], method='cash',
                amount=Decimal('10'), reason='Teste sem chave', idempotency_key='',
            )

    @pytest.mark.django_db
    def test_zero_amount(self, uc):
        from sales.services import create_sale_refund
        with pytest.raises(ValueError):
            create_sale_refund(
                tenant=uc['tenant'], sale=uc['sale'], method='cash',
                amount=Decimal('0'), reason='Teste zero', idempotency_key='sr-zero',
            )

    @pytest.mark.django_db
    def test_cash_refund(self, uc):
        from sales.services import create_sale_refund
        refund = create_sale_refund(
            tenant=uc['tenant'], sale=uc['sale'], method='cash',
            amount=Decimal('10.00'), reason='Devolução ao cliente',
            idempotency_key='sr-cash', actor=uc['user'],
        )
        assert refund.status == 'completed'

    @pytest.mark.django_db
    def test_pix_refund(self, uc):
        from sales.services import create_sale_refund
        refund = create_sale_refund(
            tenant=uc['tenant'], sale=uc['sale'], method='pix',
            amount=Decimal('10.00'), reason='Devolução ao cliente',
            idempotency_key='sr-pix',
        )
        assert refund.method == 'pix'

    @pytest.mark.django_db
    def test_idempotent_replay(self, uc):
        from sales.services import create_sale_refund
        create_sale_refund(
            tenant=uc['tenant'], sale=uc['sale'], method='pix',
            amount=Decimal('5.00'), reason='Devolução ao cliente',
            idempotency_key='sr-idem2',
        )
        refund2 = create_sale_refund(
            tenant=uc['tenant'], sale=uc['sale'], method='pix',
            amount=Decimal('5.00'), reason='Devolução ao cliente',
            idempotency_key='sr-idem2',
        )
        assert refund2 is not None


class TestCancelSale:
    @pytest.mark.django_db
    def test_missing_key(self, uc):
        from sales.services import cancel_sale
        with pytest.raises(ValueError):
            cancel_sale(
                tenant=uc['tenant'], sale=uc['sale'], reason='x',
                idempotency_key='',
            )

    @pytest.mark.django_db
    def test_no_reason(self, uc):
        from sales.services import cancel_sale
        with pytest.raises(ValueError):
            cancel_sale(
                tenant=uc['tenant'], sale=uc['sale'], reason='',
                idempotency_key='cs-noreason',
            )

    @pytest.mark.django_db
    def test_already_cancelled(self, uc):
        from sales.services import SaleAlreadyCancelled, cancel_sale
        uc['sale'].status = 'cancelled'
        uc['sale'].save()
        with pytest.raises(SaleAlreadyCancelled):
            cancel_sale(
                tenant=uc['tenant'], sale=uc['sale'], reason='x',
                idempotency_key='cs-cancelled',
            )

    @pytest.mark.django_db
    def test_happy_path(self, uc):
        from sales.services import cancel_sale
        cancellation = cancel_sale(
            tenant=uc['tenant'], sale=uc['sale'], reason='customer changed mind',
            idempotency_key='cs-happy', actor=uc['user'],
        )
        assert cancellation.status == 'completed'

    @pytest.mark.django_db
    def test_idempotent_replay(self, uc):
        from sales.services import cancel_sale
        cancel_sale(
            tenant=uc['tenant'], sale=uc['sale'], reason='test',
            idempotency_key='cs-idem2',
        )
        result = cancel_sale(
            tenant=uc['tenant'], sale=uc['sale'], reason='test',
            idempotency_key='cs-idem2',
        )
        assert result is not None

    @pytest.mark.django_db
    def test_payload_mismatch(self, uc):
        from sales.services import DuplicateIdempotencyKey, cancel_sale
        cancel_sale(
            tenant=uc['tenant'], sale=uc['sale'], reason='reason1',
            idempotency_key='cs-mm',
        )
        with pytest.raises(DuplicateIdempotencyKey):
            cancel_sale(
                tenant=uc['tenant'], sale=uc['sale'], reason='reason2',
                idempotency_key='cs-mm',
            )


# ═══════════════════════════════════════════════════════════════════
# 4. sales/views.py
# ═══════════════════════════════════════════════════════════════════

class TestSalesViews:
    @pytest.mark.django_db
    def test_cash_session_current_no_branch(self, uc):
        resp = uc['client'].get(
            '/api/v1/cash-sessions/current/',
            HTTP_X_TENANT_ID=str(uc['tenant'].id),
        )
        assert resp.status_code == 400

    @pytest.mark.django_db
    def test_cash_session_current_not_found(self, uc):
        resp = uc['client'].get(
            f'/api/v1/cash-sessions/current/?branch={uuid.uuid4()}',
            HTTP_X_TENANT_ID=str(uc['tenant'].id),
        )
        assert resp.status_code == 404

    @pytest.mark.django_db
    def test_cash_session_current_found(self, uc):
        from sales.models import CashSession
        session = CashSession.all_objects.filter(tenant=uc['tenant']).first()
        resp = uc['client'].get(
            f'/api/v1/cash-sessions/current/?branch={session.branch_id}',
            HTTP_X_TENANT_ID=str(uc['tenant'].id),
        )
        assert resp.status_code == 200

    @pytest.mark.django_db
    def test_cash_session_list(self, uc):
        resp = uc['client'].get(
            '/api/v1/cash-sessions/',
            HTTP_X_TENANT_ID=str(uc['tenant'].id),
        )
        assert resp.status_code == 200

    @pytest.mark.django_db
    def test_cash_session_list_filter_branch(self, uc):
        from sales.models import CashSession
        session = CashSession.all_objects.filter(tenant=uc['tenant']).first()
        resp = uc['client'].get(
            f'/api/v1/cash-sessions/?branch={session.branch_id}',
            HTTP_X_TENANT_ID=str(uc['tenant'].id),
        )
        assert resp.status_code == 200

    @pytest.mark.django_db
    def test_cash_session_list_filter_operator(self, uc):
        resp = uc['client'].get(
            f'/api/v1/cash-sessions/?operator={uc["user"].id}',
            HTTP_X_TENANT_ID=str(uc['tenant'].id),
        )
        assert resp.status_code == 200

    @pytest.mark.django_db
    def test_cash_session_list_filter_dates(self, uc):
        today = timezone.now().date().isoformat()
        resp = uc['client'].get(
            f'/api/v1/cash-sessions/?date_from={today}&date_to={today}',
            HTTP_X_TENANT_ID=str(uc['tenant'].id),
        )
        assert resp.status_code == 200

    @pytest.mark.django_db
    def test_cash_session_open(self, uc):
        from sales.models import CashSession
        CashSession.all_objects.filter(tenant=uc['tenant']).update(status='closed')
        resp = uc['client'].post(
            '/api/v1/cash-sessions/open/',
            data={'branch': str(uc['branch'].id), 'opening_amount': '50.00'},
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY='view-open-1',
            HTTP_X_TENANT_ID=str(uc['tenant'].id),
        )
        assert resp.status_code == 201

    @pytest.mark.django_db
    def test_cash_session_close(self, uc):
        from sales.models import CashSession
        session = CashSession.all_objects.filter(tenant=uc['tenant']).first()
        resp = uc['client'].post(
            f'/api/v1/cash-sessions/{session.id}/close/',
            data={'closing_amount': '0.00'},
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY='view-close-1',
            HTTP_X_TENANT_ID=str(uc['tenant'].id),
        )
        assert resp.status_code == 200

    @pytest.mark.django_db
    def test_sale_list(self, uc):
        resp = uc['client'].get(
            '/api/v1/sales/',
            HTTP_X_TENANT_ID=str(uc['tenant'].id),
        )
        assert resp.status_code == 200

    @pytest.mark.django_db
    def test_sale_list_filter(self, uc):
        resp = uc['client'].get(
            f'/api/v1/sales/?branch={uc["branch"].id}&status=confirmed',
            HTTP_X_TENANT_ID=str(uc['tenant'].id),
        )
        assert resp.status_code == 200

    @pytest.mark.django_db
    def test_sale_list_filter_dates(self, uc):
        today = timezone.now().date().isoformat()
        resp = uc['client'].get(
            f'/api/v1/sales/?date_from={today}&date_to={today}',
            HTTP_X_TENANT_ID=str(uc['tenant'].id),
        )
        assert resp.status_code == 200

    @pytest.mark.django_db
    def test_sale_list_filter_customer(self, uc):
        resp = uc['client'].get(
            f'/api/v1/sales/?customer={uuid.uuid4()}',
            HTTP_X_TENANT_ID=str(uc['tenant'].id),
        )
        assert resp.status_code == 200

    @pytest.mark.django_db
    def test_sale_counter(self, uc):
        resp = uc['client'].post(
            '/api/v1/sales/counter/',
            data={
                'branch': str(uc['branch'].id),
                'stock_location': str(uc['location'].id),
                'items': [{
                    'product': str(uc['product'].id),
                    'unit': str(uc['unit'].id),
                    'quantity': '1', 'factor': '1',
                }],
                'payments': [{'method': 'cash', 'amount': '25.00'}],
            },
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY='view-counter-1',
            HTTP_X_TENANT_ID=str(uc['tenant'].id),
        )
        assert resp.status_code == 201

    @pytest.mark.django_db
    def test_sale_returns(self, uc):
        from sales.models import SaleItem
        sale_item = SaleItem.all_objects.filter(tenant=uc['tenant']).first()
        resp = uc['client'].post(
            f'/api/v1/sales/{uc["sale"].id}/returns/',
            data={
                'items': [{'sale_item_id': str(sale_item.id), 'quantity': '1'}],
                'reason': 'wrong item',
            },
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY='view-return-1',
            HTTP_X_TENANT_ID=str(uc['tenant'].id),
        )
        assert resp.status_code == 201

    @pytest.mark.django_db
    def test_list_returns(self, uc):
        resp = uc['client'].get(
            f'/api/v1/sales/{uc["sale"].id}/returns/',
            HTTP_X_TENANT_ID=str(uc['tenant'].id),
        )
        assert resp.status_code == 200

    @pytest.mark.django_db
    def test_sale_cancel(self, uc):
        resp = uc['client'].post(
            f'/api/v1/sales/{uc["sale"].id}/cancel/',
            data={'reason': 'customer changed mind'},
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY='view-cancel-1',
            HTTP_X_TENANT_ID=str(uc['tenant'].id),
        )
        assert resp.status_code == 201

    @pytest.mark.django_db
    def test_sale_export(self, uc):
        resp = uc['client'].get(
            '/api/v1/sales/export/',
            HTTP_X_TENANT_ID=str(uc['tenant'].id),
        )
        assert resp.status_code == 200
        assert resp['Content-Type'] == 'text/csv'

    @pytest.mark.django_db
    def test_sale_export_with_filters(self, uc):
        today = timezone.now().date().isoformat()
        resp = uc['client'].get(
            f'/api/v1/sales/export/?date_from={today}&date_to={today}&branch={uc["branch"].id}',
            HTTP_X_TENANT_ID=str(uc['tenant'].id),
        )
        assert resp.status_code == 200


class TestSyncBatchView:
    @pytest.mark.django_db
    def test_cash_session_open_batch(self, uc):
        from sales.models import CashSession
        CashSession.all_objects.filter(tenant=uc['tenant']).update(status='closed')
        resp = uc['client'].post(
            '/api/v1/sync/batch/',
            data={'operations': [{
                'type': 'cash-session:open',
                'payload': {'branch': str(uc['branch'].id), 'opening_amount': '50.00'},
                'idempotency_key': 'batch-open-1',
            }]},
            content_type='application/json',
            HTTP_X_TENANT_ID=str(uc['tenant'].id),
        )
        assert resp.status_code == 200
        assert resp.data['results'][0]['status'] == 'synced'

    @pytest.mark.django_db
    def test_cash_session_close_batch(self, uc):
        from sales.models import CashSession
        session = CashSession.all_objects.filter(tenant=uc['tenant']).first()
        resp = uc['client'].post(
            '/api/v1/sync/batch/',
            data={'operations': [{
                'type': 'cash-session:close',
                'payload': {'session_id': str(session.id), 'closing_amount': '0.00'},
                'idempotency_key': 'batch-close-1',
            }]},
            content_type='application/json',
            HTTP_X_TENANT_ID=str(uc['tenant'].id),
        )
        assert resp.status_code == 200

    @pytest.mark.django_db
    def test_unknown_type(self, uc):
        resp = uc['client'].post(
            '/api/v1/sync/batch/',
            data={'operations': [{
                'type': 'unknown:type', 'payload': {},
                'idempotency_key': 'batch-unk-1',
            }]},
            content_type='application/json',
            HTTP_X_TENANT_ID=str(uc['tenant'].id),
        )
        assert resp.status_code == 400

    @pytest.mark.django_db
    def test_missing_session_id(self, uc):
        resp = uc['client'].post(
            '/api/v1/sync/batch/',
            data={'operations': [{
                'type': 'cash-session:close',
                'payload': {'closing_amount': '0.00'},
                'idempotency_key': 'batch-nosess',
            }]},
            content_type='application/json',
            HTTP_X_TENANT_ID=str(uc['tenant'].id),
        )
        assert resp.status_code == 200
        assert resp.data['results'][0]['status'] == 'failed'

    @pytest.mark.django_db
    def test_duplicate_idempotency(self, uc):
        from sales.models import CashSession
        CashSession.all_objects.filter(tenant=uc['tenant']).update(status='closed')
        uc['client'].post(
            '/api/v1/sync/batch/',
            data={'operations': [{
                'type': 'cash-session:open',
                'payload': {'branch': str(uc['branch'].id), 'opening_amount': '50.00'},
                'idempotency_key': 'batch-dup-1',
            }]},
            content_type='application/json',
            HTTP_X_TENANT_ID=str(uc['tenant'].id),
        )
        resp2 = uc['client'].post(
            '/api/v1/sync/batch/',
            data={'operations': [{
                'type': 'cash-session:open',
                'payload': {'branch': str(uc['branch'].id), 'opening_amount': '99.00'},
                'idempotency_key': 'batch-dup-1',
            }]},
            content_type='application/json',
            HTTP_X_TENANT_ID=str(uc['tenant'].id),
        )
        assert resp2.data['results'][0]['status'] == 'conflict'


# ═══════════════════════════════════════════════════════════════════
# 5. fiscal/services.py
# ═══════════════════════════════════════════════════════════════════

class TestResolveProvider:
    @pytest.mark.django_db
    def test_default(self):
        from fiscal.services import _resolve_provider
        provider = _resolve_provider('plugnotas')
        assert hasattr(provider, 'emit')

    @pytest.mark.django_db
    def test_unknown(self):
        from fiscal.services import _resolve_provider
        provider = _resolve_provider('unknown')
        assert provider is not None


class TestResolveEmitter:
    @pytest.mark.django_db
    def test_found(self, uc):
        from fiscal.services import resolve_emitter
        emitter = resolve_emitter(uc['branch'])
        assert emitter is not None

    @pytest.mark.django_db
    def test_not_found(self, uc):
        from fiscal.services import resolve_emitter
        from inventory.models import StockLocation
        loc2 = StockLocation.objects.create(
            tenant=uc['tenant'], branch=uc['branch'], code='NE', name='NE',
        )
        assert resolve_emitter(loc2) is None


class TestResolveProductConfig:
    @pytest.mark.django_db
    def test_not_found(self, uc):
        from fiscal.services import resolve_product_config
        assert resolve_product_config(uc['product']) is None

    @pytest.mark.django_db
    def test_found(self, uc):
        from fiscal.models import FiscalProductConfig
        from fiscal.services import resolve_product_config
        FiscalProductConfig.all_objects.create(
            tenant=uc['tenant'], product=uc['product'],
            cst_icms='00', cst_pis='01', cst_cofins='01',
            aliquota_icms=Decimal('18.00'), origem='0',
        )
        config = resolve_product_config(uc['product'])
        assert config is not None
        assert config.cst_icms == '00'


class TestBuildItemDict:
    @pytest.mark.django_db
    def test_no_config(self, uc):
        from fiscal.services import build_item_dict
        from sales.models import SaleItem
        item = SaleItem.all_objects.filter(tenant=uc['tenant']).first()
        assert item is not None
        result = build_item_dict(item)
        assert result['ncm'] == uc['product'].ncm
        assert result['cst_icms'] == '00'

    @pytest.mark.django_db
    def test_with_config(self, uc):
        from fiscal.models import FiscalProductConfig
        from fiscal.services import build_item_dict
        from sales.models import SaleItem
        FiscalProductConfig.all_objects.create(
            tenant=uc['tenant'], product=uc['product'],
            cst_icms='60', cst_pis='02', cst_cofins='02',
            aliquota_icms=Decimal('12.00'), origem='1',
        )
        item = SaleItem.all_objects.filter(tenant=uc['tenant']).first()
        result = build_item_dict(item)
        assert result['cst_icms'] == '60'


class TestBuildPaymentDict:
    @pytest.mark.django_db
    def test_build(self, uc):
        from fiscal.services import build_payment_dict
        from sales.models import SalePayment
        payment = SalePayment.all_objects.filter(tenant=uc['tenant']).first()
        assert payment is not None
        result = build_payment_dict(payment)
        assert result['method'] == payment.method


class TestBuildRecipientDict:
    @pytest.mark.django_db
    def test_none_person(self):
        from fiscal.services import build_recipient_dict
        assert build_recipient_dict(None) is None

    @pytest.mark.django_db
    def test_person_without_docs(self, uc):
        from fiscal.services import build_recipient_dict
        from people.models import Person
        person = Person.all_objects.create(tenant=uc['tenant'], person_type='PF', name='João')
        result = build_recipient_dict(person)
        assert result['name'] == 'João'
        assert result['cpf_cnpj'] == ''
        assert result['address'] is None

    @pytest.mark.django_db
    def test_person_with_doc(self, uc):
        from fiscal.services import build_recipient_dict
        from people.models import Person, PersonDocument
        person = Person.all_objects.create(tenant=uc['tenant'], person_type='PF', name='Maria')
        PersonDocument.all_objects.create(
            tenant=uc['tenant'], person=person, document_type='CPF', value='12345678900',
        )
        result = build_recipient_dict(person)
        assert result['cpf_cnpj'] == '12345678900'

    @pytest.mark.django_db
    def test_person_with_address(self, uc):
        from fiscal.services import build_recipient_dict
        from people.models import Person, PersonAddress
        person = Person.all_objects.create(tenant=uc['tenant'], person_type='PF', name='Carlos')
        PersonAddress.all_objects.create(
            tenant=uc['tenant'], person=person, address_type='fiscal',
            street='Rua A', number='123', city='SP', state='SP', postal_code='01000000',
        )
        result = build_recipient_dict(person)
        assert result['address'] is not None
        assert result['address']['street'] == 'Rua A'


class TestFiscalValidationIssue:
    @pytest.mark.django_db
    def test_as_dict(self):
        from fiscal.services import FiscalValidationIssue
        issue = FiscalValidationIssue('field', 'msg', 'warning')
        d = issue.as_dict()
        assert d['field'] == 'field'
        assert d['severity'] == 'warning'


class TestGetCfopForOperation:
    @pytest.mark.django_db
    def test_interna(self):
        from fiscal.services import _get_cfop_for_operation
        assert _get_cfop_for_operation('interna') == '1102'

    @pytest.mark.django_db
    def test_externa(self):
        from fiscal.services import _get_cfop_for_operation
        assert _get_cfop_for_operation('externa') == '2102'


class TestImportString:
    @pytest.mark.django_db
    def test_import(self):
        from fiscal.services import _import_string
        klass = _import_string('fiscal.adapters.plugnotas.PlugNotasAdapter')
        assert klass is not None


class TestEmitNfce:
    @pytest.mark.django_db
    def test_existing_document(self, uc):
        from fiscal.models import FiscalDocument
        from fiscal.services import emit_nfce
        FiscalDocument.all_objects.create(
            tenant=uc['tenant'], sale=uc['sale'], status=FiscalDocument.STATUS_CONCLUDED,
        )
        doc = emit_nfce(uc['sale'], uc['tenant'])
        assert doc.status == FiscalDocument.STATUS_CONCLUDED


class TestEmitDocument:
    @pytest.mark.django_db
    def test_no_emitter(self, uc):
        from fiscal.models import FiscalDocument, FiscalEmitter
        from fiscal.services import emit_document
        FiscalEmitter.all_objects.filter(tenant=uc['tenant']).delete()
        doc = FiscalDocument.all_objects.create(
            tenant=uc['tenant'], sale=uc['sale'], status=FiscalDocument.STATUS_PENDING,
        )
        result = emit_document(doc)
        assert result.status == FiscalDocument.STATUS_FAILED

    @pytest.mark.django_db
    def test_missing_ncm(self, uc):
        from catalog.models import Product, ProductPrice, Unit
        from fiscal.models import FiscalDocument
        from fiscal.services import emit_document
        from inventory.models import ProductStockPolicy
        from sales.services import create_counter_sale
        unit2 = Unit.all_objects.create(tenant=uc['tenant'], symbol='KG', name='Quilograma')
        prod2 = Product.all_objects.create(
            tenant=uc['tenant'], sku='NCM-EMPTY', name='Sem NCM', base_unit=unit2, ncm='',
            tracks_inventory=False,
        )
        ProductPrice.all_objects.create(
            tenant=uc['tenant'], product=prod2, amount=Decimal('10.00'), valid_from=timezone.now(),
        )
        ProductStockPolicy.all_objects.create(
            tenant=uc['tenant'], product=prod2, branch=uc['branch'],
            location=uc['location'], is_active=True,
        )
        sale2 = _run_in_tenant(uc['tenant'], lambda: create_counter_sale(
            tenant=uc['tenant'], branch=uc['branch'], operator=uc['user'],
            stock_location=uc['location'],
            items=[{'product': prod2, 'unit': unit2,
                    'quantity': Decimal('1'), 'factor': Decimal('1')}],
            payments=[{'method': 'cash', 'amount': Decimal('10.00')}],
            idempotency_key='ncm-empty-sale',
        ))
        doc = FiscalDocument.all_objects.create(
            tenant=uc['tenant'], sale=sale2, status=FiscalDocument.STATUS_PENDING,
        )
        result = [None]
        def _run():
            result[0] = emit_document(doc)
        _run_in_tenant(uc['tenant'], _run)
        assert result[0].status == FiscalDocument.STATUS_FAILED
        assert 'NCM' in result[0].error_detail

    @pytest.mark.django_db
    def test_provider_exception(self, uc):
        from fiscal.models import FiscalDocument
        from fiscal.services import emit_document
        doc = FiscalDocument.all_objects.create(
            tenant=uc['tenant'], sale=uc['sale'], status=FiscalDocument.STATUS_PENDING,
        )
        with patch('fiscal.services._resolve_provider') as mock_prov:
            mock_provider = MagicMock()
            mock_provider.emit.side_effect = Exception('Provider down')
            mock_prov.return_value = mock_provider
            result = emit_document(doc)
        assert result.status == FiscalDocument.STATUS_FAILED
        assert result.retry_count == 1


class TestApplyProviderQueryResult:
    @pytest.mark.django_db
    def test_concluded(self, uc):
        from fiscal.models import FiscalDocument
        from fiscal.ports import QueryResult
        from fiscal.services import apply_provider_query_result
        doc = FiscalDocument.all_objects.create(
            tenant=uc['tenant'], sale=uc['sale'], status=FiscalDocument.STATUS_PROCESSING,
        )
        result = QueryResult(status='CONCLUIDO', protocol='P123', xml_url='xml', pdf_url='pdf', error_reason=None)
        doc = apply_provider_query_result(doc, result)
        assert doc.status == FiscalDocument.STATUS_CONCLUDED
        assert doc.protocol == 'P123'

    @pytest.mark.django_db
    def test_rejeitado(self, uc):
        from fiscal.models import FiscalDocument
        from fiscal.ports import QueryResult
        from fiscal.services import apply_provider_query_result
        doc = FiscalDocument.all_objects.create(
            tenant=uc['tenant'], sale=uc['sale'], status=FiscalDocument.STATUS_PROCESSING,
        )
        result = QueryResult(status='REJEITADO', protocol=None, xml_url=None, pdf_url=None, error_reason='Erro')
        doc = apply_provider_query_result(doc, result)
        assert doc.status == FiscalDocument.STATUS_REJECTED
        assert doc.is_active is False

    @pytest.mark.django_db
    def test_cancelado(self, uc):
        from fiscal.models import FiscalDocument
        from fiscal.ports import QueryResult
        from fiscal.services import apply_provider_query_result
        doc = FiscalDocument.all_objects.create(
            tenant=uc['tenant'], sale=uc['sale'], status=FiscalDocument.STATUS_PROCESSING,
        )
        result = QueryResult(status='CANCELADO', protocol=None, xml_url=None, pdf_url=None, error_reason='X')
        doc = apply_provider_query_result(doc, result)
        assert doc.status == FiscalDocument.STATUS_CANCELLED
        assert doc.is_active is False

    @pytest.mark.django_db
    def test_processing(self, uc):
        from fiscal.models import FiscalDocument
        from fiscal.ports import QueryResult
        from fiscal.services import apply_provider_query_result
        doc = FiscalDocument.all_objects.create(
            tenant=uc['tenant'], sale=uc['sale'], status=FiscalDocument.STATUS_PROCESSING,
        )
        result = QueryResult(status='PROCESSANDO', protocol=None, xml_url=None, pdf_url=None, error_reason=None)
        doc = apply_provider_query_result(doc, result)
        assert doc.last_polled_at is not None


class TestPollFiscalDocument:
    @pytest.mark.django_db
    def test_timeout(self, uc):
        from fiscal.models import FiscalDocument
        from fiscal.services import poll_fiscal_document
        doc = FiscalDocument.all_objects.create(
            tenant=uc['tenant'], sale=uc['sale'], status=FiscalDocument.STATUS_PROCESSING,
        )
        doc.created_at = timezone.now() - timedelta(hours=2)
        doc.save(update_fields=['created_at'])
        result = poll_fiscal_document(doc)
        assert result.status == FiscalDocument.STATUS_FAILED

    @pytest.mark.django_db
    def test_no_provider_id(self, uc):
        from fiscal.models import FiscalDocument
        from fiscal.services import poll_fiscal_document
        doc = FiscalDocument.all_objects.create(
            tenant=uc['tenant'], sale=uc['sale'],
            status=FiscalDocument.STATUS_PROCESSING, provider_document_id='',
        )
        result = poll_fiscal_document(doc)
        assert result.status == FiscalDocument.STATUS_FAILED

    @pytest.mark.django_db
    def test_no_emitter(self, uc):
        from fiscal.models import FiscalDocument, FiscalEmitter
        from fiscal.services import poll_fiscal_document
        FiscalEmitter.all_objects.filter(tenant=uc['tenant']).delete()
        doc = FiscalDocument.all_objects.create(
            tenant=uc['tenant'], sale=uc['sale'],
            status=FiscalDocument.STATUS_PROCESSING, provider_document_id='PROV-123',
        )
        result = poll_fiscal_document(doc)
        assert result.status == FiscalDocument.STATUS_FAILED


# ═══════════════════════════════════════════════════════════════════
# 6. fiscal/tasks.py
# ═══════════════════════════════════════════════════════════════════

class TestFiscalTasks:
    @pytest.mark.django_db
    def test_handle_sale_completed_not_found(self):
        from fiscal.tasks import handle_sale_completed
        result = handle_sale_completed(str(uuid.uuid4()), tenant_id=str(uuid.uuid4()))
        assert result is None

    @pytest.mark.django_db
    def test_handle_sale_completed_no_queued_doc(self, uc):
        from fiscal.tasks import handle_sale_completed
        result = handle_sale_completed(str(uc['sale'].id), tenant_id=str(uc['tenant'].id))
        assert result is None

    @pytest.mark.django_db
    def test_handle_sale_completed_with_queued_doc(self, uc):
        from fiscal.models import FiscalDocument
        from fiscal.tasks import handle_sale_completed
        FiscalDocument.all_objects.create(
            tenant=uc['tenant'], sale=uc['sale'], status=FiscalDocument.STATUS_QUEUED,
        )
        result = handle_sale_completed(str(uc['sale'].id), tenant_id=str(uc['tenant'].id))
        assert result is not None
        assert result['status'] != FiscalDocument.STATUS_QUEUED

    @pytest.mark.django_db
    def test_poll_fiscal_document_task_not_found(self):
        from fiscal.tasks import poll_fiscal_document_task
        result = poll_fiscal_document_task(str(uuid.uuid4()))
        assert result is None

    @pytest.mark.django_db
    def test_poll_fiscal_documents(self, uc):
        from fiscal.tasks import poll_fiscal_documents
        result = poll_fiscal_documents()
        assert 'processed' in result


# ═══════════════════════════════════════════════════════════════════
# 7. catalog/services/pricing.py
# ═══════════════════════════════════════════════════════════════════

class TestResolveEffectivePrice:
    @pytest.mark.django_db
    def test_tenant_price(self, uc):
        from catalog.services.pricing import resolve_effective_price
        result = [None]
        def _run():
            result[0] = resolve_effective_price(product=uc['product'], branch=uc['branch'])
        _run_in_tenant(uc['tenant'], _run)
        assert result[0].amount == Decimal('25.00')

    @pytest.mark.django_db
    def test_branch_price_takes_priority(self, uc):
        from catalog.models import BranchPrice
        from catalog.services.pricing import resolve_effective_price
        BranchPrice.objects.create(
            tenant=uc['tenant'], product=uc['product'], branch=uc['branch'],
            amount=Decimal('30.00'), valid_from=timezone.now(),
        )
        result = [None]
        def _run():
            result[0] = resolve_effective_price(product=uc['product'], branch=uc['branch'])
        _run_in_tenant(uc['tenant'], _run)
        assert result[0].amount == Decimal('30.00')

    @pytest.mark.django_db
    def test_no_price_raises(self, uc):
        from catalog.models import Product, Unit
        from catalog.services.pricing import PriceNotAvailable, resolve_effective_price
        unit2 = Unit.all_objects.create(tenant=uc['tenant'], symbol='L', name='Litro')
        product2 = Product.all_objects.create(
            tenant=uc['tenant'], sku='NO-PRICE', name='Sem Preco', base_unit=unit2,
        )
        with pytest.raises(PriceNotAvailable):
            resolve_effective_price(product=product2, branch=uc['branch'])

    @pytest.mark.django_db
    def test_expired_price(self, uc):
        from catalog.models import ProductPrice
        from catalog.services.pricing import PriceNotAvailable, resolve_effective_price
        ProductPrice.objects.filter(tenant=uc['tenant'], product=uc['product']).update(
            valid_to=timezone.now() - timedelta(days=1),
        )
        with pytest.raises(PriceNotAvailable):
            resolve_effective_price(product=uc['product'], branch=uc['branch'])


# ═══════════════════════════════════════════════════════════════════
# 8. config/log_context.py
# ═══════════════════════════════════════════════════════════════════

class TestLogContext:
    @pytest.mark.django_db
    def test_get_default(self):
        from config.log_context import get_request_context
        ctx = get_request_context()
        assert isinstance(ctx, dict)

    @pytest.mark.django_db
    def test_set_and_get(self):
        from config.log_context import (
            get_request_context,
            reset_request_context,
            set_request_context,
        )
        request = MagicMock()
        request.correlation_id = 'corr-123'
        request.tenant = MagicMock()
        request.tenant.id = uuid.uuid4()
        request.user = MagicMock()
        request.user.is_authenticated = True
        request.user.email = 'test@test.com'
        token = set_request_context(request)
        try:
            ctx = get_request_context()
            assert ctx['correlation_id'] == 'corr-123'
            assert ctx['user'] == 'test@test.com'
        finally:
            reset_request_context(token)

    @pytest.mark.django_db
    def test_anonymous_user(self):
        from config.log_context import (
            get_request_context,
            reset_request_context,
            set_request_context,
        )
        request = MagicMock(spec=[])
        token = set_request_context(request)
        try:
            ctx = get_request_context()
            assert ctx['user'] == 'anonymous'
            assert ctx['tenant_id'] == '-'
        finally:
            reset_request_context(token)

    @pytest.mark.django_db
    def test_middleware(self):
        from config.log_context import RequestContextLogMiddleware
        get_response = MagicMock()
        get_response.return_value = MagicMock(status_code=200)
        middleware = RequestContextLogMiddleware(get_response)
        request = MagicMock()
        request.method = 'GET'
        request.path = '/test'
        request.correlation_id = 'x'
        request.tenant = MagicMock()
        request.tenant.id = uuid.uuid4()
        request.user = MagicMock()
        request.user.is_authenticated = True
        request.user.email = 'a@b.com'
        response = middleware(request)
        assert response.status_code == 200

    @pytest.mark.django_db
    def test_thread_local_filter(self):
        from config.log_context import ThreadLocalFilter, reset_request_context, set_request_context
        f = ThreadLocalFilter()
        record = MagicMock()
        request = MagicMock()
        request.correlation_id = 'corr-f'
        request.tenant = MagicMock()
        request.tenant.id = uuid.uuid4()
        request.user = MagicMock()
        request.user.is_authenticated = True
        request.user.email = 'f@f.com'
        token = set_request_context(request)
        try:
            assert f.filter(record) is True
            assert record.correlation_id == 'corr-f'
        finally:
            reset_request_context(token)

    @pytest.mark.django_db
    def test_thread_local_filter_no_context(self):
        from config.log_context import ThreadLocalFilter
        f = ThreadLocalFilter()
        record = MagicMock()
        assert f.filter(record) is True
        assert record.correlation_id == '-'
        assert record.user == '-'


# ═══════════════════════════════════════════════════════════════════
# 9. tenancy/permissions.py
# ═══════════════════════════════════════════════════════════════════

class TestHasActiveTenant:
    @pytest.mark.django_db
    def test_with_tenant(self, uc):
        from tenancy.permissions import HasActiveTenant
        perm = HasActiveTenant()
        request = MagicMock()
        request.tenant = uc['tenant']
        assert perm.has_permission(request, None) is True

    @pytest.mark.django_db
    def test_without_tenant(self):
        from tenancy.permissions import HasActiveTenant
        perm = HasActiveTenant()
        request = MagicMock(spec=['user'])
        assert perm.has_permission(request, None) is False


class TestHasVerifiedMFA:
    @pytest.mark.django_db
    def test_auth_with_device_id(self, uc):
        from tenancy.permissions import HasVerifiedMFA
        perm = HasVerifiedMFA()
        request = MagicMock()
        request.auth = {'device_id': 'abc'}
        request.tenant = uc['tenant']
        assert perm.has_permission(request, None) is True

    @pytest.mark.django_db
    def test_no_tenant(self):
        from tenancy.permissions import HasVerifiedMFA
        perm = HasVerifiedMFA()
        request = MagicMock()
        request.auth = None
        request.tenant = None
        assert perm.has_permission(request, None) is True

    @pytest.mark.django_db
    def test_no_membership(self, uc):
        from tenancy.permissions import HasVerifiedMFA
        perm = HasVerifiedMFA()
        user_no_mem = User.objects.create_user(email='nomem@test.local', password='pass')
        request = MagicMock()
        request.auth = None
        request.tenant = uc['tenant']
        request.user = user_no_mem
        assert perm.has_permission(request, None) is False

    @pytest.mark.django_db
    def test_non_admin(self, uc):
        from tenancy.models import TenantMembership
        from tenancy.permissions import HasVerifiedMFA
        perm = HasVerifiedMFA()
        user2 = User.objects.create_user(email='nonadmin@test.local', password='pass')
        TenantMembership.objects.create(user=user2, tenant=uc['tenant'], role='operator')
        request = MagicMock()
        request.auth = None
        request.tenant = uc['tenant']
        request.user = user2
        assert perm.has_permission(request, None) is True

    @pytest.mark.django_db
    def test_admin_session_match(self, uc):
        from tenancy.permissions import HasVerifiedMFA
        perm = HasVerifiedMFA()
        request = MagicMock()
        request.auth = None
        request.tenant = uc['tenant']
        request.user = uc['user']
        request.session = {'mfa_tenant_id': str(uc['tenant'].id), 'mfa_method': 'totp'}
        assert perm.has_permission(request, None) is True

    @pytest.mark.django_db
    def test_admin_session_mismatch(self, uc):
        from tenancy.permissions import HasVerifiedMFA
        perm = HasVerifiedMFA()
        request = MagicMock()
        request.auth = None
        request.tenant = uc['tenant']
        request.user = uc['user']
        request.session = {'mfa_tenant_id': str(uuid.uuid4()), 'mfa_method': 'totp'}
        assert perm.has_permission(request, None) is False

    @pytest.mark.django_db
    def test_admin_bad_method(self, uc):
        from tenancy.permissions import HasVerifiedMFA
        perm = HasVerifiedMFA()
        request = MagicMock()
        request.auth = None
        request.tenant = uc['tenant']
        request.user = uc['user']
        request.session = {'mfa_tenant_id': str(uc['tenant'].id), 'mfa_method': 'sms'}
        assert perm.has_permission(request, None) is False


class TestHasCapability:
    @pytest.mark.django_db
    def test_no_tenant(self):
        from tenancy.permissions import HasCapability
        perm = HasCapability()
        view = MagicMock()
        request = MagicMock()
        request.tenant = None
        request.user = MagicMock()
        request.user.is_authenticated = True
        assert perm.has_permission(request, view) is False

    @pytest.mark.django_db
    def test_no_user(self, uc):
        from tenancy.permissions import HasCapability
        perm = HasCapability()
        view = MagicMock()
        request = MagicMock()
        request.tenant = uc['tenant']
        request.user = None
        assert perm.has_permission(request, view) is False

    @pytest.mark.django_db
    def test_unauthenticated(self, uc):
        from tenancy.permissions import HasCapability
        perm = HasCapability()
        view = MagicMock()
        request = MagicMock()
        request.tenant = uc['tenant']
        request.user = MagicMock()
        request.user.is_authenticated = False
        assert perm.has_permission(request, view) is False

    @pytest.mark.django_db
    def test_no_capability(self, uc):
        from tenancy.permissions import HasCapability
        perm = HasCapability()
        view = MagicMock(spec=[])
        request = MagicMock()
        request.tenant = uc['tenant']
        request.user = uc['user']
        assert perm.has_permission(request, view) is True

    @pytest.mark.django_db
    def test_with_capability_has_membership(self, uc):
        from tenancy.permissions import HasCapability
        perm = HasCapability()
        view = MagicMock()
        view.required_capability = 'sales.sell'
        request = MagicMock()
        request.tenant = uc['tenant']
        request.user = uc['user']
        assert perm.has_permission(request, view) is True

    @pytest.mark.django_db
    def test_with_capability_no_membership(self, uc):
        from tenancy.permissions import HasCapability
        perm = HasCapability()
        view = MagicMock()
        view.required_capability = 'sales.sell'
        request = MagicMock()
        request.tenant = uc['tenant']
        user3 = User.objects.create_user(email='nocap@test.local', password='pass')
        request.user = user3
        assert perm.has_permission(request, view) is False

    @pytest.mark.django_db
    def test_capability_not_allowed(self, uc):
        from tenancy.permissions import HasCapability
        perm = HasCapability()
        view = MagicMock()
        view.required_capability = 'fiscal.manage'
        request = MagicMock()
        request.tenant = uc['tenant']
        request.user = uc['user']
        TenantMembership.objects.filter(user=uc['user'], tenant=uc['tenant']).update(role='operator')
        assert perm.has_permission(request, view) is False
