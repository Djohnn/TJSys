"""Sprint 26 — Verify service sale does not generate stock movement."""

from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.utils import timezone

from catalog.models import Product, ProductPrice, Unit
from inventory.models import StockLocation, StockMovement
from inventory.services import create_receipt
from sales.services import create_counter_sale, open_cash_session
from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Branch, Company, Tenant


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
