import contextlib
from datetime import date

import pytest
from django.db import connection

from catalog.models import Product, Unit
from inventory.models import StockLot
from tenancy.context import reset_current_tenant_id, set_current_tenant_id


def _run_in_tenant(tenant, callback):
    """Helper para definir contexto PG igual ao middleware (nível transação)."""
    from django.db import connection

    from tenancy.context import reset_current_tenant_id, set_current_tenant_id

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


@contextlib.contextmanager
def pg_tenant_context(tenant):
    """Context manager para definir contexto PG igual ao middleware (nível sessão)."""
    token = set_current_tenant_id(tenant.id)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT set_config('app.current_tenant_id', %s, false)",
                [str(tenant.id)],
            )
        yield
    finally:
        reset_current_tenant_id(token)


@pytest.mark.django_db
def test_stock_lot_creation_and_validation(inv_tenant):
    """Testa criação de lote válido e validações."""
    from inventory.models import StockLot

    def _test():
        unit = Unit.all_objects.create(tenant=inv_tenant, symbol='un', name='Un', precision=0)
        product = Product.all_objects.create(
            tenant=inv_tenant,
            sku='LOT-PROD',
            name='Produto com Lote',
            base_unit=unit,
            requires_lot=True,
            requires_expiry=True,
        )

        # Criar lote válido
        lot = StockLot.all_objects.create(
            tenant=inv_tenant,
            product=product,
            lot_number='LOTE-001',
            manufacture_date=date(2024, 1, 1),
            expiry_date=date(2030, 1, 1),
        )

        assert lot.lot_number == 'LOTE-001'
        assert lot.is_active is True
        assert lot.is_expired is False

    _run_in_tenant(inv_tenant, _test)


@pytest.mark.django_db
def test_stock_lot_expired(inv_tenant):
    """Testa lote vencido."""
    from catalog.models import Product, Unit

    def _test():
        unit = Unit.all_objects.create(tenant=inv_tenant, symbol='un', name='Un', precision=0)
        product = Product.all_objects.create(
            tenant=inv_tenant,
            sku='EXP',
            name='Expirado',
            base_unit=unit,
            requires_lot=True,
            requires_expiry=True,
        )

        # Lote vencido - data no passado
        lot = StockLot.all_objects.create(
            tenant=inv_tenant,
            product=product,
            lot_number='EXP-001',
            manufacture_date=date(2020, 1, 1),
            expiry_date=date(2020, 1, 1),
        )

        assert lot.is_expired is True

    _run_in_tenant(inv_tenant, _test)


@pytest.mark.django_db
def test_stock_lot_expiry_validation(inv_tenant):
    """Testa validação de data de validade."""
    from django.core.exceptions import ValidationError

    from catalog.models import Product, Unit

    def _test():
        unit = Unit.all_objects.create(tenant=inv_tenant, symbol='un', name='Un', precision=0)
        product = Product.all_objects.create(
            tenant=inv_tenant,
            sku='VAL',
            name='Validade',
            base_unit=unit,
            requires_lot=True,
            requires_expiry=True,
        )

        # Lote com data de fabricação posterior à validade
        lot = StockLot(
            tenant=inv_tenant,
            product=product,
            lot_number='INV-001',
            manufacture_date=date(2025, 1, 1),
            expiry_date=date(2024, 1, 1),  # válido antes de fabricar
        )
        with pytest.raises(ValidationError):
            lot.full_clean()

    _run_in_tenant(inv_tenant, _test)


@pytest.mark.django_db
def test_stock_lot_duplicate_number_rejected(inv_tenant):
    """Testa rejeição de número de lote duplicado."""
    from catalog.models import Product, Unit

    def _test():
        unit = Unit.all_objects.create(tenant=inv_tenant, symbol='un', name='Un', precision=0)
        product = Product.all_objects.create(
            tenant=inv_tenant,
            sku='DUP',
            name='Duplicado',
            base_unit=unit,
        )

        StockLot.all_objects.create(
            tenant=inv_tenant,
            product=product,
            lot_number='LOTE-ABC',
        )

        with pytest.raises(Exception):
            StockLot.all_objects.create(
                tenant=inv_tenant,
                product=product,
                lot_number='LOTE-ABC',
            )

    _run_in_tenant(inv_tenant, _test)
