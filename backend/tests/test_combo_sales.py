from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.utils import timezone

from catalog.models import ComboItem, CommercialCombo, Product, ProductPrice, Unit
from inventory.models import StockLocation
from inventory.services import create_receipt
from sales.services import create_counter_sale, open_cash_session
from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Branch, Company, Tenant

User = get_user_model()


def _run_in_tenant(tenant, callback):
    token = set_current_tenant_id(tenant.id)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'SELECT set_config(%s, %s, true)',
                ['app.current_tenant_id', str(tenant.id)],
            )
        return callback()
    finally:
        reset_current_tenant_id(token)


@pytest.fixture(autouse=True)
def _reset_pg_tenant_ctx():
    with connection.cursor() as cursor:
        cursor.execute('RESET app.current_tenant_id')
    yield
    with connection.cursor() as cursor:
        cursor.execute('RESET app.current_tenant_id')


@pytest.mark.django_db
def test_combo_sale_uses_combo_own_price():
    tenant = Tenant.objects.create(name='ComboSale', slug='combo-sale')
    user = User.objects.create_user(email='combosale@test.local', password='pass123')

    from tenancy.models import TenantMembership

    TenantMembership.objects.create(user=user, tenant=tenant, role='admin', is_active=True)

    def _setup():
        unit = Unit.all_objects.create(tenant=tenant, symbol='UN', name='Unidade')
        prod_a = Product.all_objects.create(
            tenant=tenant,
            sku='COMBO-ITEMA',
            name='Item A',
            base_unit=unit,
        )
        prod_b = Product.all_objects.create(
            tenant=tenant,
            sku='COMBO-ITEMB',
            name='Item B',
            base_unit=unit,
        )
        ProductPrice.all_objects.create(
            tenant=tenant,
            product=prod_a,
            amount=Decimal('50.00'),
            valid_from=timezone.now(),
        )
        ProductPrice.all_objects.create(
            tenant=tenant,
            product=prod_b,
            amount=Decimal('30.00'),
            valid_from=timezone.now(),
        )

        combo = CommercialCombo.all_objects.create(
            tenant=tenant,
            sku='MYCOMBO',
            name='Super Combo',
            price=Decimal('60.00'),
            valid_from=timezone.now(),
        )
        ComboItem.all_objects.create(
            tenant=tenant,
            combo=combo,
            item=prod_a,
            quantity=Decimal('1'),
        )
        ComboItem.all_objects.create(
            tenant=tenant,
            combo=combo,
            item=prod_b,
            quantity=Decimal('1'),
        )
        company = Company.all_objects.create(tenant=tenant, name='Co')
        branch = Branch.all_objects.create(tenant=tenant, company=company, name='Br')
        location = StockLocation.all_objects.create(
            tenant=tenant,
            branch=branch,
            code='STORE',
            name='Store',
            is_primary=True,
        )
        create_receipt(
            tenant,
            branch,
            prod_a,
            location,
            Decimal('10'),
            unit,
            Decimal('1'),
            idempotency_key='combosale-stock-a',
            actor=user,
            reason='seed combo stock',
        )
        create_receipt(
            tenant,
            branch,
            prod_b,
            location,
            Decimal('10'),
            unit,
            Decimal('1'),
            idempotency_key='combosale-stock-b',
            actor=user,
            reason='seed combo stock',
        )
        return unit, prod_a, prod_b, combo, branch, location

    unit, prod_a, prod_b, combo, branch, location = _run_in_tenant(tenant, _setup)

    _run_in_tenant(
        tenant,
        lambda: open_cash_session(
            tenant=tenant,
            branch=branch,
            operator=user,
            opening_amount=Decimal('100.00'),
            idempotency_key='combosale-cash',
        ),
    )

    items_sum_price = Decimal('50.00') + Decimal('30.00')
    assert combo.price == Decimal('60.00')
    assert combo.price != items_sum_price

    sale = _run_in_tenant(
        tenant,
        lambda: create_counter_sale(
            tenant=tenant,
            branch=branch,
            operator=user,
            stock_location=location,
            items=[
                {
                    'product': prod_a,
                    'unit': unit,
                    'quantity': Decimal('1'),
                    'factor': Decimal('1'),
                }
            ],
            payments=[{'method': 'cash', 'amount': Decimal('50.00')}],
            idempotency_key='combosale-regular',
        ),
    )
    assert sale.net_total == Decimal('50.00')
