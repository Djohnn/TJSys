import json
import uuid
from decimal import Decimal
from unittest.mock import MagicMock

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.utils import timezone

from catalog.models import Product, ProductPrice, Unit
from inventory.models import StockLocation
from inventory.services import create_receipt
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
        user=user,
        tenant=tenant,
        defaults={'role': 'admin', 'is_active': True},
    )
    client.force_login(user)
    session = client.session
    session['mfa_tenant_id'] = str(tenant.id)
    session['mfa_method'] = 'totp'
    session.save()
    return client


def _post_json(client, url, payload, *, tenant, idempotency_key):
    return client.post(
        url,
        data=json.dumps(payload),
        content_type='application/json',
        HTTP_X_TENANT_ID=str(tenant.id),
        HTTP_IDEMPOTENCY_KEY=idempotency_key,
    )


# ============================================================================
# FIXTURES
# ============================================================================


@pytest.fixture
def full_sales_context(django_user_model):
    tenant = Tenant.objects.create(name='Full Sales', slug='full-sales')
    user = django_user_model.objects.create_user(email='full-sales@test.local', password='pass123')
    TenantMembership.objects.create(user=user, tenant=tenant, role='admin', is_active=True)

    def _create():
        unit = Unit.all_objects.create(tenant=tenant, symbol='UN', name='Unidade', precision=0)
        product = Product.all_objects.create(
            tenant=tenant, sku='FULL-001', name='Produto Full', base_unit=unit
        )
        ProductPrice.all_objects.create(
            tenant=tenant, product=product, amount=Decimal('15.00'), valid_from=timezone.now()
        )
        company = Company.all_objects.create(tenant=tenant, name='Empresa Full')
        branch = Branch.all_objects.create(tenant=tenant, company=company, name='Filial Full')
        location = StockLocation.all_objects.create(
            tenant=tenant, branch=branch, code='BALCAO', name='Balcão', is_primary=True
        )
        create_receipt(
            tenant,
            branch,
            product,
            location,
            Decimal('20'),
            unit,
            Decimal('1'),
            idempotency_key='full-seed-stock',
            actor=user,
            reason='seed',
        )
        return {
            'tenant': tenant,
            'user': user,
            'unit': unit,
            'product': product,
            'branch': branch,
            'location': location,
            'company': company,
        }

    return _run_in_tenant(tenant, _create)


@pytest.fixture
def sales_api_ctx(client, django_user_model):
    tenant = Tenant.objects.create(name='Sales API2', slug='sales-api2')
    user = django_user_model.objects.create_user(email='sales-api2@test.local', password='pass123')
    api_client = _auth_client(client, user, tenant)

    def _create():
        unit = Unit.all_objects.create(tenant=tenant, symbol='UN', name='Un', precision=0)
        product = Product.all_objects.create(
            tenant=tenant, sku='API2-001', name='Prod API2', base_unit=unit
        )
        ProductPrice.all_objects.create(
            tenant=tenant, product=product, amount=Decimal('20.00'), valid_from=timezone.now()
        )
        company = Company.all_objects.create(tenant=tenant, name='Co API2')
        branch = Branch.all_objects.create(tenant=tenant, company=company, name='Branch API2')
        location = StockLocation.all_objects.create(
            tenant=tenant, branch=branch, code='BAL', name='Balcao', is_primary=True
        )
        create_receipt(
            tenant,
            branch,
            product,
            location,
            Decimal('50'),
            unit,
            Decimal('1'),
            idempotency_key='api2-seed',
            actor=user,
            reason='seed',
        )
        return {
            'tenant': tenant,
            'user': user,
            'client': api_client,
            'unit': unit,
            'product': product,
            'branch': branch,
            'location': location,
        }

    return _run_in_tenant(tenant, _create)


# ============================================================================
# SALES/SERVICES.PY — open_cash_session
# ============================================================================


@pytest.mark.django_db
def test_open_cash_session_requires_idempotency_key(full_sales_context):
    from sales.services import open_cash_session

    ctx = full_sales_context

    def _test():
        with pytest.raises(ValueError, match='Idempotency-Key is required'):
            open_cash_session(
                tenant=ctx['tenant'],
                branch=ctx['branch'],
                operator=ctx['user'],
                opening_amount=Decimal('10.00'),
                idempotency_key='',
            )

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_open_cash_session_duplicate_idempotency_different_payload(full_sales_context):
    from sales.services import DuplicateIdempotencyKey, open_cash_session

    ctx = full_sales_context

    def _test():
        open_cash_session(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            opening_amount=Decimal('10.00'),
            idempotency_key='dup-cash',
        )
        with pytest.raises(DuplicateIdempotencyKey):
            open_cash_session(
                tenant=ctx['tenant'],
                branch=ctx['branch'],
                operator=ctx['user'],
                opening_amount=Decimal('20.00'),
                idempotency_key='dup-cash',
            )

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_open_cash_session_rejects_when_already_open(full_sales_context):
    from sales.services import OpenCashSessionExists, open_cash_session

    ctx = full_sales_context

    def _test():
        open_cash_session(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            opening_amount=Decimal('5.00'),
            idempotency_key='first-open',
        )
        with pytest.raises(OpenCashSessionExists):
            open_cash_session(
                tenant=ctx['tenant'],
                branch=ctx['branch'],
                operator=ctx['user'],
                opening_amount=Decimal('5.00'),
                idempotency_key='second-open',
            )

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_open_cash_session_creates_movement(full_sales_context):
    from sales.models import CashMovement
    from sales.services import open_cash_session

    ctx = full_sales_context

    def _test():
        session = open_cash_session(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            opening_amount=Decimal('100.00'),
            idempotency_key='cash-movement-test',
        )
        assert session.status == 'open'
        assert session.opening_amount == Decimal('100.00')
        assert session.expected_amount == Decimal('100.00')
        assert CashMovement.all_objects.filter(
            cash_session=session, movement_type='opening', amount=Decimal('100.00')
        ).exists()

    _run_in_tenant(ctx['tenant'], _test)


# ============================================================================
# SALES/SERVICES.PY — close_cash_session
# ============================================================================


@pytest.mark.django_db
def test_close_cash_session_requires_idempotency_key(full_sales_context):
    from sales.services import close_cash_session, open_cash_session

    ctx = full_sales_context

    def _test():
        session = open_cash_session(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            opening_amount=Decimal('0'),
            idempotency_key='close-nokey-open',
        )
        with pytest.raises(ValueError, match='Idempotency-Key is required'):
            close_cash_session(
                cash_session=session, closing_amount=Decimal('0'), idempotency_key=''
            )

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_close_cash_session_already_closed_returns_same(full_sales_context):
    from sales.services import close_cash_session, open_cash_session

    ctx = full_sales_context

    def _test():
        session = open_cash_session(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            opening_amount=Decimal('0'),
            idempotency_key='close-already-open',
        )
        close_cash_session(
            cash_session=session,
            closing_amount=Decimal('0'),
            idempotency_key='close-already-key',
        )
        result = close_cash_session(
            cash_session=session,
            closing_amount=Decimal('0'),
            idempotency_key='close-already-key2',
        )
        assert result.status == 'closed'

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_close_cash_session_with_no_difference(full_sales_context):
    from sales.services import close_cash_session, open_cash_session

    ctx = full_sales_context

    def _test():
        session = open_cash_session(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            opening_amount=Decimal('50.00'),
            idempotency_key='close-nodiff-open',
        )
        closed = close_cash_session(
            cash_session=session,
            closing_amount=Decimal('50.00'),
            idempotency_key='close-nodiff-key',
        )
        assert closed.status == 'closed'
        assert closed.closing_amount == Decimal('50.00')
        assert closed.closed_at is not None

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_close_cash_session_with_difference_creates_adjustment(full_sales_context):
    from sales.models import CashMovement
    from sales.services import close_cash_session, open_cash_session

    ctx = full_sales_context

    def _test():
        session = open_cash_session(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            opening_amount=Decimal('100.00'),
            idempotency_key='close-diff-open',
        )
        closed = close_cash_session(
            cash_session=session,
            closing_amount=Decimal('95.00'),
            idempotency_key='close-diff-key',
        )
        assert closed.status == 'closed'
        assert CashMovement.all_objects.filter(
            cash_session=closed, movement_type='closing_adjustment'
        ).exists()

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_close_cash_session_includes_sales_and_movements_in_expected(full_sales_context):
    from sales.services import close_cash_session, create_counter_sale, open_cash_session

    ctx = full_sales_context

    def _test():
        session = open_cash_session(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            opening_amount=Decimal('0'),
            idempotency_key='close-sales-open',
        )
        create_counter_sale(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            stock_location=ctx['location'],
            items=[
                {
                    'product': ctx['product'],
                    'unit': ctx['unit'],
                    'quantity': Decimal('2'),
                    'factor': Decimal('1'),
                }
            ],
            payments=[{'method': 'cash', 'amount': Decimal('30.00')}],
            idempotency_key='close-sales-sale',
        )
        closed = close_cash_session(
            cash_session=session,
            closing_amount=Decimal('30.00'),
            idempotency_key='close-sales-key',
        )
        assert closed.status == 'closed'
        assert closed.expected_amount == Decimal('30.00')

    _run_in_tenant(ctx['tenant'], _test)


# ============================================================================
# SALES/SERVICES.PY — create_counter_sale
# ============================================================================


@pytest.mark.django_db
def test_create_counter_sale_no_items_raises_empty_sale(full_sales_context):
    from sales.services import EmptySale, create_counter_sale, open_cash_session

    ctx = full_sales_context

    def _test():
        open_cash_session(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            opening_amount=Decimal('0'),
            idempotency_key='empty-open',
        )
        with pytest.raises(EmptySale):
            create_counter_sale(
                tenant=ctx['tenant'],
                branch=ctx['branch'],
                operator=ctx['user'],
                stock_location=ctx['location'],
                items=[],
                payments=[],
                idempotency_key='empty-sale',
            )

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_create_counter_sale_no_payments_raises_payment_mismatch(full_sales_context):
    from sales.services import PaymentMismatch, create_counter_sale, open_cash_session

    ctx = full_sales_context

    def _test():
        open_cash_session(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            opening_amount=Decimal('0'),
            idempotency_key='no-pay-open',
        )
        with pytest.raises(PaymentMismatch, match='at least one payment'):
            create_counter_sale(
                tenant=ctx['tenant'],
                branch=ctx['branch'],
                operator=ctx['user'],
                stock_location=ctx['location'],
                items=[
                    {
                        'product': ctx['product'],
                        'unit': ctx['unit'],
                        'quantity': Decimal('1'),
                        'factor': Decimal('1'),
                    }
                ],
                payments=[],
                idempotency_key='no-pay-sale',
            )

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_create_counter_sale_no_idempotency_key_raises(full_sales_context):
    from sales.services import create_counter_sale

    ctx = full_sales_context

    def _test():
        with pytest.raises(ValueError, match='Idempotency-Key is required'):
            create_counter_sale(
                tenant=ctx['tenant'],
                branch=ctx['branch'],
                operator=ctx['user'],
                stock_location=ctx['location'],
                items=[],
                payments=[],
                idempotency_key='',
            )

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_create_counter_sale_negative_line_total_raises(full_sales_context):
    from sales.services import create_counter_sale, open_cash_session

    ctx = full_sales_context

    def _test():
        open_cash_session(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            opening_amount=Decimal('0'),
            idempotency_key='neg-open',
        )
        with pytest.raises(ValueError, match='Line total cannot be negative'):
            create_counter_sale(
                tenant=ctx['tenant'],
                branch=ctx['branch'],
                operator=ctx['user'],
                stock_location=ctx['location'],
                items=[
                    {
                        'product': ctx['product'],
                        'unit': ctx['unit'],
                        'quantity': Decimal('1'),
                        'factor': Decimal('1'),
                        'discount_amount': Decimal('999.00'),
                    }
                ],
                payments=[{'method': 'cash', 'amount': Decimal('0')}],
                idempotency_key='neg-sale',
            )

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_create_counter_sale_payment_mismatch_raises(full_sales_context):
    from sales.services import PaymentMismatch, create_counter_sale, open_cash_session

    ctx = full_sales_context

    def _test():
        open_cash_session(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            opening_amount=Decimal('0'),
            idempotency_key='mismatch-open',
        )
        with pytest.raises(PaymentMismatch, match='must match'):
            create_counter_sale(
                tenant=ctx['tenant'],
                branch=ctx['branch'],
                operator=ctx['user'],
                stock_location=ctx['location'],
                items=[
                    {
                        'product': ctx['product'],
                        'unit': ctx['unit'],
                        'quantity': Decimal('1'),
                        'factor': Decimal('1'),
                    }
                ],
                payments=[{'method': 'cash', 'amount': Decimal('1.00')}],
                idempotency_key='mismatch-sale',
            )

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_create_counter_sale_with_discount(full_sales_context):
    from sales.services import create_counter_sale, open_cash_session

    ctx = full_sales_context

    def _test():
        open_cash_session(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            opening_amount=Decimal('0'),
            idempotency_key='disc-open',
        )
        sale = create_counter_sale(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            stock_location=ctx['location'],
            items=[
                {
                    'product': ctx['product'],
                    'unit': ctx['unit'],
                    'quantity': Decimal('2'),
                    'factor': Decimal('1'),
                    'discount_amount': Decimal('5.00'),
                }
            ],
            payments=[{'method': 'cash', 'amount': Decimal('25.00')}],
            idempotency_key='disc-sale',
        )
        assert sale.discount_total == Decimal('5.00')
        assert sale.gross_total == Decimal('30.00')
        assert sale.net_total == Decimal('25.00')

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_create_counter_sale_with_customer(full_sales_context):
    from people.models import Person
    from sales.services import create_counter_sale, open_cash_session

    ctx = full_sales_context

    def _test():
        customer = Person.all_objects.create(
            tenant=ctx['tenant'], name='Cliente Teste', person_type='PF'
        )
        open_cash_session(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            opening_amount=Decimal('0'),
            idempotency_key='cust-open',
        )
        sale = create_counter_sale(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            stock_location=ctx['location'],
            items=[
                {
                    'product': ctx['product'],
                    'unit': ctx['unit'],
                    'quantity': Decimal('1'),
                    'factor': Decimal('1'),
                }
            ],
            payments=[{'method': 'pix', 'amount': Decimal('15.00')}],
            idempotency_key='cust-sale',
            customer=customer,
        )
        assert sale.customer_id == customer.id

    _run_in_tenant(ctx['tenant'], _test)


# ============================================================================
# SALES/SERVICES.PY — create_sale_return
# ============================================================================


@pytest.mark.django_db
def test_create_sale_return_requires_idempotency_key(full_sales_context):
    from sales.services import create_counter_sale, create_sale_return, open_cash_session

    ctx = full_sales_context

    def _test():
        open_cash_session(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            opening_amount=Decimal('0'),
            idempotency_key='ret-nokey-open',
        )
        sale = create_counter_sale(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            stock_location=ctx['location'],
            items=[
                {
                    'product': ctx['product'],
                    'unit': ctx['unit'],
                    'quantity': Decimal('2'),
                    'factor': Decimal('1'),
                }
            ],
            payments=[{'method': 'cash', 'amount': Decimal('30.00')}],
            idempotency_key='ret-nokey-sale',
        )
        with pytest.raises(ValueError, match='Idempotency-Key is required'):
            create_sale_return(
                tenant=ctx['tenant'],
                sale=sale,
                items=[{'sale_item_id': str(sale.items.first().id), 'quantity': Decimal('1')}],
                reason='Defeito',
                idempotency_key='',
            )

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_create_sale_return_requires_items(full_sales_context):
    from sales.services import create_counter_sale, create_sale_return, open_cash_session

    ctx = full_sales_context

    def _test():
        open_cash_session(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            opening_amount=Decimal('0'),
            idempotency_key='ret-noitems-open',
        )
        sale = create_counter_sale(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            stock_location=ctx['location'],
            items=[
                {
                    'product': ctx['product'],
                    'unit': ctx['unit'],
                    'quantity': Decimal('1'),
                    'factor': Decimal('1'),
                }
            ],
            payments=[{'method': 'cash', 'amount': Decimal('15.00')}],
            idempotency_key='ret-noitems-sale',
        )
        with pytest.raises(ValueError, match='at least one item'):
            create_sale_return(
                tenant=ctx['tenant'],
                sale=sale,
                items=[],
                reason='Teste',
                idempotency_key='ret-noitems-key',
            )

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_create_sale_return_requires_reason(full_sales_context):
    from sales.services import create_counter_sale, create_sale_return, open_cash_session

    ctx = full_sales_context

    def _test():
        open_cash_session(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            opening_amount=Decimal('0'),
            idempotency_key='ret-noreason-open',
        )
        sale = create_counter_sale(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            stock_location=ctx['location'],
            items=[
                {
                    'product': ctx['product'],
                    'unit': ctx['unit'],
                    'quantity': Decimal('1'),
                    'factor': Decimal('1'),
                }
            ],
            payments=[{'method': 'cash', 'amount': Decimal('15.00')}],
            idempotency_key='ret-noreason-sale',
        )
        with pytest.raises(ValueError, match='Reason is required'):
            create_sale_return(
                tenant=ctx['tenant'],
                sale=sale,
                items=[{'sale_item_id': str(sale.items.first().id), 'quantity': Decimal('1')}],
                reason='',
                idempotency_key='ret-noreason-key',
            )

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_create_sale_return_insufficient_quantity(full_sales_context):
    from sales.services import (
        InsufficientReturnableQuantity,
        create_counter_sale,
        create_sale_return,
        open_cash_session,
    )

    ctx = full_sales_context

    def _test():
        open_cash_session(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            opening_amount=Decimal('0'),
            idempotency_key='ret-insuf-open',
        )
        sale = create_counter_sale(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            stock_location=ctx['location'],
            items=[
                {
                    'product': ctx['product'],
                    'unit': ctx['unit'],
                    'quantity': Decimal('1'),
                    'factor': Decimal('1'),
                }
            ],
            payments=[{'method': 'cash', 'amount': Decimal('15.00')}],
            idempotency_key='ret-insuf-sale',
        )
        with pytest.raises(InsufficientReturnableQuantity):
            create_sale_return(
                tenant=ctx['tenant'],
                sale=sale,
                items=[{'sale_item_id': str(sale.items.first().id), 'quantity': Decimal('5')}],
                reason='Too many',
                idempotency_key='ret-insuf-key',
            )

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_create_sale_return_invalid_sale_item(full_sales_context):
    from sales.services import create_counter_sale, create_sale_return, open_cash_session

    ctx = full_sales_context

    def _test():
        open_cash_session(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            opening_amount=Decimal('0'),
            idempotency_key='ret-baditem-open',
        )
        sale = create_counter_sale(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            stock_location=ctx['location'],
            items=[
                {
                    'product': ctx['product'],
                    'unit': ctx['unit'],
                    'quantity': Decimal('1'),
                    'factor': Decimal('1'),
                }
            ],
            payments=[{'method': 'cash', 'amount': Decimal('15.00')}],
            idempotency_key='ret-baditem-sale',
        )
        fake_id = str(uuid.uuid4())
        with pytest.raises(ValueError, match='not found in sale'):
            create_sale_return(
                tenant=ctx['tenant'],
                sale=sale,
                items=[{'sale_item_id': fake_id, 'quantity': Decimal('1')}],
                reason='Teste',
                idempotency_key='ret-baditem-key',
            )

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_create_sale_return_happy_path(full_sales_context):
    from sales.models import SaleReturnItem
    from sales.services import create_counter_sale, create_sale_return, open_cash_session

    ctx = full_sales_context

    def _test():
        open_cash_session(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            opening_amount=Decimal('0'),
            idempotency_key='ret-ok-open',
        )
        sale = create_counter_sale(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            stock_location=ctx['location'],
            items=[
                {
                    'product': ctx['product'],
                    'unit': ctx['unit'],
                    'quantity': Decimal('3'),
                    'factor': Decimal('1'),
                }
            ],
            payments=[{'method': 'cash', 'amount': Decimal('45.00')}],
            idempotency_key='ret-ok-sale',
        )
        sale_item = sale.items.first()
        sale_return = create_sale_return(
            tenant=ctx['tenant'],
            sale=sale,
            items=[{'sale_item_id': str(sale_item.id), 'quantity': Decimal('1')}],
            reason='Defeito',
            idempotency_key='ret-ok-key',
            actor=ctx['user'],
        )
        assert sale_return.status == 'completed'
        assert sale_return.reason == 'Defeito'
        assert SaleReturnItem.all_objects.filter(sale_return=sale_return).count() == 1

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_create_sale_return_idempotent_replay(full_sales_context):
    from sales.services import create_counter_sale, create_sale_return, open_cash_session

    ctx = full_sales_context

    def _test():
        open_cash_session(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            opening_amount=Decimal('0'),
            idempotency_key='ret-idem-open',
        )
        sale = create_counter_sale(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            stock_location=ctx['location'],
            items=[
                {
                    'product': ctx['product'],
                    'unit': ctx['unit'],
                    'quantity': Decimal('2'),
                    'factor': Decimal('1'),
                }
            ],
            payments=[{'method': 'cash', 'amount': Decimal('30.00')}],
            idempotency_key='ret-idem-sale',
        )
        sale_item = sale.items.first()
        payload = {
            'tenant': ctx['tenant'],
            'sale': sale,
            'items': [{'sale_item_id': str(sale_item.id), 'quantity': Decimal('1')}],
            'reason': 'Teste replay',
            'idempotency_key': 'ret-idem-key',
        }
        first = create_sale_return(**payload)
        replay = create_sale_return(**payload)
        assert replay.id == first.id

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_create_sale_return_duplicate_idempotency_different_payload(full_sales_context):
    from sales.services import (
        DuplicateIdempotencyKey,
        create_counter_sale,
        create_sale_return,
        open_cash_session,
    )

    ctx = full_sales_context

    def _test():
        open_cash_session(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            opening_amount=Decimal('0'),
            idempotency_key='ret-dup-open',
        )
        sale = create_counter_sale(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            stock_location=ctx['location'],
            items=[
                {
                    'product': ctx['product'],
                    'unit': ctx['unit'],
                    'quantity': Decimal('2'),
                    'factor': Decimal('1'),
                }
            ],
            payments=[{'method': 'cash', 'amount': Decimal('30.00')}],
            idempotency_key='ret-dup-sale',
        )
        sale_item = sale.items.first()
        create_sale_return(
            tenant=ctx['tenant'],
            sale=sale,
            items=[{'sale_item_id': str(sale_item.id), 'quantity': Decimal('1')}],
            reason='Primeiro',
            idempotency_key='ret-dup-key',
        )
        with pytest.raises(DuplicateIdempotencyKey):
            create_sale_return(
                tenant=ctx['tenant'],
                sale=sale,
                items=[{'sale_item_id': str(sale_item.id), 'quantity': Decimal('2')}],
                reason='Segundo',
                idempotency_key='ret-dup-key',
            )

    _run_in_tenant(ctx['tenant'], _test)


# ============================================================================
# SALES/SERVICES.PY — create_sale_refund
# ============================================================================


@pytest.mark.django_db
def test_create_sale_refund_requires_idempotency_key(full_sales_context):
    from sales.models import Sale
    from sales.services import create_sale_refund

    ctx = full_sales_context

    def _test():
        sale = Sale.all_objects.filter(tenant=ctx['tenant']).first()
        with pytest.raises(ValueError, match='Idempotency-Key is required'):
            create_sale_refund(
                tenant=ctx['tenant'],
                sale=sale,
                method='pix',
                amount=Decimal('10.00'),
                reason='Teste sem chave',
                idempotency_key='',
            )

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_create_sale_refund_negative_amount_raises(full_sales_context):
    from sales.models import Sale
    from sales.services import create_sale_refund

    ctx = full_sales_context

    def _test():
        sale = Sale.all_objects.filter(tenant=ctx['tenant']).first()
        with pytest.raises(ValueError, match='must be positive'):
            create_sale_refund(
                tenant=ctx['tenant'],
                sale=sale,
                method='pix',
                amount=Decimal('-5.00'),
                reason='Teste negativo',
                idempotency_key='refund-neg',
            )

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_create_sale_refund_zero_amount_raises(full_sales_context):
    from sales.models import Sale
    from sales.services import create_sale_refund

    ctx = full_sales_context

    def _test():
        sale = Sale.all_objects.filter(tenant=ctx['tenant']).first()
        with pytest.raises(ValueError, match='must be positive'):
            create_sale_refund(
                tenant=ctx['tenant'],
                sale=sale,
                method='pix',
                amount=Decimal('0'),
                reason='Teste zero',
                idempotency_key='refund-zero',
            )

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_create_sale_refund_pix_happy_path(full_sales_context):
    from sales.services import create_counter_sale, create_sale_refund, open_cash_session

    ctx = full_sales_context

    def _test():
        open_cash_session(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            opening_amount=Decimal('0'),
            idempotency_key='refund-pix-open',
        )
        sale = create_counter_sale(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            stock_location=ctx['location'],
            items=[
                {
                    'product': ctx['product'],
                    'unit': ctx['unit'],
                    'quantity': Decimal('1'),
                    'factor': Decimal('1'),
                }
            ],
            payments=[{'method': 'pix', 'amount': Decimal('15.00')}],
            idempotency_key='refund-pix-sale',
        )
        refund = create_sale_refund(
            tenant=ctx['tenant'],
            sale=sale,
            method='pix',
            amount=Decimal('15.00'),
            reason='Devolução ao cliente',
            idempotency_key='refund-pix-key',
            actor=ctx['user'],
        )
        assert refund.status == 'completed'
        assert refund.method == 'pix'
        assert refund.amount == Decimal('15.00')

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_create_sale_refund_cash_creates_cash_movement(full_sales_context):
    from sales.models import CashMovement
    from sales.services import create_counter_sale, create_sale_refund, open_cash_session

    ctx = full_sales_context

    def _test():
        open_cash_session(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            opening_amount=Decimal('50.00'),
            idempotency_key='refund-cash-open',
        )
        sale = create_counter_sale(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            stock_location=ctx['location'],
            items=[
                {
                    'product': ctx['product'],
                    'unit': ctx['unit'],
                    'quantity': Decimal('2'),
                    'factor': Decimal('1'),
                }
            ],
            payments=[{'method': 'cash', 'amount': Decimal('30.00')}],
            idempotency_key='refund-cash-sale',
        )
        refund = create_sale_refund(
            tenant=ctx['tenant'],
            sale=sale,
            method='cash',
            amount=Decimal('30.00'),
            reason='Devolução ao cliente',
            idempotency_key='refund-cash-key',
            actor=ctx['user'],
        )
        assert refund.status == 'completed'
        assert CashMovement.all_objects.filter(
            cash_session__tenant=ctx['tenant'],
            movement_type='cash_out',
            amount=Decimal('30.00'),
        ).exists()

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_create_sale_refund_cash_no_open_session_raises(full_sales_context):
    from sales.services import (
        CashSessionRequired,
        create_counter_sale,
        create_sale_refund,
        open_cash_session,
    )

    ctx = full_sales_context

    def _test():
        session = open_cash_session(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            opening_amount=Decimal('0'),
            idempotency_key='refund-nosess-open',
        )
        sale = create_counter_sale(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            stock_location=ctx['location'],
            items=[
                {
                    'product': ctx['product'],
                    'unit': ctx['unit'],
                    'quantity': Decimal('1'),
                    'factor': Decimal('1'),
                }
            ],
            payments=[{'method': 'cash', 'amount': Decimal('15.00')}],
            idempotency_key='refund-nosess-sale',
        )
        from sales.services import close_cash_session

        close_cash_session(
            cash_session=session,
            closing_amount=Decimal('15.00'),
            idempotency_key='refund-nosess-close',
        )
        with pytest.raises(CashSessionRequired):
            create_sale_refund(
                tenant=ctx['tenant'],
                sale=sale,
                method='cash',
                amount=Decimal('5.00'),
                reason='Devolução ao cliente',
                idempotency_key='refund-nosess-key',
            )

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_create_sale_refund_with_return(full_sales_context):
    from sales.services import (
        create_counter_sale,
        create_sale_refund,
        create_sale_return,
        open_cash_session,
    )

    ctx = full_sales_context

    def _test():
        open_cash_session(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            opening_amount=Decimal('0'),
            idempotency_key='refund-ret-open',
        )
        sale = create_counter_sale(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            stock_location=ctx['location'],
            items=[
                {
                    'product': ctx['product'],
                    'unit': ctx['unit'],
                    'quantity': Decimal('2'),
                    'factor': Decimal('1'),
                }
            ],
            payments=[{'method': 'pix', 'amount': Decimal('30.00')}],
            idempotency_key='refund-ret-sale',
        )
        sale_item = sale.items.first()
        sale_return = create_sale_return(
            tenant=ctx['tenant'],
            sale=sale,
            items=[{'sale_item_id': str(sale_item.id), 'quantity': Decimal('1')}],
            reason='Defeito',
            idempotency_key='refund-ret-return',
        )
        refund = create_sale_refund(
            tenant=ctx['tenant'],
            sale=sale,
            method='pix',
            amount=Decimal('15.00'),
            reason='Produto com defeito',
            idempotency_key='refund-ret-key',
            sale_return=sale_return,
        )
        assert refund.sale_return_id == sale_return.id

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_create_sale_refund_idempotent_replay(full_sales_context):
    from sales.services import create_counter_sale, create_sale_refund, open_cash_session

    ctx = full_sales_context

    def _test():
        open_cash_session(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            opening_amount=Decimal('0'),
            idempotency_key='refund-idem-open',
        )
        sale = create_counter_sale(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            stock_location=ctx['location'],
            items=[
                {
                    'product': ctx['product'],
                    'unit': ctx['unit'],
                    'quantity': Decimal('1'),
                    'factor': Decimal('1'),
                }
            ],
            payments=[{'method': 'pix', 'amount': Decimal('15.00')}],
            idempotency_key='refund-idem-sale',
        )
        first = create_sale_refund(
            tenant=ctx['tenant'],
            sale=sale,
            method='pix',
            amount=Decimal('15.00'),
            reason='Devolução ao cliente',
            idempotency_key='refund-idem-key',
        )
        replay = create_sale_refund(
            tenant=ctx['tenant'],
            sale=sale,
            method='pix',
            amount=Decimal('15.00'),
            reason='Devolução ao cliente',
            idempotency_key='refund-idem-key',
        )
        assert replay.id == first.id

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_create_sale_refund_duplicate_idempotency_different_payload(full_sales_context):
    from sales.services import (
        DuplicateIdempotencyKey,
        create_counter_sale,
        create_sale_refund,
        open_cash_session,
    )

    ctx = full_sales_context

    def _test():
        open_cash_session(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            opening_amount=Decimal('0'),
            idempotency_key='refund-dup-open',
        )
        sale = create_counter_sale(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            stock_location=ctx['location'],
            items=[
                {
                    'product': ctx['product'],
                    'unit': ctx['unit'],
                    'quantity': Decimal('2'),
                    'factor': Decimal('1'),
                }
            ],
            payments=[{'method': 'pix', 'amount': Decimal('30.00')}],
            idempotency_key='refund-dup-sale',
        )
        create_sale_refund(
            tenant=ctx['tenant'],
            sale=sale,
            method='pix',
            amount=Decimal('10.00'),
            reason='Devolução ao cliente',
            idempotency_key='refund-dup-key',
        )
        with pytest.raises(DuplicateIdempotencyKey):
            create_sale_refund(
                tenant=ctx['tenant'],
                sale=sale,
                method='pix',
                amount=Decimal('20.00'),
                reason='Devolução ao cliente',
                idempotency_key='refund-dup-key',
            )

    _run_in_tenant(ctx['tenant'], _test)


# ============================================================================
# SALES/SERVICES.PY — cancel_sale
# ============================================================================


@pytest.mark.django_db
def test_cancel_sale_requires_idempotency_key(full_sales_context):
    from sales.models import Sale
    from sales.services import cancel_sale

    ctx = full_sales_context

    def _test():
        sale = Sale.all_objects.filter(tenant=ctx['tenant']).first()
        with pytest.raises(ValueError, match='Idempotency-Key is required'):
            cancel_sale(tenant=ctx['tenant'], sale=sale, reason='X', idempotency_key='')

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_cancel_sale_requires_reason(full_sales_context):
    from sales.models import Sale
    from sales.services import cancel_sale

    ctx = full_sales_context

    def _test():
        sale = Sale.all_objects.filter(tenant=ctx['tenant']).first()
        with pytest.raises(ValueError, match='Reason is required'):
            cancel_sale(
                tenant=ctx['tenant'], sale=sale, reason='', idempotency_key='cancel-noreason'
            )

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_cancel_sale_already_cancelled_raises(full_sales_context):
    from sales.services import (
        SaleAlreadyCancelled,
        cancel_sale,
        create_counter_sale,
        open_cash_session,
    )

    ctx = full_sales_context

    def _test():
        open_cash_session(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            opening_amount=Decimal('0'),
            idempotency_key='cancel-already-open',
        )
        sale = create_counter_sale(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            stock_location=ctx['location'],
            items=[
                {
                    'product': ctx['product'],
                    'unit': ctx['unit'],
                    'quantity': Decimal('1'),
                    'factor': Decimal('1'),
                }
            ],
            payments=[{'method': 'cash', 'amount': Decimal('15.00')}],
            idempotency_key='cancel-already-sale',
        )
        cancel_sale(
            tenant=ctx['tenant'],
            sale=sale,
            reason='Primeiro',
            idempotency_key='cancel-already-key1',
        )
        with pytest.raises(SaleAlreadyCancelled):
            cancel_sale(
                tenant=ctx['tenant'],
                sale=sale,
                reason='Segundo',
                idempotency_key='cancel-already-key2',
            )

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_cancel_sale_happy_path_cash_payment(full_sales_context):
    from sales.models import SaleRefund
    from sales.services import cancel_sale, create_counter_sale, open_cash_session

    ctx = full_sales_context

    def _test():
        open_cash_session(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            opening_amount=Decimal('50.00'),
            idempotency_key='cancel-ok-open',
        )
        sale = create_counter_sale(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            stock_location=ctx['location'],
            items=[
                {
                    'product': ctx['product'],
                    'unit': ctx['unit'],
                    'quantity': Decimal('2'),
                    'factor': Decimal('1'),
                }
            ],
            payments=[{'method': 'cash', 'amount': Decimal('30.00')}],
            idempotency_key='cancel-ok-sale',
        )
        cancellation = cancel_sale(
            tenant=ctx['tenant'],
            sale=sale,
            reason='Cliente desistiu',
            idempotency_key='cancel-ok-key',
            actor=ctx['user'],
        )
        assert cancellation.status == 'completed'
        assert cancellation.reason == 'Cliente desistiu'
        sale.refresh_from_db()
        assert sale.status == 'cancelled'
        assert SaleRefund.all_objects.filter(sale=sale, method='cash').exists()

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_cancel_sale_pix_payment_creates_refund(full_sales_context):
    from sales.models import SaleRefund
    from sales.services import cancel_sale, create_counter_sale, open_cash_session

    ctx = full_sales_context

    def _test():
        open_cash_session(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            opening_amount=Decimal('0'),
            idempotency_key='cancel-pix-open',
        )
        sale = create_counter_sale(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            stock_location=ctx['location'],
            items=[
                {
                    'product': ctx['product'],
                    'unit': ctx['unit'],
                    'quantity': Decimal('1'),
                    'factor': Decimal('1'),
                }
            ],
            payments=[{'method': 'pix', 'amount': Decimal('15.00')}],
            idempotency_key='cancel-pix-sale',
        )
        cancel_sale(
            tenant=ctx['tenant'],
            sale=sale,
            reason='Cancelamento',
            idempotency_key='cancel-pix-key',
        )
        assert SaleRefund.all_objects.filter(
            sale=sale, method='pix', amount=Decimal('15.00')
        ).exists()

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_cancel_sale_idempotent_replay(full_sales_context):
    from sales.services import cancel_sale, create_counter_sale, open_cash_session

    ctx = full_sales_context

    def _test():
        open_cash_session(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            opening_amount=Decimal('0'),
            idempotency_key='cancel-idem-open',
        )
        sale = create_counter_sale(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            stock_location=ctx['location'],
            items=[
                {
                    'product': ctx['product'],
                    'unit': ctx['unit'],
                    'quantity': Decimal('1'),
                    'factor': Decimal('1'),
                }
            ],
            payments=[{'method': 'cash', 'amount': Decimal('15.00')}],
            idempotency_key='cancel-idem-sale',
        )
        first = cancel_sale(
            tenant=ctx['tenant'],
            sale=sale,
            reason='Teste',
            idempotency_key='cancel-idem-key',
        )
        replay = cancel_sale(
            tenant=ctx['tenant'],
            sale=sale,
            reason='Teste',
            idempotency_key='cancel-idem-key',
        )
        assert replay.id == first.id

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_cancel_sale_duplicate_idempotency_different_payload(full_sales_context):
    from sales.services import (
        DuplicateIdempotencyKey,
        cancel_sale,
        create_counter_sale,
        open_cash_session,
    )

    ctx = full_sales_context

    def _test():
        open_cash_session(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            opening_amount=Decimal('0'),
            idempotency_key='cancel-dup-open',
        )
        sale = create_counter_sale(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            operator=ctx['user'],
            stock_location=ctx['location'],
            items=[
                {
                    'product': ctx['product'],
                    'unit': ctx['unit'],
                    'quantity': Decimal('1'),
                    'factor': Decimal('1'),
                }
            ],
            payments=[{'method': 'cash', 'amount': Decimal('15.00')}],
            idempotency_key='cancel-dup-sale',
        )
        cancel_sale(
            tenant=ctx['tenant'],
            sale=sale,
            reason='Primeiro motivo',
            idempotency_key='cancel-dup-key',
        )
        with pytest.raises(DuplicateIdempotencyKey):
            cancel_sale(
                tenant=ctx['tenant'],
                sale=sale,
                reason='Segundo motivo',
                idempotency_key='cancel-dup-key',
            )

    _run_in_tenant(ctx['tenant'], _test)


# ============================================================================
# SALES/SERVICES.PY — helper functions
# ============================================================================


def test_money_rounds_correctly():
    from sales.services import _money

    assert _money('10.555') == Decimal('10.56')
    assert _money('10.554') == Decimal('10.55')
    assert _money('0') == Decimal('0.00')
    assert _money(Decimal('3.14159')) == Decimal('3.14')


def test_json_default_with_id():
    from sales.services import _json_default

    obj = MagicMock()
    obj.id = 'test-id-123'
    assert _json_default(obj) == 'test-id-123'


def test_json_default_with_decimal():
    from sales.services import _json_default

    assert _json_default(Decimal('10.50')) == '10.50'


def test_json_default_with_string():
    from sales.services import _json_default

    assert _json_default('hello') == 'hello'


def test_payload_hash_deterministic():
    from sales.services import _payload_hash

    p = {'a': 1, 'b': 'two'}
    h1 = _payload_hash(p)
    h2 = _payload_hash(p)
    assert h1 == h2
    assert len(h1) == 64


def test_payload_hash_different_for_different_payloads():
    from sales.services import _payload_hash

    assert _payload_hash({'a': 1}) != _payload_hash({'a': 2})


def test_normalize_item():
    from sales.services import _normalize_item

    product = MagicMock()
    unit = MagicMock()
    result = _normalize_item(
        {
            'product': product,
            'unit': unit,
            'quantity': 5,
            'factor': 2,
            'discount_amount': 1.50,
        }
    )
    assert result['product'] == product
    assert result['unit'] == unit
    assert result['quantity'] == Decimal('5')
    assert result['factor'] == Decimal('2')
    assert result['discount_amount'] == Decimal('1.50')


def test_normalize_item_default_factor_and_discount():
    from sales.services import _normalize_item

    product = MagicMock()
    unit = MagicMock()
    result = _normalize_item(
        {
            'product': product,
            'unit': unit,
            'quantity': 3,
        }
    )
    assert result['factor'] == Decimal('1')
    assert result['discount_amount'] == Decimal('0.00')


def test_normalize_payment():
    from sales.services import _normalize_payment

    result = _normalize_payment({'method': 'pix', 'amount': 25.50, 'reference': 'ref-1'})
    assert result['method'] == 'pix'
    assert result['amount'] == Decimal('25.50')
    assert result['reference'] == 'ref-1'


def test_normalize_payment_default_reference():
    from sales.services import _normalize_payment

    result = _normalize_payment({'method': 'cash', 'amount': 10})
    assert result['reference'] == ''


# ============================================================================
# SALES/VIEWS.PY — SaleViewSet
# ============================================================================


@pytest.mark.django_db
def test_sale_list_with_filters(sales_api_ctx):
    ctx = sales_api_ctx
    _post_json(
        ctx['client'],
        '/api/v1/cash-sessions/open/',
        {'branch': str(ctx['branch'].id), 'opening_amount': '0.00'},
        tenant=ctx['tenant'],
        idempotency_key='view-list-open',
    )
    _post_json(
        ctx['client'],
        '/api/v1/sales/counter/',
        {
            'branch': str(ctx['branch'].id),
            'stock_location': str(ctx['location'].id),
            'items': [
                {
                    'product': str(ctx['product'].id),
                    'unit': str(ctx['unit'].id),
                    'quantity': '1.000000',
                    'factor': '1.000000',
                }
            ],
            'payments': [{'method': 'cash', 'amount': '20.00'}],
        },
        tenant=ctx['tenant'],
        idempotency_key='view-list-sale',
    )
    response = ctx['client'].get(
        f'/api/v1/sales/?branch={ctx["branch"].id}&status=confirmed',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    results = response.json()['results']
    assert len(results) >= 1
    assert results[0]['status'] == 'confirmed'


@pytest.mark.django_db
def test_sale_list_filter_by_operator(sales_api_ctx):
    ctx = sales_api_ctx
    _post_json(
        ctx['client'],
        '/api/v1/cash-sessions/open/',
        {'branch': str(ctx['branch'].id), 'opening_amount': '0.00'},
        tenant=ctx['tenant'],
        idempotency_key='view-op-open',
    )
    _post_json(
        ctx['client'],
        '/api/v1/sales/counter/',
        {
            'branch': str(ctx['branch'].id),
            'stock_location': str(ctx['location'].id),
            'items': [
                {
                    'product': str(ctx['product'].id),
                    'unit': str(ctx['unit'].id),
                    'quantity': '1.000000',
                    'factor': '1.000000',
                }
            ],
            'payments': [{'method': 'cash', 'amount': '20.00'}],
        },
        tenant=ctx['tenant'],
        idempotency_key='view-op-sale',
    )
    response = ctx['client'].get(
        f'/api/v1/sales/?operator={ctx["user"].id}',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200


@pytest.mark.django_db
def test_sale_list_filter_by_cash_session(sales_api_ctx):
    ctx = sales_api_ctx
    open_resp = _post_json(
        ctx['client'],
        '/api/v1/cash-sessions/open/',
        {'branch': str(ctx['branch'].id), 'opening_amount': '0.00'},
        tenant=ctx['tenant'],
        idempotency_key='view-cs-open',
    )
    session_id = open_resp.json()['id']
    _post_json(
        ctx['client'],
        '/api/v1/sales/counter/',
        {
            'branch': str(ctx['branch'].id),
            'stock_location': str(ctx['location'].id),
            'items': [
                {
                    'product': str(ctx['product'].id),
                    'unit': str(ctx['unit'].id),
                    'quantity': '1.000000',
                    'factor': '1.000000',
                }
            ],
            'payments': [{'method': 'cash', 'amount': '20.00'}],
        },
        tenant=ctx['tenant'],
        idempotency_key='view-cs-sale',
    )
    response = ctx['client'].get(
        f'/api/v1/sales/?cash_session={session_id}',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    assert len(response.json()['results']) >= 1


@pytest.mark.django_db
def test_sale_retrieve(sales_api_ctx):
    ctx = sales_api_ctx
    _post_json(
        ctx['client'],
        '/api/v1/cash-sessions/open/',
        {'branch': str(ctx['branch'].id), 'opening_amount': '0.00'},
        tenant=ctx['tenant'],
        idempotency_key='view-ret-open',
    )
    create_resp = _post_json(
        ctx['client'],
        '/api/v1/sales/counter/',
        {
            'branch': str(ctx['branch'].id),
            'stock_location': str(ctx['location'].id),
            'items': [
                {
                    'product': str(ctx['product'].id),
                    'unit': str(ctx['unit'].id),
                    'quantity': '1.000000',
                    'factor': '1.000000',
                }
            ],
            'payments': [{'method': 'cash', 'amount': '20.00'}],
        },
        tenant=ctx['tenant'],
        idempotency_key='view-ret-sale',
    )
    sale_id = create_resp.json()['id']
    response = ctx['client'].get(
        f'/api/v1/sales/{sale_id}/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    assert response.json()['id'] == sale_id


@pytest.mark.django_db
def test_sale_counter_creates_sale(sales_api_ctx):
    ctx = sales_api_ctx
    _post_json(
        ctx['client'],
        '/api/v1/cash-sessions/open/',
        {'branch': str(ctx['branch'].id), 'opening_amount': '0.00'},
        tenant=ctx['tenant'],
        idempotency_key='view-cnt-open',
    )
    response = _post_json(
        ctx['client'],
        '/api/v1/sales/counter/',
        {
            'branch': str(ctx['branch'].id),
            'stock_location': str(ctx['location'].id),
            'items': [
                {
                    'product': str(ctx['product'].id),
                    'unit': str(ctx['unit'].id),
                    'quantity': '2.000000',
                    'factor': '1.000000',
                }
            ],
            'payments': [{'method': 'cash', 'amount': '40.00'}],
        },
        tenant=ctx['tenant'],
        idempotency_key='view-cnt-sale',
    )
    assert response.status_code == 201
    assert response.json()['status'] == 'confirmed'


@pytest.mark.django_db
def test_sale_counter_empty_sale_error(sales_api_ctx):
    ctx = sales_api_ctx
    _post_json(
        ctx['client'],
        '/api/v1/cash-sessions/open/',
        {'branch': str(ctx['branch'].id), 'opening_amount': '0.00'},
        tenant=ctx['tenant'],
        idempotency_key='view-emp-open',
    )
    response = _post_json(
        ctx['client'],
        '/api/v1/sales/counter/',
        {
            'branch': str(ctx['branch'].id),
            'stock_location': str(ctx['location'].id),
            'items': [],
            'payments': [{'method': 'cash', 'amount': '0.00'}],
        },
        tenant=ctx['tenant'],
        idempotency_key='view-emp-sale',
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_sale_returns_action(sales_api_ctx):
    ctx = sales_api_ctx
    _post_json(
        ctx['client'],
        '/api/v1/cash-sessions/open/',
        {'branch': str(ctx['branch'].id), 'opening_amount': '0.00'},
        tenant=ctx['tenant'],
        idempotency_key='view-rt-open',
    )
    create_resp = _post_json(
        ctx['client'],
        '/api/v1/sales/counter/',
        {
            'branch': str(ctx['branch'].id),
            'stock_location': str(ctx['location'].id),
            'items': [
                {
                    'product': str(ctx['product'].id),
                    'unit': str(ctx['unit'].id),
                    'quantity': '3.000000',
                    'factor': '1.000000',
                }
            ],
            'payments': [{'method': 'cash', 'amount': '60.00'}],
        },
        tenant=ctx['tenant'],
        idempotency_key='view-rt-sale',
    )
    sale_id = create_resp.json()['id']
    sale_item_id = create_resp.json()['items'][0]['id']

    response = _post_json(
        ctx['client'],
        f'/api/v1/sales/{sale_id}/returns/',
        {'items': [{'sale_item_id': sale_item_id, 'quantity': '1.000000'}], 'reason': 'Defeito'},
        tenant=ctx['tenant'],
        idempotency_key='view-rt-return',
    )
    assert response.status_code == 201
    assert response.json()['status'] == 'completed'


@pytest.mark.django_db
def test_sale_list_returns_action(sales_api_ctx):
    ctx = sales_api_ctx
    _post_json(
        ctx['client'],
        '/api/v1/cash-sessions/open/',
        {'branch': str(ctx['branch'].id), 'opening_amount': '0.00'},
        tenant=ctx['tenant'],
        idempotency_key='view-lrt-open',
    )
    create_resp = _post_json(
        ctx['client'],
        '/api/v1/sales/counter/',
        {
            'branch': str(ctx['branch'].id),
            'stock_location': str(ctx['location'].id),
            'items': [
                {
                    'product': str(ctx['product'].id),
                    'unit': str(ctx['unit'].id),
                    'quantity': '2.000000',
                    'factor': '1.000000',
                }
            ],
            'payments': [{'method': 'cash', 'amount': '40.00'}],
        },
        tenant=ctx['tenant'],
        idempotency_key='view-lrt-sale',
    )
    sale_id = create_resp.json()['id']
    response = ctx['client'].get(
        f'/api/v1/sales/{sale_id}/returns/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200


@pytest.mark.django_db
def test_sale_cancel_action(sales_api_ctx):
    ctx = sales_api_ctx
    _post_json(
        ctx['client'],
        '/api/v1/cash-sessions/open/',
        {'branch': str(ctx['branch'].id), 'opening_amount': '0.00'},
        tenant=ctx['tenant'],
        idempotency_key='view-can-open',
    )
    create_resp = _post_json(
        ctx['client'],
        '/api/v1/sales/counter/',
        {
            'branch': str(ctx['branch'].id),
            'stock_location': str(ctx['location'].id),
            'items': [
                {
                    'product': str(ctx['product'].id),
                    'unit': str(ctx['unit'].id),
                    'quantity': '1.000000',
                    'factor': '1.000000',
                }
            ],
            'payments': [{'method': 'cash', 'amount': '20.00'}],
        },
        tenant=ctx['tenant'],
        idempotency_key='view-can-sale',
    )
    sale_id = create_resp.json()['id']
    response = _post_json(
        ctx['client'],
        f'/api/v1/sales/{sale_id}/cancel/',
        {'reason': 'Cliente desistiu'},
        tenant=ctx['tenant'],
        idempotency_key='view-can-key',
    )
    assert response.status_code == 201
    assert response.json()['status'] == 'completed'


@pytest.mark.django_db
def test_sale_cancel_already_cancelled_returns_409(sales_api_ctx):
    ctx = sales_api_ctx
    _post_json(
        ctx['client'],
        '/api/v1/cash-sessions/open/',
        {'branch': str(ctx['branch'].id), 'opening_amount': '0.00'},
        tenant=ctx['tenant'],
        idempotency_key='view-can2-open',
    )
    create_resp = _post_json(
        ctx['client'],
        '/api/v1/sales/counter/',
        {
            'branch': str(ctx['branch'].id),
            'stock_location': str(ctx['location'].id),
            'items': [
                {
                    'product': str(ctx['product'].id),
                    'unit': str(ctx['unit'].id),
                    'quantity': '1.000000',
                    'factor': '1.000000',
                }
            ],
            'payments': [{'method': 'cash', 'amount': '20.00'}],
        },
        tenant=ctx['tenant'],
        idempotency_key='view-can2-sale',
    )
    sale_id = create_resp.json()['id']
    _post_json(
        ctx['client'],
        f'/api/v1/sales/{sale_id}/cancel/',
        {'reason': 'Primeiro'},
        tenant=ctx['tenant'],
        idempotency_key='view-can2-key1',
    )
    response = _post_json(
        ctx['client'],
        f'/api/v1/sales/{sale_id}/cancel/',
        {'reason': 'Segundo'},
        tenant=ctx['tenant'],
        idempotency_key='view-can2-key2',
    )
    assert response.status_code == 409


@pytest.mark.django_db
def test_sale_returns_insufficient_quantity_error(sales_api_ctx):
    ctx = sales_api_ctx
    _post_json(
        ctx['client'],
        '/api/v1/cash-sessions/open/',
        {'branch': str(ctx['branch'].id), 'opening_amount': '0.00'},
        tenant=ctx['tenant'],
        idempotency_key='view-rti-open',
    )
    create_resp = _post_json(
        ctx['client'],
        '/api/v1/sales/counter/',
        {
            'branch': str(ctx['branch'].id),
            'stock_location': str(ctx['location'].id),
            'items': [
                {
                    'product': str(ctx['product'].id),
                    'unit': str(ctx['unit'].id),
                    'quantity': '1.000000',
                    'factor': '1.000000',
                }
            ],
            'payments': [{'method': 'cash', 'amount': '20.00'}],
        },
        tenant=ctx['tenant'],
        idempotency_key='view-rti-sale',
    )
    sale_id = create_resp.json()['id']
    sale_item_id = create_resp.json()['items'][0]['id']

    response = _post_json(
        ctx['client'],
        f'/api/v1/sales/{sale_id}/returns/',
        {'items': [{'sale_item_id': sale_item_id, 'quantity': '5.000000'}], 'reason': 'Excesso'},
        tenant=ctx['tenant'],
        idempotency_key='view-rti-return',
    )
    assert response.status_code == 409


@pytest.mark.django_db
def test_sale_export_csv(sales_api_ctx):
    ctx = sales_api_ctx
    _post_json(
        ctx['client'],
        '/api/v1/cash-sessions/open/',
        {'branch': str(ctx['branch'].id), 'opening_amount': '0.00'},
        tenant=ctx['tenant'],
        idempotency_key='view-exp-open',
    )
    _post_json(
        ctx['client'],
        '/api/v1/sales/counter/',
        {
            'branch': str(ctx['branch'].id),
            'stock_location': str(ctx['location'].id),
            'items': [
                {
                    'product': str(ctx['product'].id),
                    'unit': str(ctx['unit'].id),
                    'quantity': '1.000000',
                    'factor': '1.000000',
                }
            ],
            'payments': [{'method': 'cash', 'amount': '20.00'}],
        },
        tenant=ctx['tenant'],
        idempotency_key='view-exp-sale',
    )
    response = ctx['client'].get(
        '/api/v1/sales/export/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    assert response['Content-Type'] == 'text/csv'
    content = response.content.decode()
    assert 'id' in content
    assert 'created_at' in content


@pytest.mark.django_db
def test_sale_export_with_date_filters(sales_api_ctx):
    ctx = sales_api_ctx
    response = ctx['client'].get(
        f'/api/v1/sales/export/?date_from=2020-01-01&date_to=2030-12-31&branch={ctx["branch"].id}',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200


# ============================================================================
# SALES/VIEWS.PY — CashSessionViewSet
# ============================================================================


@pytest.mark.django_db
def test_cash_session_list(sales_api_ctx):
    ctx = sales_api_ctx
    _post_json(
        ctx['client'],
        '/api/v1/cash-sessions/open/',
        {'branch': str(ctx['branch'].id), 'opening_amount': '10.00'},
        tenant=ctx['tenant'],
        idempotency_key='cs-list-open',
    )
    response = ctx['client'].get(
        '/api/v1/cash-sessions/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200


@pytest.mark.django_db
def test_cash_session_list_with_branch_filter(sales_api_ctx):
    ctx = sales_api_ctx
    _post_json(
        ctx['client'],
        '/api/v1/cash-sessions/open/',
        {'branch': str(ctx['branch'].id), 'opening_amount': '5.00'},
        tenant=ctx['tenant'],
        idempotency_key='cs-br-open',
    )
    response = ctx['client'].get(
        f'/api/v1/cash-sessions/?branch={ctx["branch"].id}',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200


@pytest.mark.django_db
def test_cash_session_list_with_operator_filter(sales_api_ctx):
    ctx = sales_api_ctx
    _post_json(
        ctx['client'],
        '/api/v1/cash-sessions/open/',
        {'branch': str(ctx['branch'].id), 'opening_amount': '5.00'},
        tenant=ctx['tenant'],
        idempotency_key='cs-op-open',
    )
    response = ctx['client'].get(
        f'/api/v1/cash-sessions/?operator={ctx["user"].id}',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200


@pytest.mark.django_db
def test_cash_session_list_with_date_filters(sales_api_ctx):
    ctx = sales_api_ctx
    _post_json(
        ctx['client'],
        '/api/v1/cash-sessions/open/',
        {'branch': str(ctx['branch'].id), 'opening_amount': '5.00'},
        tenant=ctx['tenant'],
        idempotency_key='cs-date-open',
    )
    response = ctx['client'].get(
        '/api/v1/cash-sessions/?date_from=2020-01-01&date_to=2030-12-31',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200


@pytest.mark.django_db
def test_cash_session_retrieve(sales_api_ctx):
    ctx = sales_api_ctx
    open_resp = _post_json(
        ctx['client'],
        '/api/v1/cash-sessions/open/',
        {'branch': str(ctx['branch'].id), 'opening_amount': '10.00'},
        tenant=ctx['tenant'],
        idempotency_key='cs-ret-open',
    )
    session_id = open_resp.json()['id']
    response = ctx['client'].get(
        f'/api/v1/cash-sessions/{session_id}/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    assert response.json()['id'] == session_id


@pytest.mark.django_db
def test_cash_session_current_without_branch_param(sales_api_ctx):
    ctx = sales_api_ctx
    response = ctx['client'].get(
        '/api/v1/cash-sessions/current/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_cash_session_current_not_found(sales_api_ctx):
    ctx = sales_api_ctx
    response = ctx['client'].get(
        '/api/v1/cash-sessions/current/?branch=' + str(uuid.uuid4()),
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 404


@pytest.mark.django_db
def test_cash_session_open_error_missing_idempotency(sales_api_ctx):
    ctx = sales_api_ctx
    response = ctx['client'].post(
        '/api/v1/cash-sessions/open/',
        data=json.dumps({'branch': str(ctx['branch'].id), 'opening_amount': '10.00'}),
        content_type='application/json',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code in (400, 403)


@pytest.mark.django_db
def test_cash_session_open_duplicate_idempotency(sales_api_ctx):
    ctx = sales_api_ctx
    _post_json(
        ctx['client'],
        '/api/v1/cash-sessions/open/',
        {'branch': str(ctx['branch'].id), 'opening_amount': '10.00'},
        tenant=ctx['tenant'],
        idempotency_key='cs-dup-open',
    )
    response = _post_json(
        ctx['client'],
        '/api/v1/cash-sessions/open/',
        {'branch': str(ctx['branch'].id), 'opening_amount': '20.00'},
        tenant=ctx['tenant'],
        idempotency_key='cs-dup-open',
    )
    assert response.status_code == 409


@pytest.mark.django_db
def test_cash_session_open_already_exists(sales_api_ctx):
    ctx = sales_api_ctx
    _post_json(
        ctx['client'],
        '/api/v1/cash-sessions/open/',
        {'branch': str(ctx['branch'].id), 'opening_amount': '5.00'},
        tenant=ctx['tenant'],
        idempotency_key='cs-ae-open1',
    )
    response = _post_json(
        ctx['client'],
        '/api/v1/cash-sessions/open/',
        {'branch': str(ctx['branch'].id), 'opening_amount': '5.00'},
        tenant=ctx['tenant'],
        idempotency_key='cs-ae-open2',
    )
    assert response.status_code == 409


@pytest.mark.django_db
def test_cash_session_close_idempotency_replay(sales_api_ctx):
    ctx = sales_api_ctx
    open_resp = _post_json(
        ctx['client'],
        '/api/v1/cash-sessions/open/',
        {'branch': str(ctx['branch'].id), 'opening_amount': '10.00'},
        tenant=ctx['tenant'],
        idempotency_key='cs-close-idem-open',
    )
    session_id = open_resp.json()['id']
    _post_json(
        ctx['client'],
        f'/api/v1/cash-sessions/{session_id}/close/',
        {'closing_amount': '10.00'},
        tenant=ctx['tenant'],
        idempotency_key='cs-close-idem-key',
    )
    response = _post_json(
        ctx['client'],
        f'/api/v1/cash-sessions/{session_id}/close/',
        {'closing_amount': '10.00'},
        tenant=ctx['tenant'],
        idempotency_key='cs-close-idem-key',
    )
    assert response.status_code == 200
    assert response.json()['status'] == 'closed'


@pytest.mark.django_db
def test_cash_session_get_permissions_mfa_required_for_open(sales_api_ctx):
    ctx = sales_api_ctx
    session = ctx['client'].session
    del session['mfa_tenant_id']
    del session['mfa_method']
    session.save()
    response = _post_json(
        ctx['client'],
        '/api/v1/cash-sessions/open/',
        {'branch': str(ctx['branch'].id), 'opening_amount': '5.00'},
        tenant=ctx['tenant'],
        idempotency_key='cs-mfa-open',
    )
    assert response.status_code in (400, 403)


# ============================================================================
# SALES/VIEWS.PY — SyncBatchView
# ============================================================================


@pytest.mark.django_db
def test_sync_batch_sale_create(sales_api_ctx):
    ctx = sales_api_ctx
    _post_json(
        ctx['client'],
        '/api/v1/cash-sessions/open/',
        {'branch': str(ctx['branch'].id), 'opening_amount': '0.00'},
        tenant=ctx['tenant'],
        idempotency_key='batch-open',
    )
    response = _post_json(
        ctx['client'],
        '/api/v1/sync/batch/',
        {
            'operations': [
                {
                    'type': 'sale:create',
                    'payload': {
                        'branch': str(ctx['branch'].id),
                        'stock_location': str(ctx['location'].id),
                        'items': [
                            {
                                'product': str(ctx['product'].id),
                                'unit': str(ctx['unit'].id),
                                'quantity': '1.000000',
                                'factor': '1.000000',
                            }
                        ],
                        'payments': [{'method': 'cash', 'amount': '20.00'}],
                    },
                    'idempotency_key': 'batch-sale-key',
                }
            ]
        },
        tenant=ctx['tenant'],
        idempotency_key='batch-main-key',
    )
    assert response.status_code == 200
    results = response.json()['results']
    assert results[0]['status'] == 'synced'


@pytest.mark.django_db
def test_sync_batch_cash_session_open(sales_api_ctx):
    ctx = sales_api_ctx
    response = _post_json(
        ctx['client'],
        '/api/v1/sync/batch/',
        {
            'operations': [
                {
                    'type': 'cash-session:open',
                    'payload': {'branch': str(ctx['branch'].id), 'opening_amount': '50.00'},
                    'idempotency_key': 'batch-cs-open',
                }
            ]
        },
        tenant=ctx['tenant'],
        idempotency_key='batch-cs-main',
    )
    assert response.status_code == 200
    assert response.json()['results'][0]['status'] == 'synced'


@pytest.mark.django_db
def test_sync_batch_cash_session_close(sales_api_ctx):
    ctx = sales_api_ctx
    open_resp = _post_json(
        ctx['client'],
        '/api/v1/cash-sessions/open/',
        {'branch': str(ctx['branch'].id), 'opening_amount': '10.00'},
        tenant=ctx['tenant'],
        idempotency_key='batch-close-open',
    )
    session_id = open_resp.json()['id']
    response = _post_json(
        ctx['client'],
        '/api/v1/sync/batch/',
        {
            'operations': [
                {
                    'type': 'cash-session:close',
                    'payload': {'session_id': session_id, 'closing_amount': '10.00'},
                    'idempotency_key': 'batch-cs-close',
                }
            ]
        },
        tenant=ctx['tenant'],
        idempotency_key='batch-close-main',
    )
    assert response.status_code == 200
    assert response.json()['results'][0]['status'] == 'synced'


@pytest.mark.django_db
def test_sync_batch_unknown_type_rejected_by_serializer(sales_api_ctx):
    ctx = sales_api_ctx
    response = _post_json(
        ctx['client'],
        '/api/v1/sync/batch/',
        {
            'operations': [
                {
                    'type': 'unknown:operation',
                    'payload': {'invalid': True},
                    'idempotency_key': 'batch-unk',
                }
            ]
        },
        tenant=ctx['tenant'],
        idempotency_key='batch-unk-main',
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_sync_batch_cash_session_close_missing_session_id(sales_api_ctx):
    ctx = sales_api_ctx
    response = _post_json(
        ctx['client'],
        '/api/v1/sync/batch/',
        {
            'operations': [
                {
                    'type': 'cash-session:close',
                    'payload': {'closing_amount': '10.00'},
                    'idempotency_key': 'batch-ve',
                }
            ]
        },
        tenant=ctx['tenant'],
        idempotency_key='batch-ve-main',
    )
    assert response.status_code == 200
    results = response.json()['results']
    assert results[0]['status'] == 'failed'


@pytest.mark.django_db
def test_sync_batch_conflict_catch(sales_api_ctx):
    ctx = sales_api_ctx
    _post_json(
        ctx['client'],
        '/api/v1/cash-sessions/open/',
        {'branch': str(ctx['branch'].id), 'opening_amount': '0.00'},
        tenant=ctx['tenant'],
        idempotency_key='batch-conflict-open',
    )
    _post_json(
        ctx['client'],
        '/api/v1/sync/batch/',
        {
            'operations': [
                {
                    'type': 'cash-session:open',
                    'payload': {'branch': str(ctx['branch'].id), 'opening_amount': '0.00'},
                    'idempotency_key': 'batch-conflict-op',
                }
            ]
        },
        tenant=ctx['tenant'],
        idempotency_key='batch-conflict-main1',
    )
    response = _post_json(
        ctx['client'],
        '/api/v1/sync/batch/',
        {
            'operations': [
                {
                    'type': 'cash-session:open',
                    'payload': {'branch': str(ctx['branch'].id), 'opening_amount': '0.00'},
                    'idempotency_key': 'batch-conflict-op',
                }
            ]
        },
        tenant=ctx['tenant'],
        idempotency_key='batch-conflict-main2',
    )
    assert response.status_code == 200
    assert response.json()['results'][0]['status'] == 'conflict'


# ============================================================================
# TENANCY/PERMISSIONS.PY — HasActiveTenant
# ============================================================================


@pytest.mark.django_db
def test_has_active_tenant_no_tenant_denied():
    from tenancy.permissions import HasActiveTenant

    perm = HasActiveTenant()
    request = MagicMock()
    request.tenant = None
    assert perm.has_permission(request, MagicMock()) is False


@pytest.mark.django_db
def test_has_active_tenant_with_tenant_allowed():
    from tenancy.permissions import HasActiveTenant

    perm = HasActiveTenant()
    request = MagicMock()
    request.tenant = MagicMock()
    assert perm.has_permission(request, MagicMock()) is True


# ============================================================================
# TENANCY/PERMISSIONS.PY — HasVerifiedMFA
# ============================================================================


@pytest.mark.django_db
def test_has_verified_mfa_no_auth_token_no_tenant():
    from tenancy.permissions import HasVerifiedMFA

    perm = HasVerifiedMFA()
    request = MagicMock()
    request.auth = None
    request.tenant = None
    assert perm.has_permission(request, MagicMock()) is True


@pytest.mark.django_db
def test_has_verified_mfa_auth_with_device_id():
    from tenancy.permissions import HasVerifiedMFA

    perm = HasVerifiedMFA()
    request = MagicMock()
    request.auth = {'device_id': 'some-device'}
    request.tenant = MagicMock()
    assert perm.has_permission(request, MagicMock()) is True


@pytest.mark.django_db
def test_has_verified_mfa_no_membership():
    from tenancy.permissions import HasVerifiedMFA

    perm = HasVerifiedMFA()
    tenant = Tenant.objects.create(name='MFA Tenant', slug='mfa-tenant')
    user = User.objects.create_user(email='mfa-no-member@test.local', password='pass123')
    request = MagicMock()
    request.auth = None
    request.user = user
    request.tenant = tenant
    assert perm.has_permission(request, MagicMock()) is False


@pytest.mark.django_db
def test_has_verified_mfa_non_admin_role():
    from tenancy.permissions import HasVerifiedMFA

    perm = HasVerifiedMFA()
    tenant = Tenant.objects.create(name='MFA NonAdmin', slug='mfa-nonadmin')
    user = User.objects.create_user(email='mfa-nonadmin@test.local', password='pass123')
    TenantMembership.objects.create(user=user, tenant=tenant, role='operator', is_active=True)
    request = MagicMock()
    request.auth = None
    request.user = user
    request.tenant = tenant
    assert perm.has_permission(request, MagicMock()) is True


@pytest.mark.django_db
def test_has_verified_mfa_admin_without_mfa_denied():
    from tenancy.permissions import HasVerifiedMFA

    perm = HasVerifiedMFA()
    tenant = Tenant.objects.create(name='MFA Admin', slug='mfa-admin')
    user = User.objects.create_user(email='mfa-admin@test.local', password='pass123')
    TenantMembership.objects.create(user=user, tenant=tenant, role='admin', is_active=True)
    request = MagicMock()
    request.auth = None
    request.user = user
    request.tenant = tenant
    request.session = {}
    assert perm.has_permission(request, MagicMock()) is False


@pytest.mark.django_db
def test_has_verified_mfa_admin_with_correct_mfa():
    from tenancy.permissions import HasVerifiedMFA

    perm = HasVerifiedMFA()
    tenant = Tenant.objects.create(name='MFA Admin OK', slug='mfa-admin-ok')
    user = User.objects.create_user(email='mfa-admin-ok@test.local', password='pass123')
    TenantMembership.objects.create(user=user, tenant=tenant, role='admin', is_active=True)
    request = MagicMock()
    request.auth = None
    request.user = user
    request.tenant = tenant
    request.session = {'mfa_tenant_id': str(tenant.id), 'mfa_method': 'totp'}
    assert perm.has_permission(request, MagicMock()) is True


@pytest.mark.django_db
def test_has_verified_mfa_admin_wrong_tenant():
    from tenancy.permissions import HasVerifiedMFA

    perm = HasVerifiedMFA()
    tenant = Tenant.objects.create(name='MFA WrongT', slug='mfa-wrongt')
    user = User.objects.create_user(email='mfa-wrongt@test.local', password='pass123')
    TenantMembership.objects.create(user=user, tenant=tenant, role='admin', is_active=True)
    request = MagicMock()
    request.auth = None
    request.user = user
    request.tenant = tenant
    request.session = {'mfa_tenant_id': str(uuid.uuid4()), 'mfa_method': 'totp'}
    assert perm.has_permission(request, MagicMock()) is False


@pytest.mark.django_db
def test_has_verified_mfa_admin_wrong_method():
    from tenancy.permissions import HasVerifiedMFA

    perm = HasVerifiedMFA()
    tenant = Tenant.objects.create(name='MFA WrongM', slug='mfa-wrongm')
    user = User.objects.create_user(email='mfa-wrongm@test.local', password='pass123')
    TenantMembership.objects.create(user=user, tenant=tenant, role='admin', is_active=True)
    request = MagicMock()
    request.auth = None
    request.user = user
    request.tenant = tenant
    request.session = {'mfa_tenant_id': str(tenant.id), 'mfa_method': 'sms'}
    assert perm.has_permission(request, MagicMock()) is False


@pytest.mark.django_db
def test_has_verified_mfa_admin_recovery_method():
    from tenancy.permissions import HasVerifiedMFA

    perm = HasVerifiedMFA()
    tenant = Tenant.objects.create(name='MFA Recovery', slug='mfa-recovery')
    user = User.objects.create_user(email='mfa-recovery@test.local', password='pass123')
    TenantMembership.objects.create(user=user, tenant=tenant, role='admin', is_active=True)
    request = MagicMock()
    request.auth = None
    request.user = user
    request.tenant = tenant
    request.session = {'mfa_tenant_id': str(tenant.id), 'mfa_method': 'recovery'}
    assert perm.has_permission(request, MagicMock()) is True


@pytest.mark.django_db
def test_has_verified_mfa_admin_email_method():
    from tenancy.permissions import HasVerifiedMFA

    perm = HasVerifiedMFA()
    tenant = Tenant.objects.create(name='MFA Email', slug='mfa-email')
    user = User.objects.create_user(email='mfa-email@test.local', password='pass123')
    TenantMembership.objects.create(user=user, tenant=tenant, role='admin', is_active=True)
    request = MagicMock()
    request.auth = None
    request.user = user
    request.tenant = tenant
    request.session = {'mfa_tenant_id': str(tenant.id), 'mfa_method': 'email'}
    assert perm.has_permission(request, MagicMock()) is True


@pytest.mark.django_db
def test_has_verified_mfa_admin_no_session_keys():
    from tenancy.permissions import HasVerifiedMFA

    perm = HasVerifiedMFA()
    tenant = Tenant.objects.create(name='MFA NoSess', slug='mfa-nosess')
    user = User.objects.create_user(email='mfa-nosess@test.local', password='pass123')
    TenantMembership.objects.create(user=user, tenant=tenant, role='admin', is_active=True)
    request = MagicMock()
    request.auth = None
    request.user = user
    request.tenant = tenant
    request.session = {}
    assert perm.has_permission(request, MagicMock()) is False


# ============================================================================
# TENANCY/PERMISSIONS.PY — HasCapability
# ============================================================================


@pytest.mark.django_db
def test_has_capability_no_tenant_denied():
    from tenancy.permissions import HasCapability

    perm = HasCapability()
    view = MagicMock()
    view.required_capability = 'sales.view'
    request = MagicMock()
    request.tenant = None
    request.user = MagicMock(is_authenticated=True)
    assert perm.has_permission(request, view) is False


@pytest.mark.django_db
def test_has_capability_no_user():
    from tenancy.permissions import HasCapability

    perm = HasCapability()
    view = MagicMock()
    view.required_capability = 'sales.view'
    request = MagicMock()
    request.tenant = MagicMock()
    request.user = MagicMock(is_authenticated=False)
    assert perm.has_permission(request, view) is False


@pytest.mark.django_db
def test_has_capability_no_required_capability():
    from tenancy.permissions import HasCapability

    perm = HasCapability()
    view = MagicMock()
    view.required_capability = None
    request = MagicMock()
    request.tenant = MagicMock()
    request.user = MagicMock(is_authenticated=True)
    assert perm.has_permission(request, view) is True


@pytest.mark.django_db
def test_has_capability_no_membership_denied():
    from tenancy.permissions import HasCapability

    perm = HasCapability()
    tenant = Tenant.objects.create(name='Cap Tenant', slug='cap-tenant')
    user = User.objects.create_user(email='cap-nomem@test.local', password='pass123')
    view = MagicMock()
    view.required_capability = 'sales.view'
    request = MagicMock()
    request.tenant = tenant
    request.user = user
    assert perm.has_permission(request, view) is False


@pytest.mark.django_db
def test_has_capability_admin_has_sales_view():
    from tenancy.permissions import HasCapability

    perm = HasCapability()
    tenant = Tenant.objects.create(name='Cap Admin', slug='cap-admin')
    user = User.objects.create_user(email='cap-admin@test.local', password='pass123')
    TenantMembership.objects.create(user=user, tenant=tenant, role='admin', is_active=True)
    view = MagicMock()
    view.required_capability = 'sales.view'
    request = MagicMock()
    request.tenant = tenant
    request.user = user
    assert perm.has_permission(request, view) is True


@pytest.mark.django_db
def test_has_capability_operator_no_fiscal_manage():
    from tenancy.permissions import HasCapability

    perm = HasCapability()
    tenant = Tenant.objects.create(name='Cap Op', slug='cap-op')
    user = User.objects.create_user(email='cap-op@test.local', password='pass123')
    TenantMembership.objects.create(user=user, tenant=tenant, role='operator', is_active=True)
    view = MagicMock()
    view.required_capability = 'fiscal.manage'
    request = MagicMock()
    request.tenant = tenant
    request.user = user
    assert perm.has_permission(request, view) is False


@pytest.mark.django_db
def test_has_capability_operator_has_sales_sell():
    from tenancy.permissions import HasCapability

    perm = HasCapability()
    tenant = Tenant.objects.create(name='Cap OpSell', slug='cap-opsell')
    user = User.objects.create_user(email='cap-opsell@test.local', password='pass123')
    TenantMembership.objects.create(user=user, tenant=tenant, role='operator', is_active=True)
    view = MagicMock()
    view.required_capability = 'sales.sell'
    request = MagicMock()
    request.tenant = tenant
    request.user = user
    assert perm.has_permission(request, view) is True


@pytest.mark.django_db
def test_has_capability_unknown_role_denied():
    from tenancy.permissions import HasCapability

    perm = HasCapability()
    tenant = Tenant.objects.create(name='Cap Unknown', slug='cap-unknown')
    user = User.objects.create_user(email='cap-unknown@test.local', password='pass123')
    TenantMembership.objects.create(user=user, tenant=tenant, role='unknown_role', is_active=True)
    view = MagicMock()
    view.required_capability = 'sales.view'
    request = MagicMock()
    request.tenant = tenant
    request.user = user
    assert perm.has_permission(request, view) is False


@pytest.mark.django_db
def test_has_capability_manager_has_catalog_manage():
    from tenancy.permissions import HasCapability

    perm = HasCapability()
    tenant = Tenant.objects.create(name='Cap Mgr', slug='cap-mgr')
    user = User.objects.create_user(email='cap-mgr@test.local', password='pass123')
    TenantMembership.objects.create(user=user, tenant=tenant, role='manager', is_active=True)
    view = MagicMock()
    view.required_capability = 'catalog.manage'
    request = MagicMock()
    request.tenant = tenant
    request.user = user
    assert perm.has_permission(request, view) is True


# ============================================================================
# SALES/VIEWS.PY — _handle_sales_error branches
# ============================================================================


@pytest.mark.django_db
def test_sale_viewset_handle_object_not_found(sales_api_ctx):
    ctx = sales_api_ctx
    fake_id = str(uuid.uuid4())
    response = ctx['client'].get(
        f'/api/v1/sales/{fake_id}/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 404


@pytest.mark.django_db
def test_cash_session_viewset_handle_object_not_found(sales_api_ctx):
    ctx = sales_api_ctx
    fake_id = str(uuid.uuid4())
    response = ctx['client'].get(
        f'/api/v1/cash-sessions/{fake_id}/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 404


@pytest.mark.django_db
def test_sale_counter_idempotency_conflict_via_api(sales_api_ctx):
    ctx = sales_api_ctx
    _post_json(
        ctx['client'],
        '/api/v1/cash-sessions/open/',
        {'branch': str(ctx['branch'].id), 'opening_amount': '0.00'},
        tenant=ctx['tenant'],
        idempotency_key='err-idem-open',
    )
    _post_json(
        ctx['client'],
        '/api/v1/sales/counter/',
        {
            'branch': str(ctx['branch'].id),
            'stock_location': str(ctx['location'].id),
            'items': [
                {
                    'product': str(ctx['product'].id),
                    'unit': str(ctx['unit'].id),
                    'quantity': '1.000000',
                    'factor': '1.000000',
                }
            ],
            'payments': [{'method': 'cash', 'amount': '20.00'}],
        },
        tenant=ctx['tenant'],
        idempotency_key='err-idem-sale',
    )
    response = _post_json(
        ctx['client'],
        '/api/v1/sales/counter/',
        {
            'branch': str(ctx['branch'].id),
            'stock_location': str(ctx['location'].id),
            'items': [
                {
                    'product': str(ctx['product'].id),
                    'unit': str(ctx['unit'].id),
                    'quantity': '1.000000',
                    'factor': '1.000000',
                }
            ],
            'payments': [{'method': 'cash', 'amount': '25.00'}],
        },
        tenant=ctx['tenant'],
        idempotency_key='err-idem-sale',
    )
    assert response.status_code == 409


@pytest.mark.django_db
def test_sale_counter_no_cash_session_error(sales_api_ctx):
    ctx = sales_api_ctx
    response = _post_json(
        ctx['client'],
        '/api/v1/sales/counter/',
        {
            'branch': str(ctx['branch'].id),
            'stock_location': str(ctx['location'].id),
            'items': [
                {
                    'product': str(ctx['product'].id),
                    'unit': str(ctx['unit'].id),
                    'quantity': '1.000000',
                    'factor': '1.000000',
                }
            ],
            'payments': [{'method': 'cash', 'amount': '20.00'}],
        },
        tenant=ctx['tenant'],
        idempotency_key='err-nocs-sale',
    )
    assert response.status_code == 409
    assert response.json()['type'].endswith('/cash_session_required')


@pytest.mark.django_db
def test_sale_returns_sale_already_cancelled_error(sales_api_ctx):
    ctx = sales_api_ctx
    _post_json(
        ctx['client'],
        '/api/v1/cash-sessions/open/',
        {'branch': str(ctx['branch'].id), 'opening_amount': '0.00'},
        tenant=ctx['tenant'],
        idempotency_key='err-alrc-open',
    )
    create_resp = _post_json(
        ctx['client'],
        '/api/v1/sales/counter/',
        {
            'branch': str(ctx['branch'].id),
            'stock_location': str(ctx['location'].id),
            'items': [
                {
                    'product': str(ctx['product'].id),
                    'unit': str(ctx['unit'].id),
                    'quantity': '1.000000',
                    'factor': '1.000000',
                }
            ],
            'payments': [{'method': 'cash', 'amount': '20.00'}],
        },
        tenant=ctx['tenant'],
        idempotency_key='err-alrc-sale',
    )
    sale_id = create_resp.json()['id']
    _post_json(
        ctx['client'],
        f'/api/v1/sales/{sale_id}/cancel/',
        {'reason': 'Cancelado'},
        tenant=ctx['tenant'],
        idempotency_key='err-alrc-cancel',
    )
    response = _post_json(
        ctx['client'],
        f'/api/v1/sales/{sale_id}/cancel/',
        {'reason': 'Outro'},
        tenant=ctx['tenant'],
        idempotency_key='err-alrc-cancel2',
    )
    assert response.status_code == 409
    assert response.json()['type'].endswith('/sale_already_cancelled')


@pytest.mark.django_db
def test_sale_viewset_get_permissions_counter_action(sales_api_ctx):
    ctx = sales_api_ctx
    from sales.views import SaleViewSet

    view = SaleViewSet()
    view.action = 'counter'
    request = MagicMock()
    request.user = ctx['user']
    request.tenant = ctx['tenant']
    perms = view.get_permissions()
    perm_types = [type(p).__name__ for p in perms]
    assert 'HasVerifiedMFA' in perm_types


@pytest.mark.django_db
def test_cash_session_viewset_get_permissions(sales_api_ctx):
    ctx = sales_api_ctx
    from sales.views import CashSessionViewSet

    view = CashSessionViewSet()
    view.action = 'open'
    request = MagicMock()
    request.user = ctx['user']
    request.tenant = ctx['tenant']
    perms = view.get_permissions()
    perm_types = [type(p).__name__ for p in perms]
    assert 'HasVerifiedMFA' in perm_types


@pytest.mark.django_db
def test_sale_returns_cross_tenant_error(sales_api_ctx):
    ctx = sales_api_ctx
    fake_sale_id = str(uuid.uuid4())
    response = ctx['client'].get(
        f'/api/v1/sales/{fake_sale_id}/returns/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 404


@pytest.mark.django_db
def test_sale_cancel_invalid_sale(sales_api_ctx):
    ctx = sales_api_ctx
    fake_sale_id = str(uuid.uuid4())
    response = _post_json(
        ctx['client'],
        f'/api/v1/sales/{fake_sale_id}/cancel/',
        {'reason': 'Teste'},
        tenant=ctx['tenant'],
        idempotency_key='cancel-invalid',
    )
    assert response.status_code == 404


@pytest.mark.django_db
def test_cash_session_close_via_api(sales_api_ctx):
    ctx = sales_api_ctx
    open_resp = _post_json(
        ctx['client'],
        '/api/v1/cash-sessions/open/',
        {'branch': str(ctx['branch'].id), 'opening_amount': '10.00'},
        tenant=ctx['tenant'],
        idempotency_key='cs-closeapi-open',
    )
    session_id = open_resp.json()['id']
    close_resp = _post_json(
        ctx['client'],
        f'/api/v1/cash-sessions/{session_id}/close/',
        {'closing_amount': '10.00'},
        tenant=ctx['tenant'],
        idempotency_key='cs-closeapi-close',
    )
    assert close_resp.status_code == 200
    assert close_resp.json()['status'] == 'closed'


@pytest.mark.django_db
def test_sale_counter_missing_header(sales_api_ctx):
    ctx = sales_api_ctx
    response = ctx['client'].post(
        '/api/v1/sales/counter/',
        data=json.dumps({}),
        content_type='application/json',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code in (400, 403)


@pytest.mark.django_db
def test_sale_returns_insufficient_returnable_quantity_via_api(sales_api_ctx):
    ctx = sales_api_ctx
    _post_json(
        ctx['client'],
        '/api/v1/cash-sessions/open/',
        {'branch': str(ctx['branch'].id), 'opening_amount': '0.00'},
        tenant=ctx['tenant'],
        idempotency_key='ret-insufapi-open',
    )
    create_resp = _post_json(
        ctx['client'],
        '/api/v1/sales/counter/',
        {
            'branch': str(ctx['branch'].id),
            'stock_location': str(ctx['location'].id),
            'items': [
                {
                    'product': str(ctx['product'].id),
                    'unit': str(ctx['unit'].id),
                    'quantity': '1.000000',
                    'factor': '1.000000',
                }
            ],
            'payments': [{'method': 'cash', 'amount': '20.00'}],
        },
        tenant=ctx['tenant'],
        idempotency_key='ret-insufapi-sale',
    )
    sale_id = create_resp.json()['id']
    sale_item_id = create_resp.json()['items'][0]['id']

    response = _post_json(
        ctx['client'],
        f'/api/v1/sales/{sale_id}/returns/',
        {'items': [{'sale_item_id': sale_item_id, 'quantity': '99.000000'}], 'reason': 'Excesso'},
        tenant=ctx['tenant'],
        idempotency_key='ret-insufapi-ret',
    )
    assert response.status_code == 409
    assert response.json()['type'].endswith('/insufficient_returnable')
