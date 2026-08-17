"""Final coverage push for stock, tenancy, platform admin, and session views."""

import hashlib
import uuid
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.utils import timezone

from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Branch, Company, Device, Tenant, TenantMembership

User = get_user_model()

pytestmark = pytest.mark.django_db


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


# ═══════════════════════════════════════════════════════════════════
# PART 1 — inventory/services/product_stock.py (unit-level tests)
# ═══════════════════════════════════════════════════════════════════


class TestComputeStockStatus:
    def test_negative(self):
        from inventory.services.product_stock import compute_stock_status

        assert (
            compute_stock_status(available=Decimal('-5'), reorder_point=Decimal('10')) == 'negative'
        )

    def test_zero(self):
        from inventory.services.product_stock import compute_stock_status

        assert compute_stock_status(available=Decimal('0'), reorder_point=Decimal('10')) == 'zero'

    def test_low(self):
        from inventory.services.product_stock import compute_stock_status

        assert compute_stock_status(available=Decimal('3'), reorder_point=Decimal('10')) == 'low'

    def test_low_equal_to_reorder(self):
        from inventory.services.product_stock import compute_stock_status

        assert compute_stock_status(available=Decimal('10'), reorder_point=Decimal('10')) == 'low'

    def test_normal(self):
        from inventory.services.product_stock import compute_stock_status

        assert (
            compute_stock_status(available=Decimal('50'), reorder_point=Decimal('10')) == 'normal'
        )


class TestFormatQuantity:
    def test_integer(self):
        from inventory.services.product_stock import _format_quantity

        assert _format_quantity(10) == '10'

    def test_decimal(self):
        from inventory.services.product_stock import _format_quantity

        assert _format_quantity(Decimal('1.50')) == '1.5'

    def test_zero(self):
        from inventory.services.product_stock import _format_quantity

        assert _format_quantity(0) == '0'

    def test_trailing_zeros(self):
        from inventory.services.product_stock import _format_quantity

        assert _format_quantity(Decimal('2.000')) == '2'


class TestGeneratePayloadHash:
    def test_deterministic(self):
        from inventory.services.product_stock import _generate_payload_hash

        p = {'a': 1, 'b': 'x'}
        assert _generate_payload_hash(p) == _generate_payload_hash(p)

    def test_different_payloads_different_hash(self):
        from inventory.services.product_stock import _generate_payload_hash

        assert _generate_payload_hash({'x': 1}) != _generate_payload_hash({'x': 2})


class TestBuildProductStockSummary:
    def test_with_balance(self):
        from catalog.models import Product, Unit
        from inventory.models import ProductStockPolicy, StockBalance, StockLocation
        from inventory.services.product_stock import build_product_stock_summary

        tenant = Tenant.objects.create(name='SumT', slug=f'sum-t-{uuid.uuid4().hex[:6]}')
        company = _run_in_tenant(
            tenant, lambda: Company.objects.create(tenant=tenant, name='SumCo')
        )
        branch = _run_in_tenant(
            tenant, lambda: Branch.objects.create(tenant=tenant, company=company, name='SumBr')
        )
        unit = _run_in_tenant(
            tenant,
            lambda: Unit.all_objects.create(
                tenant=tenant, symbol='UN', name='Unidade', precision=2
            ),
        )
        product = _run_in_tenant(
            tenant,
            lambda: Product.all_objects.create(
                tenant=tenant, sku='SUM-1', name='SumProd', base_unit=unit
            ),
        )
        location = _run_in_tenant(
            tenant,
            lambda: StockLocation.objects.create(
                tenant=tenant, branch=branch, code='S1', name='Dep S1'
            ),
        )
        policy = _run_in_tenant(
            tenant,
            lambda: ProductStockPolicy.objects.create(
                tenant=tenant,
                product=product,
                branch=branch,
                location=location,
                minimum_quantity=Decimal('5'),
                maximum_quantity=Decimal('50'),
                reorder_point=Decimal('10'),
                allow_negative=False,
            ),
        )
        balance = _run_in_tenant(
            tenant,
            lambda: StockBalance.objects.create(
                tenant=tenant,
                product=product,
                location=location,
                quantity=Decimal('20'),
                reserved=Decimal('3'),
            ),
        )
        result = build_product_stock_summary(product=product, policy=policy, balance=balance)
        assert result['status'] == 'normal'
        assert result['available'] == '17'
        assert result['reserved'] == '3'

    def test_without_balance(self):
        from catalog.models import Product, Unit
        from inventory.models import ProductStockPolicy, StockLocation
        from inventory.services.product_stock import build_product_stock_summary

        tenant = Tenant.objects.create(name='SumNo', slug=f'sumno-{uuid.uuid4().hex[:6]}')
        company = _run_in_tenant(
            tenant, lambda: Company.objects.create(tenant=tenant, name='SumNoCo')
        )
        branch = _run_in_tenant(
            tenant, lambda: Branch.objects.create(tenant=tenant, company=company, name='SumNoBr')
        )
        unit = _run_in_tenant(
            tenant, lambda: Unit.all_objects.create(tenant=tenant, symbol='UN', name='Unidade')
        )
        product = _run_in_tenant(
            tenant,
            lambda: Product.all_objects.create(
                tenant=tenant, sku='SUMNO-1', name='SumNoProd', base_unit=unit
            ),
        )
        location = _run_in_tenant(
            tenant,
            lambda: StockLocation.objects.create(
                tenant=tenant, branch=branch, code='SN1', name='Dep SN1'
            ),
        )
        policy = _run_in_tenant(
            tenant,
            lambda: ProductStockPolicy.objects.create(
                tenant=tenant,
                product=product,
                branch=branch,
                location=location,
                minimum_quantity=Decimal('0'),
                maximum_quantity=None,
                reorder_point=Decimal('5'),
                allow_negative=False,
            ),
        )
        result = build_product_stock_summary(product=product, policy=policy, balance=None)
        assert result['quantity'] == '0'
        assert result['maximum_quantity'] is None
        assert result['status'] == 'zero'


class TestProductStockControlError:
    def test_attributes(self):
        from inventory.services.product_stock import ProductStockControlError

        exc = ProductStockControlError('msg', code='CODE', status_code=409, errors={'k': 'v'})
        assert str(exc) == 'msg'
        assert exc.code == 'CODE'
        assert exc.status_code == 409
        assert exc.errors == {'k': 'v'}

    def test_default_errors(self):
        from inventory.services.product_stock import ProductStockControlError

        exc = ProductStockControlError('msg', code='C')
        assert exc.errors == {}


class TestDeactivateProductStockControl:
    def test_missing_command_id_raises(self):
        from inventory.services.product_stock import (
            ProductStockControlError,
            deactivate_product_stock_control,
        )

        tenant = Tenant.objects.create(name='DPC1', slug=f'dpc1-{uuid.uuid4().hex[:6]}')
        product = _run_in_tenant(tenant, lambda: type('P', (), {'id': uuid.uuid4()})())
        with pytest.raises(ProductStockControlError, match='command_id é obrigatório'):
            deactivate_product_stock_control(
                tenant=tenant, product=product, actor=None, command_id=''
            )

    def test_deactivate_with_zero_balances(self):
        from catalog.models import Product, Unit
        from inventory.models import ProductStockPolicy, StockBalance, StockLocation
        from inventory.services.product_stock import deactivate_product_stock_control

        tenant = Tenant.objects.create(name='DPC2', slug=f'dpc2-{uuid.uuid4().hex[:6]}')
        user = User.objects.create_user(
            email=f'dpc2-{uuid.uuid4().hex[:6]}@test.local', password='pass'
        )
        company = _run_in_tenant(
            tenant, lambda: Company.objects.create(tenant=tenant, name='DPC2Co')
        )
        branch = _run_in_tenant(
            tenant, lambda: Branch.objects.create(tenant=tenant, company=company, name='DPC2Br')
        )
        unit = _run_in_tenant(
            tenant, lambda: Unit.all_objects.create(tenant=tenant, symbol='UN', name='Unidade')
        )
        product = _run_in_tenant(
            tenant,
            lambda: Product.all_objects.create(
                tenant=tenant, sku='DPC2-1', name='DPC2P', base_unit=unit
            ),
        )
        location = _run_in_tenant(
            tenant,
            lambda: StockLocation.objects.create(
                tenant=tenant, branch=branch, code='D2', name='Dep D2'
            ),
        )
        _run_in_tenant(
            tenant,
            lambda: ProductStockPolicy.objects.create(
                tenant=tenant,
                product=product,
                branch=branch,
                location=location,
                minimum_quantity=Decimal('0'),
                maximum_quantity=None,
                reorder_point=Decimal('0'),
                allow_negative=False,
            ),
        )
        _run_in_tenant(
            tenant,
            lambda: StockBalance.objects.create(
                tenant=tenant,
                product=product,
                location=location,
                quantity=Decimal('0'),
                reserved=Decimal('0'),
            ),
        )
        result = _run_in_tenant(
            tenant,
            lambda: deactivate_product_stock_control(
                tenant=tenant,
                product=product,
                actor=user,
                command_id=str(uuid.uuid4()),
                correlation_id=str(uuid.uuid4()),
            ),
        )
        assert result.action == 'deactivate'
        assert result.policy_updated == 1

    def test_idempotent_retry_same_payload(self):
        from catalog.models import Product, Unit
        from inventory.models import ProductStockPolicy, StockLocation
        from inventory.services.product_stock import deactivate_product_stock_control

        tenant = Tenant.objects.create(name='DPC3', slug=f'dpc3-{uuid.uuid4().hex[:6]}')
        company = _run_in_tenant(
            tenant, lambda: Company.objects.create(tenant=tenant, name='DPC3Co')
        )
        branch = _run_in_tenant(
            tenant, lambda: Branch.objects.create(tenant=tenant, company=company, name='DPC3Br')
        )
        unit = _run_in_tenant(
            tenant, lambda: Unit.all_objects.create(tenant=tenant, symbol='UN', name='Unidade')
        )
        product = _run_in_tenant(
            tenant,
            lambda: Product.all_objects.create(
                tenant=tenant, sku='DPC3-1', name='DPC3P', base_unit=unit
            ),
        )
        location = _run_in_tenant(
            tenant,
            lambda: StockLocation.objects.create(
                tenant=tenant, branch=branch, code='D3', name='Dep D3'
            ),
        )
        _run_in_tenant(
            tenant,
            lambda: ProductStockPolicy.objects.create(
                tenant=tenant,
                product=product,
                branch=branch,
                location=location,
                minimum_quantity=Decimal('0'),
                maximum_quantity=None,
                reorder_point=Decimal('0'),
                allow_negative=False,
            ),
        )
        cmd_id = str(uuid.uuid4())
        corr = str(uuid.uuid4())
        r1 = _run_in_tenant(
            tenant,
            lambda: deactivate_product_stock_control(
                tenant=tenant,
                product=product,
                actor=None,
                command_id=cmd_id,
                correlation_id=corr,
            ),
        )
        r2 = _run_in_tenant(
            tenant,
            lambda: deactivate_product_stock_control(
                tenant=tenant,
                product=product,
                actor=None,
                command_id=cmd_id,
                correlation_id=corr,
            ),
        )
        assert r1.correlation_id == r2.correlation_id

    def test_conflict_on_different_payload(self):
        from catalog.models import Product, Unit
        from inventory.models import ProductStockPolicy, StockLocation
        from inventory.services.product_stock import (
            ProductStockControlError,
            deactivate_product_stock_control,
        )

        tenant = Tenant.objects.create(name='DPC4', slug=f'dpc4-{uuid.uuid4().hex[:6]}')
        company = _run_in_tenant(
            tenant, lambda: Company.objects.create(tenant=tenant, name='DPC4Co')
        )
        branch = _run_in_tenant(
            tenant, lambda: Branch.objects.create(tenant=tenant, company=company, name='DPC4Br')
        )
        unit = _run_in_tenant(
            tenant, lambda: Unit.all_objects.create(tenant=tenant, symbol='UN', name='Unidade')
        )
        product = _run_in_tenant(
            tenant,
            lambda: Product.all_objects.create(
                tenant=tenant, sku='DPC4-1', name='DPC4P', base_unit=unit
            ),
        )
        location = _run_in_tenant(
            tenant,
            lambda: StockLocation.objects.create(
                tenant=tenant, branch=branch, code='D4', name='Dep D4'
            ),
        )
        _run_in_tenant(
            tenant,
            lambda: ProductStockPolicy.objects.create(
                tenant=tenant,
                product=product,
                branch=branch,
                location=location,
                minimum_quantity=Decimal('0'),
                maximum_quantity=None,
                reorder_point=Decimal('0'),
                allow_negative=False,
            ),
        )
        cmd_id = str(uuid.uuid4())
        product2 = _run_in_tenant(
            tenant,
            lambda: Product.all_objects.create(
                tenant=tenant, sku='DPC4-2', name='DPC4P2', base_unit=unit
            ),
        )
        _run_in_tenant(
            tenant,
            lambda: deactivate_product_stock_control(
                tenant=tenant,
                product=product,
                actor=None,
                command_id=cmd_id,
                correlation_id=str(uuid.uuid4()),
            ),
        )
        with pytest.raises(ProductStockControlError, match='payload diferente'):
            _run_in_tenant(
                tenant,
                lambda: deactivate_product_stock_control(
                    tenant=tenant,
                    product=product2,
                    actor=None,
                    command_id=cmd_id,
                    correlation_id=str(uuid.uuid4()),
                ),
            )

    def test_no_correlation_generates_one(self):
        from catalog.models import Product, Unit
        from inventory.models import ProductStockPolicy, StockLocation
        from inventory.services.product_stock import deactivate_product_stock_control

        tenant = Tenant.objects.create(name='DPC5', slug=f'dpc5-{uuid.uuid4().hex[:6]}')
        company = _run_in_tenant(
            tenant, lambda: Company.objects.create(tenant=tenant, name='DPC5Co')
        )
        branch = _run_in_tenant(
            tenant, lambda: Branch.objects.create(tenant=tenant, company=company, name='DPC5Br')
        )
        unit = _run_in_tenant(
            tenant, lambda: Unit.all_objects.create(tenant=tenant, symbol='UN', name='Unidade')
        )
        product = _run_in_tenant(
            tenant,
            lambda: Product.all_objects.create(
                tenant=tenant, sku='DPC5-1', name='DPC5P', base_unit=unit
            ),
        )
        location = _run_in_tenant(
            tenant,
            lambda: StockLocation.objects.create(
                tenant=tenant, branch=branch, code='D5', name='Dep D5'
            ),
        )
        _run_in_tenant(
            tenant,
            lambda: ProductStockPolicy.objects.create(
                tenant=tenant,
                product=product,
                branch=branch,
                location=location,
                minimum_quantity=Decimal('0'),
                maximum_quantity=None,
                reorder_point=Decimal('0'),
                allow_negative=False,
            ),
        )
        result = _run_in_tenant(
            tenant,
            lambda: deactivate_product_stock_control(
                tenant=tenant,
                product=product,
                actor=None,
                command_id=str(uuid.uuid4()),
            ),
        )
        assert result.correlation_id is not None
        assert len(result.correlation_id) == 36


class TestReactivateProductStockControl:
    def test_missing_command_id_raises(self):
        from inventory.services.product_stock import (
            ProductStockControlError,
            reactivate_product_stock_control,
        )

        tenant = Tenant.objects.create(name='RPC1', slug=f'rpc1-{uuid.uuid4().hex[:6]}')
        product = _run_in_tenant(tenant, lambda: type('P', (), {'id': uuid.uuid4()})())
        with pytest.raises(ProductStockControlError, match='command_id é obrigatório'):
            reactivate_product_stock_control(
                tenant=tenant, product=product, actor=None, command_id=''
            )

    def test_no_policies_raises(self):
        from catalog.models import Product, Unit
        from inventory.services.product_stock import (
            ProductStockControlError,
            reactivate_product_stock_control,
        )

        tenant = Tenant.objects.create(name='RPC2', slug=f'rpc2-{uuid.uuid4().hex[:6]}')
        unit = _run_in_tenant(
            tenant, lambda: Unit.all_objects.create(tenant=tenant, symbol='UN', name='Unidade')
        )
        product = _run_in_tenant(
            tenant,
            lambda: Product.all_objects.create(
                tenant=tenant, sku='RPC2-1', name='RPC2P', base_unit=unit
            ),
        )
        with pytest.raises(ProductStockControlError, match='Nenhuma política'):
            _run_in_tenant(
                tenant,
                lambda: reactivate_product_stock_control(
                    tenant=tenant,
                    product=product,
                    actor=None,
                    command_id=str(uuid.uuid4()),
                    initial_stocks=[],
                ),
            )

    def test_reactivate_no_initial_stocks(self):
        from catalog.models import Product, Unit
        from inventory.models import ProductStockPolicy, StockLocation
        from inventory.services.product_stock import reactivate_product_stock_control

        tenant = Tenant.objects.create(name='RPC3', slug=f'rpc3-{uuid.uuid4().hex[:6]}')
        company = _run_in_tenant(
            tenant, lambda: Company.objects.create(tenant=tenant, name='RPC3Co')
        )
        branch = _run_in_tenant(
            tenant, lambda: Branch.objects.create(tenant=tenant, company=company, name='RPC3Br')
        )
        unit = _run_in_tenant(
            tenant, lambda: Unit.all_objects.create(tenant=tenant, symbol='UN', name='Unidade')
        )
        product = _run_in_tenant(
            tenant,
            lambda: Product.all_objects.create(
                tenant=tenant, sku='RPC3-1', name='RPC3P', base_unit=unit
            ),
        )
        location = _run_in_tenant(
            tenant,
            lambda: StockLocation.objects.create(
                tenant=tenant, branch=branch, code='R3', name='Dep R3'
            ),
        )
        _run_in_tenant(
            tenant,
            lambda: ProductStockPolicy.objects.create(
                tenant=tenant,
                product=product,
                branch=branch,
                location=location,
                minimum_quantity=Decimal('0'),
                maximum_quantity=None,
                reorder_point=Decimal('0'),
                allow_negative=False,
                is_active=False,
            ),
        )
        result = _run_in_tenant(
            tenant,
            lambda: reactivate_product_stock_control(
                tenant=tenant,
                product=product,
                actor=None,
                command_id=str(uuid.uuid4()),
                correlation_id=str(uuid.uuid4()),
            ),
        )
        assert result.action == 'reactivate'
        assert result.policy_updated == 1

    def test_idempotent_reactivate(self):
        from catalog.models import Product, Unit
        from inventory.models import ProductStockPolicy, StockLocation
        from inventory.services.product_stock import reactivate_product_stock_control

        tenant = Tenant.objects.create(name='RPC4', slug=f'rpc4-{uuid.uuid4().hex[:6]}')
        company = _run_in_tenant(
            tenant, lambda: Company.objects.create(tenant=tenant, name='RPC4Co')
        )
        branch = _run_in_tenant(
            tenant, lambda: Branch.objects.create(tenant=tenant, company=company, name='RPC4Br')
        )
        unit = _run_in_tenant(
            tenant, lambda: Unit.all_objects.create(tenant=tenant, symbol='UN', name='Unidade')
        )
        product = _run_in_tenant(
            tenant,
            lambda: Product.all_objects.create(
                tenant=tenant, sku='RPC4-1', name='RPC4P', base_unit=unit
            ),
        )
        location = _run_in_tenant(
            tenant,
            lambda: StockLocation.objects.create(
                tenant=tenant, branch=branch, code='R4', name='Dep R4'
            ),
        )
        _run_in_tenant(
            tenant,
            lambda: ProductStockPolicy.objects.create(
                tenant=tenant,
                product=product,
                branch=branch,
                location=location,
                minimum_quantity=Decimal('0'),
                maximum_quantity=None,
                reorder_point=Decimal('0'),
                allow_negative=False,
                is_active=False,
            ),
        )
        cmd_id = str(uuid.uuid4())
        r1 = _run_in_tenant(
            tenant,
            lambda: reactivate_product_stock_control(
                tenant=tenant,
                product=product,
                actor=None,
                command_id=cmd_id,
                correlation_id=str(uuid.uuid4()),
            ),
        )
        r2 = _run_in_tenant(
            tenant,
            lambda: reactivate_product_stock_control(
                tenant=tenant,
                product=product,
                actor=None,
                command_id=cmd_id,
                correlation_id=str(uuid.uuid4()),
            ),
        )
        assert r1.correlation_id == r2.correlation_id

    def test_reactivate_conflict_different_payload(self):
        from catalog.models import Product, Unit
        from inventory.models import ProductStockPolicy, StockLocation
        from inventory.services.product_stock import (
            ProductStockControlError,
            reactivate_product_stock_control,
        )

        tenant = Tenant.objects.create(name='RPC5', slug=f'rpc5-{uuid.uuid4().hex[:6]}')
        company = _run_in_tenant(
            tenant, lambda: Company.objects.create(tenant=tenant, name='RPC5Co')
        )
        branch = _run_in_tenant(
            tenant, lambda: Branch.objects.create(tenant=tenant, company=company, name='RPC5Br')
        )
        unit = _run_in_tenant(
            tenant, lambda: Unit.all_objects.create(tenant=tenant, symbol='UN', name='Unidade')
        )
        product = _run_in_tenant(
            tenant,
            lambda: Product.all_objects.create(
                tenant=tenant, sku='RPC5-1', name='RPC5P', base_unit=unit
            ),
        )
        location = _run_in_tenant(
            tenant,
            lambda: StockLocation.objects.create(
                tenant=tenant, branch=branch, code='R5', name='Dep R5'
            ),
        )
        _run_in_tenant(
            tenant,
            lambda: ProductStockPolicy.objects.create(
                tenant=tenant,
                product=product,
                branch=branch,
                location=location,
                minimum_quantity=Decimal('0'),
                maximum_quantity=None,
                reorder_point=Decimal('0'),
                allow_negative=False,
                is_active=False,
            ),
        )
        cmd_id = str(uuid.uuid4())
        _run_in_tenant(
            tenant,
            lambda: reactivate_product_stock_control(
                tenant=tenant,
                product=product,
                actor=None,
                command_id=cmd_id,
                correlation_id=str(uuid.uuid4()),
            ),
        )
        loc2 = _run_in_tenant(
            tenant,
            lambda: StockLocation.objects.create(
                tenant=tenant,
                branch=branch,
                code='R5b',
                name='Dep R5b',
            ),
        )
        with pytest.raises(ProductStockControlError, match='payload diferente'):
            _run_in_tenant(
                tenant,
                lambda: reactivate_product_stock_control(
                    tenant=tenant,
                    product=product,
                    actor=None,
                    command_id=cmd_id,
                    correlation_id=str(uuid.uuid4()),
                    initial_stocks=[{'location_id': str(loc2.id), 'quantity': '5'}],
                ),
            )

    def test_invalid_initial_stock_not_dict(self):
        from catalog.models import Product, Unit
        from inventory.models import ProductStockPolicy, StockLocation
        from inventory.services.product_stock import (
            ProductStockControlError,
            reactivate_product_stock_control,
        )

        tenant = Tenant.objects.create(name='RPC6', slug=f'rpc6-{uuid.uuid4().hex[:6]}')
        company = _run_in_tenant(
            tenant, lambda: Company.objects.create(tenant=tenant, name='RPC6Co')
        )
        branch = _run_in_tenant(
            tenant, lambda: Branch.objects.create(tenant=tenant, company=company, name='RPC6Br')
        )
        unit = _run_in_tenant(
            tenant, lambda: Unit.all_objects.create(tenant=tenant, symbol='UN', name='Unidade')
        )
        product = _run_in_tenant(
            tenant,
            lambda: Product.all_objects.create(
                tenant=tenant, sku='RPC6-1', name='RPC6P', base_unit=unit
            ),
        )
        location = _run_in_tenant(
            tenant,
            lambda: StockLocation.objects.create(
                tenant=tenant, branch=branch, code='R6', name='Dep R6'
            ),
        )
        _run_in_tenant(
            tenant,
            lambda: ProductStockPolicy.objects.create(
                tenant=tenant,
                product=product,
                branch=branch,
                location=location,
                minimum_quantity=Decimal('0'),
                maximum_quantity=None,
                reorder_point=Decimal('0'),
                allow_negative=False,
                is_active=False,
            ),
        )
        with pytest.raises(ProductStockControlError, match='Estoque inicial inválido'):
            _run_in_tenant(
                tenant,
                lambda: reactivate_product_stock_control(
                    tenant=tenant,
                    product=product,
                    actor=None,
                    command_id=str(uuid.uuid4()),
                    initial_stocks=['not-a-dict'],
                ),
            )

    def test_invalid_location_id(self):
        from catalog.models import Product, Unit
        from inventory.models import ProductStockPolicy, StockLocation
        from inventory.services.product_stock import (
            ProductStockControlError,
            reactivate_product_stock_control,
        )

        tenant = Tenant.objects.create(name='RPC7', slug=f'rpc7-{uuid.uuid4().hex[:6]}')
        company = _run_in_tenant(
            tenant, lambda: Company.objects.create(tenant=tenant, name='RPC7Co')
        )
        branch = _run_in_tenant(
            tenant, lambda: Branch.objects.create(tenant=tenant, company=company, name='RPC7Br')
        )
        unit = _run_in_tenant(
            tenant, lambda: Unit.all_objects.create(tenant=tenant, symbol='UN', name='Unidade')
        )
        product = _run_in_tenant(
            tenant,
            lambda: Product.all_objects.create(
                tenant=tenant, sku='RPC7-1', name='RPC7P', base_unit=unit
            ),
        )
        location = _run_in_tenant(
            tenant,
            lambda: StockLocation.objects.create(
                tenant=tenant, branch=branch, code='R7', name='Dep R7'
            ),
        )
        _run_in_tenant(
            tenant,
            lambda: ProductStockPolicy.objects.create(
                tenant=tenant,
                product=product,
                branch=branch,
                location=location,
                minimum_quantity=Decimal('0'),
                maximum_quantity=None,
                reorder_point=Decimal('0'),
                allow_negative=False,
                is_active=False,
            ),
        )
        with pytest.raises(ProductStockControlError, match='Localização inválida'):
            _run_in_tenant(
                tenant,
                lambda: reactivate_product_stock_control(
                    tenant=tenant,
                    product=product,
                    actor=None,
                    command_id=str(uuid.uuid4()),
                    initial_stocks=[{'location_id': 'not-a-uuid', 'quantity': '5'}],
                ),
            )

    def test_invalid_quantity(self):
        from catalog.models import Product, Unit
        from inventory.models import ProductStockPolicy, StockLocation
        from inventory.services.product_stock import (
            ProductStockControlError,
            reactivate_product_stock_control,
        )

        tenant = Tenant.objects.create(name='RPC8', slug=f'rpc8-{uuid.uuid4().hex[:6]}')
        company = _run_in_tenant(
            tenant, lambda: Company.objects.create(tenant=tenant, name='RPC8Co')
        )
        branch = _run_in_tenant(
            tenant, lambda: Branch.objects.create(tenant=tenant, company=company, name='RPC8Br')
        )
        unit = _run_in_tenant(
            tenant, lambda: Unit.all_objects.create(tenant=tenant, symbol='UN', name='Unidade')
        )
        product = _run_in_tenant(
            tenant,
            lambda: Product.all_objects.create(
                tenant=tenant, sku='RPC8-1', name='RPC8P', base_unit=unit
            ),
        )
        location = _run_in_tenant(
            tenant,
            lambda: StockLocation.objects.create(
                tenant=tenant, branch=branch, code='R8', name='Dep R8'
            ),
        )
        _run_in_tenant(
            tenant,
            lambda: ProductStockPolicy.objects.create(
                tenant=tenant,
                product=product,
                branch=branch,
                location=location,
                minimum_quantity=Decimal('0'),
                maximum_quantity=None,
                reorder_point=Decimal('0'),
                allow_negative=False,
                is_active=False,
            ),
        )
        with pytest.raises(ProductStockControlError, match='Quantidade inválida'):
            _run_in_tenant(
                tenant,
                lambda: reactivate_product_stock_control(
                    tenant=tenant,
                    product=product,
                    actor=None,
                    command_id=str(uuid.uuid4()),
                    initial_stocks=[{'location_id': str(uuid.uuid4()), 'quantity': 'not-a-number'}],
                ),
            )

    def test_negative_quantity(self):
        from catalog.models import Product, Unit
        from inventory.models import ProductStockPolicy, StockLocation
        from inventory.services.product_stock import (
            ProductStockControlError,
            reactivate_product_stock_control,
        )

        tenant = Tenant.objects.create(name='RPC9', slug=f'rpc9-{uuid.uuid4().hex[:6]}')
        company = _run_in_tenant(
            tenant, lambda: Company.objects.create(tenant=tenant, name='RPC9Co')
        )
        branch = _run_in_tenant(
            tenant, lambda: Branch.objects.create(tenant=tenant, company=company, name='RPC9Br')
        )
        unit = _run_in_tenant(
            tenant, lambda: Unit.all_objects.create(tenant=tenant, symbol='UN', name='Unidade')
        )
        product = _run_in_tenant(
            tenant,
            lambda: Product.all_objects.create(
                tenant=tenant, sku='RPC9-1', name='RPC9P', base_unit=unit
            ),
        )
        location = _run_in_tenant(
            tenant,
            lambda: StockLocation.objects.create(
                tenant=tenant, branch=branch, code='R9', name='Dep R9'
            ),
        )
        _run_in_tenant(
            tenant,
            lambda: ProductStockPolicy.objects.create(
                tenant=tenant,
                product=product,
                branch=branch,
                location=location,
                minimum_quantity=Decimal('0'),
                maximum_quantity=None,
                reorder_point=Decimal('0'),
                allow_negative=False,
                is_active=False,
            ),
        )
        with pytest.raises(ProductStockControlError, match='Quantidade deve ser positiva'):
            _run_in_tenant(
                tenant,
                lambda: reactivate_product_stock_control(
                    tenant=tenant,
                    product=product,
                    actor=None,
                    command_id=str(uuid.uuid4()),
                    initial_stocks=[{'location_id': str(uuid.uuid4()), 'quantity': '-5'}],
                ),
            )

    def test_location_not_in_policies(self):
        from catalog.models import Product, Unit
        from inventory.models import ProductStockPolicy, StockLocation
        from inventory.services.product_stock import (
            ProductStockControlError,
            reactivate_product_stock_control,
        )

        tenant = Tenant.objects.create(name='RPC10', slug=f'rpc10-{uuid.uuid4().hex[:6]}')
        company = _run_in_tenant(
            tenant, lambda: Company.objects.create(tenant=tenant, name='RPC10Co')
        )
        branch = _run_in_tenant(
            tenant, lambda: Branch.objects.create(tenant=tenant, company=company, name='RPC10Br')
        )
        unit = _run_in_tenant(
            tenant, lambda: Unit.all_objects.create(tenant=tenant, symbol='UN', name='Unidade')
        )
        product = _run_in_tenant(
            tenant,
            lambda: Product.all_objects.create(
                tenant=tenant, sku='RPC10-1', name='RPC10P', base_unit=unit
            ),
        )
        location = _run_in_tenant(
            tenant,
            lambda: StockLocation.objects.create(
                tenant=tenant, branch=branch, code='R10', name='Dep R10'
            ),
        )
        _run_in_tenant(
            tenant,
            lambda: ProductStockPolicy.objects.create(
                tenant=tenant,
                product=product,
                branch=branch,
                location=location,
                minimum_quantity=Decimal('0'),
                maximum_quantity=None,
                reorder_point=Decimal('0'),
                allow_negative=False,
                is_active=False,
            ),
        )
        other_loc = _run_in_tenant(
            tenant,
            lambda: StockLocation.objects.create(
                tenant=tenant,
                branch=branch,
                code='R10b',
                name='Dep R10b',
            ),
        )
        with pytest.raises(ProductStockControlError, match='Localização não pertence'):
            _run_in_tenant(
                tenant,
                lambda: reactivate_product_stock_control(
                    tenant=tenant,
                    product=product,
                    actor=None,
                    command_id=str(uuid.uuid4()),
                    initial_stocks=[{'location_id': str(other_loc.id), 'quantity': '5'}],
                ),
            )

    def test_no_correlation_generates_one(self):
        from catalog.models import Product, Unit
        from inventory.models import ProductStockPolicy, StockLocation
        from inventory.services.product_stock import reactivate_product_stock_control

        tenant = Tenant.objects.create(name='RPC11', slug=f'rpc11-{uuid.uuid4().hex[:6]}')
        company = _run_in_tenant(
            tenant, lambda: Company.objects.create(tenant=tenant, name='RPC11Co')
        )
        branch = _run_in_tenant(
            tenant, lambda: Branch.objects.create(tenant=tenant, company=company, name='RPC11Br')
        )
        unit = _run_in_tenant(
            tenant, lambda: Unit.all_objects.create(tenant=tenant, symbol='UN', name='Unidade')
        )
        product = _run_in_tenant(
            tenant,
            lambda: Product.all_objects.create(
                tenant=tenant, sku='RPC11-1', name='RPC11P', base_unit=unit
            ),
        )
        location = _run_in_tenant(
            tenant,
            lambda: StockLocation.objects.create(
                tenant=tenant, branch=branch, code='R11', name='Dep R11'
            ),
        )
        _run_in_tenant(
            tenant,
            lambda: ProductStockPolicy.objects.create(
                tenant=tenant,
                product=product,
                branch=branch,
                location=location,
                minimum_quantity=Decimal('0'),
                maximum_quantity=None,
                reorder_point=Decimal('0'),
                allow_negative=False,
                is_active=False,
            ),
        )
        result = _run_in_tenant(
            tenant,
            lambda: reactivate_product_stock_control(
                tenant=tenant,
                product=product,
                actor=None,
                command_id=str(uuid.uuid4()),
            ),
        )
        assert result.correlation_id is not None


# ═══════════════════════════════════════════════════════════════════
# PART 2 — tenancy/views.py
# URLs: companies/, companies/<uuid:pk>/, branches/, branches/<uuid:pk>/,
#   devices/ (register), devices/list/, devices/validate/, devices/refresh/,
#   devices/<uuid:pk>/revoke/
# ═══════════════════════════════════════════════════════════════════


class TestCompanyListCreateView:
    def test_list_companies(self, client):
        tenant = Tenant.objects.create(name='CoL', slug=f'co-l-{uuid.uuid4().hex[:6]}')
        admin = User.objects.create_user(
            email=f'co-l-{uuid.uuid4().hex[:6]}@test.local', password='pass'
        )
        _auth_client(client, admin, tenant)
        _run_in_tenant(tenant, lambda: Company.objects.create(tenant=tenant, name='Co1'))
        resp = client.get('/api/v1/companies/', HTTP_X_TENANT_ID=str(tenant.id))
        assert resp.status_code == 200
        assert any(c['name'] == 'Co1' for c in resp.json()['results'])

    def test_create_company(self, client):
        tenant = Tenant.objects.create(name='CoC', slug=f'co-c-{uuid.uuid4().hex[:6]}')
        admin = User.objects.create_user(
            email=f'co-c-{uuid.uuid4().hex[:6]}@test.local', password='pass'
        )
        _auth_client(client, admin, tenant)
        resp = client.post(
            '/api/v1/companies/',
            {'name': 'NewCo'},
            content_type='application/json',
            HTTP_X_TENANT_ID=str(tenant.id),
        )
        assert resp.status_code == 201


class TestCompanyDetailView:
    def test_retrieve_company(self, client):
        tenant = Tenant.objects.create(name='CoD', slug=f'co-d-{uuid.uuid4().hex[:6]}')
        admin = User.objects.create_user(
            email=f'co-d-{uuid.uuid4().hex[:6]}@test.local', password='pass'
        )
        _auth_client(client, admin, tenant)
        co = _run_in_tenant(tenant, lambda: Company.objects.create(tenant=tenant, name='DetailCo'))
        resp = client.get(f'/api/v1/companies/{co.id}/', HTTP_X_TENANT_ID=str(tenant.id))
        assert resp.status_code == 200
        assert resp.json()['name'] == 'DetailCo'


class TestDeviceRegisterView:
    def test_register_device(self, client):
        tenant = Tenant.objects.create(name='DVR', slug=f'dvr-{uuid.uuid4().hex[:6]}')
        admin = User.objects.create_user(
            email=f'dvr-{uuid.uuid4().hex[:6]}@test.local', password='pass'
        )
        _auth_client(client, admin, tenant)
        company = _run_in_tenant(
            tenant, lambda: Company.objects.create(tenant=tenant, name='DVRCo')
        )
        branch = _run_in_tenant(
            tenant, lambda: Branch.objects.create(tenant=tenant, company=company, name='DVRBr')
        )
        resp = client.post(
            '/api/v1/devices/',
            {'name': 'PDV1', 'device_id': 'pdv-001', 'branch': str(branch.id)},
            content_type='application/json',
            HTTP_X_TENANT_ID=str(tenant.id),
        )
        assert resp.status_code == 201
        assert resp.json()['name'] == 'PDV1'


class TestDeviceValidateView:
    def test_validate_valid_key(self, client):
        tenant = Tenant.objects.create(name='DVV', slug=f'dvv-{uuid.uuid4().hex[:6]}')
        admin = User.objects.create_user(
            email=f'dvv-{uuid.uuid4().hex[:6]}@test.local', password='pass'
        )
        _auth_client(client, admin, tenant)
        company = _run_in_tenant(
            tenant, lambda: Company.objects.create(tenant=tenant, name='DVVCo')
        )
        branch = _run_in_tenant(
            tenant, lambda: Branch.objects.create(tenant=tenant, company=company, name='DVVBr')
        )
        api_key = 'device-api-key-123'
        _run_in_tenant(
            tenant,
            lambda: Device.all_objects.create(
                tenant=tenant,
                branch=branch,
                name='DV',
                device_id='dv-1',
                key_hash=hashlib.sha256(api_key.encode()).hexdigest(),
                status='active',
                registered_by=admin,
            ),
        )
        resp = client.post(
            '/api/v1/devices/validate/',
            {'api_key': api_key},
            content_type='application/json',
        )
        assert resp.status_code == 200
        assert 'token' in resp.json()

    def test_validate_invalid_key(self, client):
        resp = client.post(
            '/api/v1/devices/validate/',
            {'api_key': 'nonexistent'},
            content_type='application/json',
        )
        assert resp.status_code == 401

    def test_validate_inactive_device(self, client):
        tenant = Tenant.objects.create(name='DVI', slug=f'dvi-{uuid.uuid4().hex[:6]}')
        admin = User.objects.create_user(
            email=f'dvi-{uuid.uuid4().hex[:6]}@test.local', password='pass'
        )
        _auth_client(client, admin, tenant)
        company = _run_in_tenant(
            tenant, lambda: Company.objects.create(tenant=tenant, name='DVICo')
        )
        branch = _run_in_tenant(
            tenant, lambda: Branch.objects.create(tenant=tenant, company=company, name='DVIBr')
        )
        api_key = 'inactive-key'
        _run_in_tenant(
            tenant,
            lambda: Device.all_objects.create(
                tenant=tenant,
                branch=branch,
                name='DVI',
                device_id='dvi-1',
                key_hash=hashlib.sha256(api_key.encode()).hexdigest(),
                status='inactive',
                registered_by=admin,
            ),
        )
        resp = client.post(
            '/api/v1/devices/validate/',
            {'api_key': api_key},
            content_type='application/json',
        )
        assert resp.status_code == 403


class TestDeviceRefreshView:
    def test_refresh_missing_token(self, client):
        tenant = Tenant.objects.create(name='DVRf', slug=f'dvrf-{uuid.uuid4().hex[:6]}')
        admin = User.objects.create_user(
            email=f'dvrf-{uuid.uuid4().hex[:6]}@test.local', password='pass'
        )
        _auth_client(client, admin, tenant)
        resp = client.post(
            '/api/v1/devices/refresh/',
            {},
            content_type='application/json',
            HTTP_X_TENANT_ID=str(tenant.id),
        )
        assert resp.status_code == 400

    def test_refresh_valid_token(self, client):
        tenant = Tenant.objects.create(name='DVRv', slug=f'dvrv-{uuid.uuid4().hex[:6]}')
        admin = User.objects.create_user(
            email=f'dvrv-{uuid.uuid4().hex[:6]}@test.local', password='pass'
        )
        _auth_client(client, admin, tenant)
        company = _run_in_tenant(
            tenant, lambda: Company.objects.create(tenant=tenant, name='DVRvCo')
        )
        branch = _run_in_tenant(
            tenant, lambda: Branch.objects.create(tenant=tenant, company=company, name='DVRvBr')
        )
        device = _run_in_tenant(
            tenant,
            lambda: Device.all_objects.create(
                tenant=tenant,
                branch=branch,
                name='DVRv',
                device_id='dvrv-1',
                key_hash='x',
                status='active',
                registered_by=admin,
            ),
        )
        from rest_framework_simplejwt.tokens import RefreshToken

        refresh = RefreshToken()
        refresh['device_id'] = str(device.id)
        refresh['branch_id'] = str(branch.id)
        refresh['tenant_id'] = str(tenant.id)
        resp = client.post(
            '/api/v1/devices/refresh/',
            {'refresh_token': str(refresh)},
            content_type='application/json',
            HTTP_X_TENANT_ID=str(tenant.id),
        )
        assert resp.status_code == 200
        assert 'token' in resp.json()


class TestBranchListCreateView:
    def test_list_branches(self, client):
        tenant = Tenant.objects.create(name='BrL', slug=f'br-l-{uuid.uuid4().hex[:6]}')
        admin = User.objects.create_user(
            email=f'br-l-{uuid.uuid4().hex[:6]}@test.local', password='pass'
        )
        _auth_client(client, admin, tenant)
        co = _run_in_tenant(tenant, lambda: Company.objects.create(tenant=tenant, name='BrLCo'))
        _run_in_tenant(tenant, lambda: Branch.objects.create(tenant=tenant, company=co, name='Br1'))
        resp = client.get('/api/v1/branches/', HTTP_X_TENANT_ID=str(tenant.id))
        assert resp.status_code == 200

    def test_create_branch(self, client):
        tenant = Tenant.objects.create(name='BrC', slug=f'br-c-{uuid.uuid4().hex[:6]}')
        admin = User.objects.create_user(
            email=f'br-c-{uuid.uuid4().hex[:6]}@test.local', password='pass'
        )
        _auth_client(client, admin, tenant)
        co = _run_in_tenant(tenant, lambda: Company.objects.create(tenant=tenant, name='BrCCo'))
        resp = client.post(
            '/api/v1/branches/',
            {'name': 'NewBr', 'company': str(co.id)},
            content_type='application/json',
            HTTP_X_TENANT_ID=str(tenant.id),
        )
        assert resp.status_code == 201


class TestBranchDetailView:
    def test_retrieve_branch(self, client):
        tenant = Tenant.objects.create(name='BrD', slug=f'br-d-{uuid.uuid4().hex[:6]}')
        admin = User.objects.create_user(
            email=f'br-d-{uuid.uuid4().hex[:6]}@test.local', password='pass'
        )
        _auth_client(client, admin, tenant)
        co = _run_in_tenant(tenant, lambda: Company.objects.create(tenant=tenant, name='BrDCo'))
        br = _run_in_tenant(
            tenant, lambda: Branch.objects.create(tenant=tenant, company=co, name='BrD')
        )
        resp = client.get(f'/api/v1/branches/{br.id}/', HTTP_X_TENANT_ID=str(tenant.id))
        assert resp.status_code == 200

    def test_patch_branch(self, client):
        tenant = Tenant.objects.create(name='BrP', slug=f'br-p-{uuid.uuid4().hex[:6]}')
        admin = User.objects.create_user(
            email=f'br-p-{uuid.uuid4().hex[:6]}@test.local', password='pass'
        )
        _auth_client(client, admin, tenant)
        co = _run_in_tenant(tenant, lambda: Company.objects.create(tenant=tenant, name='BrPCo'))
        br = _run_in_tenant(
            tenant, lambda: Branch.objects.create(tenant=tenant, company=co, name='BrP')
        )
        resp = client.patch(
            f'/api/v1/branches/{br.id}/',
            {'name': 'BrP-Upd'},
            content_type='application/json',
            HTTP_X_TENANT_ID=str(tenant.id),
        )
        assert resp.status_code == 200


class TestDeviceListView:
    def test_list_devices(self, client):
        tenant = Tenant.objects.create(name='DVL', slug=f'dvl-{uuid.uuid4().hex[:6]}')
        admin = User.objects.create_user(
            email=f'dvl-{uuid.uuid4().hex[:6]}@test.local', password='pass'
        )
        _auth_client(client, admin, tenant)
        co = _run_in_tenant(tenant, lambda: Company.objects.create(tenant=tenant, name='DVLCo'))
        br = _run_in_tenant(
            tenant, lambda: Branch.objects.create(tenant=tenant, company=co, name='DVLBr')
        )
        _run_in_tenant(
            tenant,
            lambda: Device.all_objects.create(
                tenant=tenant,
                branch=br,
                name='DVL',
                device_id='dvl-1',
                key_hash='x',
                status='active',
                registered_by=admin,
            ),
        )
        resp = client.get('/api/v1/devices/list/', HTTP_X_TENANT_ID=str(tenant.id))
        assert resp.status_code == 200
        assert len(resp.json()['results']) == 1


class TestDeviceRevokeView:
    def test_revoke_device(self, client):
        tenant = Tenant.objects.create(name='DVRk', slug=f'dvrk-{uuid.uuid4().hex[:6]}')
        admin = User.objects.create_user(
            email=f'dvrk-{uuid.uuid4().hex[:6]}@test.local', password='pass'
        )
        _auth_client(client, admin, tenant)
        co = _run_in_tenant(tenant, lambda: Company.objects.create(tenant=tenant, name='DVRkCo'))
        br = _run_in_tenant(
            tenant, lambda: Branch.objects.create(tenant=tenant, company=co, name='DVRkBr')
        )
        device = _run_in_tenant(
            tenant,
            lambda: Device.all_objects.create(
                tenant=tenant,
                branch=br,
                name='DVRk',
                device_id='dvrk-1',
                key_hash='x',
                status='active',
                registered_by=admin,
            ),
        )
        resp = client.post(f'/api/v1/devices/{device.id}/revoke/', HTTP_X_TENANT_ID=str(tenant.id))
        assert resp.status_code == 200
        device.refresh_from_db()
        assert device.status == 'inactive'

    def test_revoke_not_found(self, client):
        tenant = Tenant.objects.create(name='DVRk404', slug=f'dvrk404-{uuid.uuid4().hex[:6]}')
        admin = User.objects.create_user(
            email=f'dvrk404-{uuid.uuid4().hex[:6]}@test.local', password='pass'
        )
        _auth_client(client, admin, tenant)
        resp = client.post(
            f'/api/v1/devices/{uuid.uuid4()}/revoke/',
            HTTP_X_TENANT_ID=str(tenant.id),
        )
        assert resp.status_code == 404

    def test_revoke_insufficient_role(self, client):
        tenant = Tenant.objects.create(name='DVRkDeny', slug=f'dvrkdeny-{uuid.uuid4().hex[:6]}')
        operator = User.objects.create_user(
            email=f'dvrkdeny-{uuid.uuid4().hex[:6]}@test.local', password='pass'
        )
        _auth_client(client, operator, tenant, role='operator')
        co = _run_in_tenant(tenant, lambda: Company.objects.create(tenant=tenant, name='DVRkDCo'))
        br = _run_in_tenant(
            tenant, lambda: Branch.objects.create(tenant=tenant, company=co, name='DVRkDBr')
        )
        device = _run_in_tenant(
            tenant,
            lambda: Device.all_objects.create(
                tenant=tenant,
                branch=br,
                name='DVRkD',
                device_id='dvrkd-1',
                key_hash='x',
                status='active',
                registered_by=operator,
            ),
        )
        resp = client.post(
            f'/api/v1/devices/{device.id}/revoke/',
            HTTP_X_TENANT_ID=str(tenant.id),
        )
        assert resp.status_code == 403


# ═══════════════════════════════════════════════════════════════════
# PART 3 — platform_admin/views.py
# URLs: api/v1/platform/plans/, platform/subscriptions/,
#   platform/entitlements/, platform/feature-flags/,
#   platform/support-access/, platform/audit/,
#   platform/tenant-capabilities/
# ═══════════════════════════════════════════════════════════════════


class TestPlanViewSet:
    def test_list_plans(self, client):
        user = User.objects.create_user(
            email=f'pa-pl-{uuid.uuid4().hex[:6]}@test.local', password='pass', is_staff=True
        )
        client.force_login(user)
        from platform_admin.models import Plan

        Plan.objects.create(code='basic', name='Basic')
        resp = client.get('/api/v1/platform/plans/')
        assert resp.status_code == 200

    def test_create_plan(self, client):
        user = User.objects.create_user(
            email=f'pa-pc-{uuid.uuid4().hex[:6]}@test.local', password='pass', is_staff=True
        )
        client.force_login(user)
        resp = client.post(
            '/api/v1/platform/plans/',
            {'code': 'new-plan', 'name': 'New Plan'},
            content_type='application/json',
        )
        assert resp.status_code == 201

    def test_update_plan(self, client):
        user = User.objects.create_user(
            email=f'pa-pu-{uuid.uuid4().hex[:6]}@test.local', password='pass', is_staff=True
        )
        client.force_login(user)
        from platform_admin.models import Plan

        plan = Plan.objects.create(code='upd', name='Upd')
        resp = client.patch(
            f'/api/v1/platform/plans/{plan.id}/',
            {'name': 'Updated'},
            content_type='application/json',
        )
        assert resp.status_code == 200

    def test_delete_plan(self, client):
        user = User.objects.create_user(
            email=f'pa-pd-{uuid.uuid4().hex[:6]}@test.local', password='pass', is_staff=True
        )
        client.force_login(user)
        from platform_admin.models import Plan

        plan = Plan.objects.create(code='del', name='Del')
        resp = client.delete(f'/api/v1/platform/plans/{plan.id}/')
        assert resp.status_code == 204

    def test_non_staff_denied(self, client):
        user = User.objects.create_user(
            email=f'pa-pns-{uuid.uuid4().hex[:6]}@test.local', password='pass'
        )
        client.force_login(user)
        resp = client.get('/api/v1/platform/plans/')
        assert resp.status_code == 403


class TestSubscriptionViewSet:
    def test_list_subscriptions(self, client):
        user = User.objects.create_user(
            email=f'pa-sl-{uuid.uuid4().hex[:6]}@test.local', password='pass', is_staff=True
        )
        client.force_login(user)
        resp = client.get('/api/v1/platform/subscriptions/')
        assert resp.status_code == 200

    def test_suspend_action(self, client):
        from platform_admin.models import Plan, Subscription

        user = User.objects.create_user(
            email=f'pa-sus-{uuid.uuid4().hex[:6]}@test.local', password='pass', is_staff=True
        )
        client.force_login(user)
        tenant = Tenant.objects.create(name='SusT', slug=f'sus-t-{uuid.uuid4().hex[:6]}')
        plan = Plan.objects.create(code='sus-plan', name='Sus Plan')
        sub = Subscription.objects.create(tenant=tenant, plan=plan, start_date='2026-01-01')
        resp = client.post(
            f'/api/v1/platform/subscriptions/{sub.id}/suspend/',
            {'reason': 'Test'},
            content_type='application/json',
        )
        assert resp.status_code == 200
        sub.refresh_from_db()
        assert sub.status == 'suspended'

    def test_reactivate_action(self, client):
        from platform_admin.models import Plan, Subscription
        from platform_admin.services import suspend_tenant

        user = User.objects.create_user(
            email=f'pa-react-{uuid.uuid4().hex[:6]}@test.local', password='pass', is_staff=True
        )
        client.force_login(user)
        tenant = Tenant.objects.create(name='ReactT', slug=f'react-t-{uuid.uuid4().hex[:6]}')
        plan = Plan.objects.create(code='react-plan', name='React Plan')
        sub = Subscription.objects.create(tenant=tenant, plan=plan, start_date='2026-01-01')
        suspend_tenant(tenant)
        resp = client.post(f'/api/v1/platform/subscriptions/{sub.id}/reactivate/')
        assert resp.status_code == 200


class TestTenantEntitlementViewSet:
    def test_list_entitlements(self, client):
        user = User.objects.create_user(
            email=f'pa-te-{uuid.uuid4().hex[:6]}@test.local', password='pass', is_staff=True
        )
        client.force_login(user)
        resp = client.get('/api/v1/platform/entitlements/')
        assert resp.status_code == 200

    def test_create_entitlement(self, client):
        user = User.objects.create_user(
            email=f'pa-tec-{uuid.uuid4().hex[:6]}@test.local', password='pass', is_staff=True
        )
        client.force_login(user)
        tenant = Tenant.objects.create(name='EntT', slug=f'ent-t-{uuid.uuid4().hex[:6]}')
        resp = client.post(
            '/api/v1/platform/entitlements/',
            {'tenant': str(tenant.id), 'capability': 'reports', 'is_enabled': True},
            content_type='application/json',
        )
        assert resp.status_code == 201

    def test_filter_by_tenant(self, client):
        from platform_admin.models import TenantEntitlement

        user = User.objects.create_user(
            email=f'pa-tef-{uuid.uuid4().hex[:6]}@test.local', password='pass', is_staff=True
        )
        client.force_login(user)
        tenant = Tenant.objects.create(name='EntTF', slug=f'ent-tf-{uuid.uuid4().hex[:6]}')
        TenantEntitlement.objects.create(tenant=tenant, capability='sales', is_enabled=True)
        resp = client.get(f'/api/v1/platform/entitlements/?tenant={tenant.id}')
        assert resp.status_code == 200
        assert len(resp.json()['results']) == 1


class TestFeatureFlagViewSet:
    def test_list_flags(self, client):
        user = User.objects.create_user(
            email=f'pa-ff-{uuid.uuid4().hex[:6]}@test.local', password='pass', is_staff=True
        )
        client.force_login(user)
        resp = client.get('/api/v1/platform/feature-flags/')
        assert resp.status_code == 200

    def test_create_flag(self, client):
        user = User.objects.create_user(
            email=f'pa-ffc-{uuid.uuid4().hex[:6]}@test.local', password='pass', is_staff=True
        )
        client.force_login(user)
        resp = client.post(
            '/api/v1/platform/feature-flags/',
            {'code': 'new-flag', 'description': 'New Flag', 'is_globally_enabled': True},
            content_type='application/json',
        )
        assert resp.status_code == 201

    def test_delete_flag(self, client):
        from platform_admin.models import FeatureFlag

        user = User.objects.create_user(
            email=f'pa-ffd-{uuid.uuid4().hex[:6]}@test.local', password='pass', is_staff=True
        )
        client.force_login(user)
        flag = FeatureFlag.objects.create(code='del-flag', description='Del Flag')
        resp = client.delete(f'/api/v1/platform/feature-flags/{flag.id}/')
        assert resp.status_code == 204


class TestSupportAccessViewSet:
    def _staff_client(self, client):
        user = User.objects.create_user(
            email=f'pa-sa-{uuid.uuid4().hex[:6]}@test.local', password='pass', is_staff=True
        )
        tenant = Tenant.objects.create(name='SACli', slug=f'sac-{uuid.uuid4().hex[:6]}')
        TenantMembership.objects.create(user=user, tenant=tenant, role='admin', is_active=True)
        client.force_login(user)
        session = client.session
        session['mfa_tenant_id'] = str(tenant.id)
        session['mfa_method'] = 'totp'
        session.save()
        return user, tenant

    def test_list_support_requests(self, client):
        user, tenant = self._staff_client(client)
        resp = client.get('/api/v1/platform/support-access/', HTTP_X_TENANT_ID=str(tenant.id))
        assert resp.status_code == 200

    def test_create_support_request(self, client):
        user = User.objects.create_user(
            email=f'pa-sac-{uuid.uuid4().hex[:6]}@test.local', password='pass'
        )
        tenant = Tenant.objects.create(name='SAT', slug=f'sa-t-{uuid.uuid4().hex[:6]}')
        _auth_client(client, user, tenant)
        resp = client.post(
            '/api/v1/platform/support-access/',
            {'target_tenant': str(tenant.id), 'reason': 'Debug'},
            content_type='application/json',
            HTTP_X_TENANT_ID=str(tenant.id),
        )
        assert resp.status_code == 201

    def test_approve_support_request(self, client):
        from platform_admin.models import SupportAccessRequest

        user, tenant = self._staff_client(client)
        target = Tenant.objects.create(name='SAAPgt', slug=f'saapgt-{uuid.uuid4().hex[:6]}')
        req = SupportAccessRequest.objects.create(
            requester=user,
            target_tenant=target,
            reason='Test',
        )
        resp = client.post(
            f'/api/v1/platform/support-access/{req.id}/approve/',
            HTTP_X_TENANT_ID=str(tenant.id),
        )
        assert resp.status_code == 200
        assert resp.json()['status'] == 'approved'

    def test_revoke_support_request(self, client):
        from platform_admin.models import SupportAccessRequest

        user, tenant = self._staff_client(client)
        target = Tenant.objects.create(name='SARVgt', slug=f'sarvgt-{uuid.uuid4().hex[:6]}')
        req = SupportAccessRequest.objects.create(
            requester=user,
            target_tenant=target,
            reason='Test',
        )
        resp = client.post(
            f'/api/v1/platform/support-access/{req.id}/revoke/',
            HTTP_X_TENANT_ID=str(tenant.id),
        )
        assert resp.status_code == 200
        assert resp.json()['status'] == 'revoked'

    def test_approve_non_staff_forbidden(self, client):
        user = User.objects.create_user(
            email=f'pa-sans-{uuid.uuid4().hex[:6]}@test.local', password='pass'
        )
        tenant = Tenant.objects.create(name='SANS', slug=f'sans-{uuid.uuid4().hex[:6]}')
        _auth_client(client, user, tenant)
        target = Tenant.objects.create(name='SANSgt', slug=f'sansgt-{uuid.uuid4().hex[:6]}')
        from platform_admin.models import SupportAccessRequest

        req = SupportAccessRequest.objects.create(
            requester=user,
            target_tenant=target,
            reason='Test',
        )
        resp = client.post(
            f'/api/v1/platform/support-access/{req.id}/approve/',
            HTTP_X_TENANT_ID=str(tenant.id),
        )
        assert resp.status_code == 403

    def test_revoke_non_staff_forbidden(self, client):
        user = User.objects.create_user(
            email=f'pa-sarvns-{uuid.uuid4().hex[:6]}@test.local', password='pass'
        )
        tenant = Tenant.objects.create(name='SARVNS', slug=f'sarvns-{uuid.uuid4().hex[:6]}')
        _auth_client(client, user, tenant)
        target = Tenant.objects.create(name='SARVNSgt', slug=f'sarvnsgt-{uuid.uuid4().hex[:6]}')
        from platform_admin.models import SupportAccessRequest

        req = SupportAccessRequest.objects.create(
            requester=user,
            target_tenant=target,
            reason='Test',
        )
        resp = client.post(
            f'/api/v1/platform/support-access/{req.id}/revoke/',
            HTTP_X_TENANT_ID=str(tenant.id),
        )
        assert resp.status_code == 403

    def test_approve_nonexistent(self, client):
        user, tenant = self._staff_client(client)
        resp = client.post(
            f'/api/v1/platform/support-access/{uuid.uuid4()}/approve/',
            HTTP_X_TENANT_ID=str(tenant.id),
        )
        assert resp.status_code == 404

    def test_revoke_nonexistent(self, client):
        user, tenant = self._staff_client(client)
        resp = client.post(
            f'/api/v1/platform/support-access/{uuid.uuid4()}/revoke/',
            HTTP_X_TENANT_ID=str(tenant.id),
        )
        assert resp.status_code == 404


class TestPlatformAdminAuditViewSet:
    def test_list_audits(self, client):
        user = User.objects.create_user(
            email=f'pa-audit-{uuid.uuid4().hex[:6]}@test.local', password='pass', is_staff=True
        )
        client.force_login(user)
        resp = client.get('/api/v1/platform/audit/')
        assert resp.status_code == 200

    def test_filter_by_action(self, client):
        from platform_admin.models import PlatformAdminAudit

        user = User.objects.create_user(
            email=f'pa-audita-{uuid.uuid4().hex[:6]}@test.local', password='pass', is_staff=True
        )
        client.force_login(user)
        PlatformAdminAudit.objects.create(actor=user, action='plan.created', detail={})
        resp = client.get('/api/v1/platform/audit/?action=plan.created')
        assert resp.status_code == 200
        assert len(resp.json()['results']) == 1


class TestTenantCapabilitiesView:
    def test_list_capabilities_no_subscription(self, client):
        tenant = Tenant.objects.create(name='TCap', slug=f'tcap-{uuid.uuid4().hex[:6]}')
        admin = User.objects.create_user(
            email=f'tcap-{uuid.uuid4().hex[:6]}@test.local', password='pass'
        )
        _auth_client(client, admin, tenant)
        resp = client.get('/api/v1/platform/tenant-capabilities/', HTTP_X_TENANT_ID=str(tenant.id))
        assert resp.status_code == 200
        data = resp.json()
        assert data['subscription_status'] == 'none'
        assert data['is_restricted'] is True

    def test_list_capabilities_with_subscription(self, client):
        from platform_admin.models import Plan, Subscription

        tenant = Tenant.objects.create(name='TCap2', slug=f'tcap2-{uuid.uuid4().hex[:6]}')
        admin = User.objects.create_user(
            email=f'tcap2-{uuid.uuid4().hex[:6]}@test.local', password='pass'
        )
        _auth_client(client, admin, tenant)
        plan = Plan.objects.create(code='tcap-plan', name='TCap Plan', capabilities={'sales': True})
        Subscription.objects.create(tenant=tenant, plan=plan, start_date='2026-01-01')
        resp = client.get('/api/v1/platform/tenant-capabilities/', HTTP_X_TENANT_ID=str(tenant.id))
        assert resp.status_code == 200
        data = resp.json()
        assert data['capabilities']['sales'] is True
        assert data['is_restricted'] is False


# ═══════════════════════════════════════════════════════════════════
# PART 4 — accounts/views/session.py
# ═══════════════════════════════════════════════════════════════════


class TestMeView:
    def test_me_returns_user_info(self, client):
        user = User.objects.create_user(
            email=f'me-{uuid.uuid4().hex[:6]}@test.local', password='pass'
        )
        tenant = Tenant.objects.create(name='MeT', slug=f'me-t-{uuid.uuid4().hex[:6]}')
        TenantMembership.objects.create(user=user, tenant=tenant, role='admin')
        client.force_login(user)
        resp = client.get('/api/v1/auth/me/')
        assert resp.status_code == 200
        data = resp.json()
        assert data['email'] == user.email
        assert len(data['memberships']) == 1

    def test_me_excludes_inactive_memberships(self, client):
        user = User.objects.create_user(
            email=f'mea-{uuid.uuid4().hex[:6]}@test.local', password='pass'
        )
        tenant = Tenant.objects.create(name='MeA', slug=f'mea-{uuid.uuid4().hex[:6]}')
        TenantMembership.objects.create(user=user, tenant=tenant, role='admin', is_active=False)
        client.force_login(user)
        resp = client.get('/api/v1/auth/me/')
        assert resp.status_code == 200
        assert len(resp.json()['memberships']) == 0

    def test_me_multiple_memberships(self, client):
        user = User.objects.create_user(
            email=f'mem-{uuid.uuid4().hex[:6]}@test.local', password='pass'
        )
        t1 = Tenant.objects.create(name='MeM1', slug=f'mem1-{uuid.uuid4().hex[:6]}')
        t2 = Tenant.objects.create(name='MeM2', slug=f'mem2-{uuid.uuid4().hex[:6]}')
        TenantMembership.objects.create(user=user, tenant=t1, role='admin')
        TenantMembership.objects.create(user=user, tenant=t2, role='operator')
        client.force_login(user)
        resp = client.get('/api/v1/auth/me/')
        assert resp.status_code == 200
        assert len(resp.json()['memberships']) == 2


class TestCSRFView:
    def test_get_csrf_token(self, client):
        resp = client.get('/api/v1/auth/csrf/')
        assert resp.status_code == 200
        assert 'csrf_token' in resp.json()


class TestLoginViewEdgeCases:
    def test_login_email_is_casefolded(self, client):
        user = User.objects.create_user(email='CaseFold@test.local', password='pass123')
        user.email_verified_at = timezone.now()
        user.save(update_fields=['email_verified_at'])
        resp = client.post(
            '/api/v1/auth/login/',
            {'email': 'CASEFOLD@TEST.LOCAL', 'password': 'pass123'},
            content_type='application/json',
        )
        assert resp.status_code == 202
        assert resp.json()['requires_mfa'] is True

    def test_login_email_is_stripped(self, client):
        user = User.objects.create_user(email='stripped@test.local', password='pass123')
        user.email_verified_at = timezone.now()
        user.save(update_fields=['email_verified_at'])
        resp = client.post(
            '/api/v1/auth/login/',
            {'email': '  stripped@test.local  ', 'password': 'pass123'},
            content_type='application/json',
        )
        assert resp.status_code == 202
        assert resp.json()['requires_mfa'] is True

    def test_login_no_membership_direct_login(self, client):
        user = User.objects.create_user(
            email=f'nomem-{uuid.uuid4().hex[:6]}@test.local', password='pass123'
        )
        user.email_verified_at = timezone.now()
        user.save(update_fields=['email_verified_at'])
        resp = client.post(
            '/api/v1/auth/login/',
            {'email': user.email, 'password': 'pass123'},
            content_type='application/json',
        )
        assert resp.status_code == 202
        assert resp.json()['requires_mfa'] is True
        assert 'mfa_tenant_id' not in resp.json()


class TestLogoutViewEdge:
    def test_logout_creates_audit(self, client):
        user = User.objects.create_user(
            email=f'logout-audit-{uuid.uuid4().hex[:6]}@test.local', password='pass'
        )
        client.force_login(user)
        resp = client.post('/api/v1/auth/logout/')
        assert resp.status_code == 204
        from audit.models import AuditRecord

        assert AuditRecord.objects.filter(
            actor=user,
            action='auth.logout',
        ).exists()
