from contextlib import contextmanager
from decimal import Decimal

import pytest
from django.db import connection

from catalog.models import Product, Unit
from inventory.models import StockLocation
from inventory.serializers import StockMovementSerializer
from inventory.services import create_receipt
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
