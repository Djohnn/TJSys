import importlib
from contextlib import contextmanager
from decimal import Decimal

import pytest
from django.db import connection

from catalog.models import Product, Unit
from inventory.models import StockBalance, StockLocation
from inventory.serializers import StockMovementSerializer
from inventory.services import (
    ProductStockControlError,
    QuantityPrecisionError,
    create_receipt,
    reactivate_product_stock_control,
    release_reservation,
    reserve_stock,
    reverse_operation,
)
from inventory.views import StockOperationViewSet
from sales.views import SaleViewSet
from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Branch, Company, Tenant


@contextmanager
def _tenant_context(tenant):
    token = set_current_tenant_id(tenant.id)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SET app.current_tenant_id = %s', [str(tenant.id)])
        yield
    finally:
        reset_current_tenant_id(token)


def _stock_context(*, precision):
    tenant = Tenant.objects.create(
        name=f'Quantity precision {precision}',
        slug=f'quantity-precision-{precision}',
    )
    with _tenant_context(tenant):
        unit = Unit.all_objects.create(
            tenant=tenant,
            symbol='KG' if precision else 'UN',
            name='Quilograma' if precision else 'Unidade',
            precision=precision,
        )
        product = Product.all_objects.create(
            tenant=tenant,
            sku=f'QTY-{precision}',
            name='Produto de quantidade',
            base_unit=unit,
        )
        company = Company.all_objects.create(tenant=tenant, name='Empresa quantidade')
        branch = Branch.all_objects.create(
            tenant=tenant,
            company=company,
            name='Filial quantidade',
        )
        location = StockLocation.all_objects.create(
            tenant=tenant,
            branch=branch,
            code='QTY',
            name='Estoque',
        )
    return tenant, unit, product, branch, location


@pytest.mark.django_db
def test_integer_unit_preserves_exact_quantities_and_presentation():
    tenant, unit, product, branch, location = _stock_context(precision=0)

    with _tenant_context(tenant):
        for index, value in enumerate(('10', '100', '101', '1000')):
            operation = create_receipt(
                tenant,
                branch,
                product,
                location,
                Decimal(value),
                unit,
                Decimal('1'),
                idempotency_key=f'qty-{index}',
            )
            movement = operation.movements.get()
            assert movement.quantity == Decimal(value)
            assert StockMovementSerializer(movement).data['quantity'] == value


@pytest.mark.django_db
def test_integer_unit_rejects_fractional_quantity_in_domain_service():
    tenant, unit, product, branch, location = _stock_context(precision=0)

    with _tenant_context(tenant), pytest.raises(ValueError, match='at most 0 decimal places'):
        create_receipt(
            tenant,
            branch,
            product,
            location,
            Decimal('10.1'),
            unit,
            Decimal('1'),
            idempotency_key='qty-fractional',
        )


@pytest.mark.django_db
def test_kg_unit_accepts_three_decimal_places_and_normalizes_output():
    tenant, unit, product, branch, location = _stock_context(precision=3)

    with _tenant_context(tenant):
        for index, value, expected in (
            ('one', Decimal('1.000'), '1'),
            ('half', Decimal('0.500'), '0.5'),
        ):
            operation = create_receipt(
                tenant,
                branch,
                product,
                location,
                value,
                unit,
                Decimal('1'),
                idempotency_key=f'kg-{index}',
            )
            movement = operation.movements.get()
            assert movement.quantity == value
            assert StockMovementSerializer(movement).data['quantity'] == expected


@pytest.mark.django_db
def test_kg_unit_rejects_more_than_three_decimal_places():
    tenant, unit, product, branch, location = _stock_context(precision=3)

    with _tenant_context(tenant), pytest.raises(ValueError, match='at most 3 decimal places'):
        create_receipt(
            tenant,
            branch,
            product,
            location,
            Decimal('0.5001'),
            unit,
            Decimal('1'),
            idempotency_key='kg-too-precise',
        )


def test_quantity_precision_error_has_stable_inventory_and_sales_problem_code():
    error = QuantityPrecisionError('too many decimal places')

    inventory_response = StockOperationViewSet()._handle_stock_error(error)
    sales_response = SaleViewSet()._handle_sales_error(error)

    assert inventory_response.status_code == 400
    assert inventory_response.data['type'].endswith('/invalid_quantity_precision')
    assert sales_response.status_code == 400
    assert sales_response.data['type'].endswith('/invalid_quantity_precision')


@pytest.mark.django_db
def test_kg_data_migration_updates_all_tenants_without_renaming_units():
    tenant_a, unit_a, *_ = _stock_context(precision=0)
    tenant_b, unit_b, *_ = _stock_context(precision=3)
    with _tenant_context(tenant_a):
        unit_a.symbol = 'KG'
        unit_a.name = 'Quilo legado A'
        unit_a.save(update_fields=['symbol', 'name'])
    with _tenant_context(tenant_b):
        unit_b.symbol = 'kg'
        unit_b.name = 'Quilo legado B'
        unit_b.precision = 0
        unit_b.save(update_fields=['symbol', 'name', 'precision'])

    migration = importlib.import_module('catalog.migrations.0016_normalize_known_unit_precision')
    migration.set_kg_precision(importlib.import_module('django.apps').apps, None)

    with _tenant_context(tenant_a):
        unit_a.refresh_from_db()
        assert unit_a.precision == 3
        assert unit_a.name == 'Quilo legado A'
    with _tenant_context(tenant_b):
        unit_b.refresh_from_db()
        assert unit_b.precision == 3
        assert unit_b.name == 'Quilo legado B'


@pytest.mark.django_db
@pytest.mark.parametrize('reservation_operation', [reserve_stock, release_reservation])
def test_reservation_operations_reject_non_positive_quantity(reservation_operation):
    tenant, unit, product, _branch, location = _stock_context(precision=3)

    with _tenant_context(tenant), pytest.raises(ValueError, match='positive'):
        reservation_operation(
            tenant,
            product,
            location,
            Decimal('-0.500'),
        )


@pytest.mark.django_db
def test_reservation_rejects_invalid_precision_before_creating_balance():
    tenant, unit, product, _branch, location = _stock_context(precision=3)

    with _tenant_context(tenant), pytest.raises(ValueError, match='at most 3 decimal places'):
        reserve_stock(tenant, product, location, Decimal('0.5001'))

    assert not StockBalance.all_objects.filter(
        tenant=tenant,
        product=product,
        location=location,
    ).exists()


@pytest.mark.django_db
def test_reversal_reuses_original_quantity_and_factor_for_integer_units():
    tenant, unit, product, branch, location = _stock_context(precision=0)

    with _tenant_context(tenant):
        receipt = create_receipt(
            tenant,
            branch,
            product,
            location,
            Decimal('1'),
            unit,
            Decimal('0.5'),
            idempotency_key='reverse-factor-receipt',
        )
        reversal = reverse_operation(
            receipt,
            reason='undo',
            idempotency_key='reverse-factor-reversal',
        )
        assert reversal.movements.get().quantity == Decimal('0.500000')
        assert StockBalance.all_objects.get(
            tenant=tenant,
            product=product,
            location=location,
        ).quantity == Decimal('0')


@pytest.mark.django_db
@pytest.mark.parametrize(
    'initial_stock, message',
    [
        ({'location_id': 'not-a-uuid', 'quantity': '1'}, 'Localização inválida'),
        ({'location_id': '00000000-0000-0000-0000-000000000001', 'quantity': '0'}, 'positiva'),
        (
            {'location_id': '00000000-0000-0000-0000-000000000001', 'quantity': 'not-a-number'},
            'Quantidade inválida',
        ),
    ],
)
def test_reactivate_rejects_malformed_initial_stock(initial_stock, message):
    tenant, _unit, product, _branch, _location = _stock_context(precision=3)
    with _tenant_context(tenant):
        with pytest.raises(ProductStockControlError, match=message):
            reactivate_product_stock_control(
                tenant=tenant,
                product=product,
                actor=None,
                command_id='reactivate-invalid-input',
                initial_stocks=[initial_stock],
            )
