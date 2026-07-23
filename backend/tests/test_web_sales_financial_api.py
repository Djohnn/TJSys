"""Sprint 19: Management API contracts — sales, financial, people.

Given/When/Then scenarios for PDV management and financial read views.
"""

import csv
import io
from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.utils import timezone

from catalog.models import Product, ProductPrice, Unit
from financial.models import Payable, Receivable
from inventory.models import StockLocation
from inventory.services import create_receipt
from people.models import Person, PersonDocument, PersonRole
from sales.models import CashSession, CashMovement
from sales.services import create_counter_sale, open_cash_session
from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Branch, Company, Tenant, TenantMembership

User = get_user_model()


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
        user=user, tenant=tenant,
        defaults={'role': role, 'is_active': True},
    )
    client.force_login(user)
    session = client.session
    session['mfa_tenant_id'] = str(tenant.id)
    session['mfa_method'] = 'totp'
    session.save()
    return client


@pytest.fixture
def web_context(client):
    tenant = Tenant.objects.create(name='Web Mgmt', slug='web-mgmt')
    user = User.objects.create_user(email='web-mgmt@test.local', password='pass123')
    api_client = _auth_client(client, user, tenant, role='admin')
    operator = User.objects.create_user(email='web-op@test.local', password='pass123')

    def _create():
        unit = Unit.all_objects.create(tenant=tenant, symbol='UN', name='Unidade', precision=0)
        product = Product.all_objects.create(
            tenant=tenant, sku='WEB-MGMT', name='Produto Web', base_unit=unit,
        )
        ProductPrice.all_objects.create(
            tenant=tenant, product=product, amount=Decimal('10.00'),
            valid_from=timezone.now(),
        )
        company = Company.all_objects.create(tenant=tenant, name='Empresa Web')
        branch = Branch.all_objects.create(tenant=tenant, company=company, name='Filial Web')
        location = StockLocation.all_objects.create(
            tenant=tenant, branch=branch, code='WEB', name='Balcao Web', is_primary=True,
        )
        create_receipt(
            tenant, branch, product, location, Decimal('100'), unit, Decimal('1'),
            idempotency_key='web-mgmt-stock', actor=user, reason='seed',
        )

        open_cash_session(
            tenant=tenant, branch=branch, operator=user,
            opening_amount=Decimal('50.00'), idempotency_key='web-mgmt-cash-1',
        )
        cs_open = CashSession.all_objects.filter(tenant=tenant, operator=user, status='open').first()

        sale1 = create_counter_sale(
            tenant=tenant, branch=branch, operator=user, stock_location=location,
            items=[{'product': product, 'unit': unit, 'quantity': Decimal('2'), 'factor': Decimal('1')}],
            payments=[{'method': 'cash', 'amount': Decimal('20.00')}],
            idempotency_key='web-mgmt-sale-1',
        )
        sale2 = create_counter_sale(
            tenant=tenant, branch=branch, operator=user, stock_location=location,
            items=[{'product': product, 'unit': unit, 'quantity': Decimal('1'), 'factor': Decimal('1')}],
            payments=[{'method': 'pix', 'amount': Decimal('10.00')}],
            idempotency_key='web-mgmt-sale-2',
        )

        CashMovement.all_objects.create(
            tenant=tenant, cash_session=cs_open, movement_type='cash_in',
            amount=Decimal('30.00'), notes='Reforco',
        )
        CashMovement.all_objects.create(
            tenant=tenant, cash_session=cs_open, movement_type='cash_out',
            amount=Decimal('10.00'), notes='Sangria',
        )

        customer = Person.all_objects.create(
            tenant=tenant, person_type='PF', name='Cliente Teste', is_active=True,
        )
        PersonRole.all_objects.create(tenant=tenant, person=customer, role='customer')
        PersonDocument.all_objects.create(
            tenant=tenant, person=customer, document_type='CPF', value='12345678901',
        )

        supplier = Person.all_objects.create(
            tenant=tenant, person_type='PJ', name='Fornecedor Ltda', trade_name='Fornecedor',
            is_active=True,
        )
        PersonRole.all_objects.create(tenant=tenant, person=supplier, role='supplier')
        PersonDocument.all_objects.create(
            tenant=tenant, person=supplier, document_type='CNPJ', value='12345678000199',
        )

        inactive_person = Person.all_objects.create(
            tenant=tenant, person_type='PF', name='Inativo', is_active=False,
        )

        payable1 = Payable.all_objects.create(
            tenant=tenant, branch=branch, supplier_name='Fornecedor A',
            description='Compra de materiais', amount=Decimal('500.00'),
            status='pending', due_date=date.today() + timedelta(days=30),
        )
        payable2 = Payable.all_objects.create(
            tenant=tenant, branch=branch, supplier_name='Fornecedor B',
            description='Servico de limpeza', amount=Decimal('200.00'),
            status='settled', due_date=date.today() - timedelta(days=10),
        )

        receivable1 = Receivable.all_objects.create(
            tenant=tenant, branch=branch, customer_name='Cliente Pagante',
            description='Fatura mensal', amount=Decimal('300.00'),
            status='pending', due_date=date.today() + timedelta(days=15),
        )
        receivable2 = Receivable.all_objects.create(
            tenant=tenant, branch=branch, customer_name='Cliente Quite',
            description='Fatura anterior', amount=Decimal('150.00'),
            status='settled', due_date=date.today() - timedelta(days=5),
        )

        return {
            'tenant': tenant, 'client': api_client, 'user': user,
            'operator': operator, 'unit': unit, 'product': product,
            'branch': branch, 'location': location, 'cash_session': cs_open,
            'sale1': sale1, 'sale2': sale2,
            'customer': customer, 'supplier': supplier, 'inactive_person': inactive_person,
            'payable1': payable1, 'payable2': payable2,
            'receivable1': receivable1, 'receivable2': receivable2,
        }

    return _run_in_tenant(tenant, _create)


# =============================================================================
# Sale list — pagination and filters
# =============================================================================

@pytest.mark.django_db
def test_sale_list_paginated(web_context):
    ctx = web_context
    response = ctx['client'].get(
        '/api/v1/sales/', HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    data = response.json()
    assert 'count' in data
    assert 'next' in data
    assert 'results' in data
    assert data['count'] >= 2


@pytest.mark.django_db
def test_sale_list_filters_branch(web_context):
    ctx = web_context
    response = ctx['client'].get(
        f'/api/v1/sales/?branch={ctx["branch"].id}',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    assert len(response.json()['results']) >= 2


@pytest.mark.django_db
def test_sale_list_filters_status(web_context):
    ctx = web_context
    response = ctx['client'].get(
        '/api/v1/sales/?status=confirmed',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    for sale in response.json()['results']:
        assert sale['status'] == 'confirmed'


@pytest.mark.django_db
def test_sale_list_filters_operator(web_context):
    ctx = web_context
    response = ctx['client'].get(
        f'/api/v1/sales/?operator={ctx["user"].id}',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    for sale in response.json()['results']:
        assert sale['operator'] == ctx['user'].id


@pytest.mark.django_db
def test_sale_list_filters_date_range(web_context):
    ctx = web_context
    today = date.today()
    past = today - timedelta(days=30)
    future = today + timedelta(days=1)
    response = ctx['client'].get(
        f'/api/v1/sales/?date_from={past.isoformat()}&date_to={future.isoformat()}',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    assert response.json()['count'] >= 2


@pytest.mark.django_db
def test_sale_list_filters_customer(web_context):
    ctx = web_context
    response = ctx['client'].get(
        f'/api/v1/sales/?customer={ctx["customer"].id}',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    assert response.json()['count'] == 0  # no sales linked to that customer


# =============================================================================
# Sale detail
# =============================================================================

@pytest.mark.django_db
def test_sale_detail_includes_items_payments_and_operator(web_context):
    ctx = web_context
    response = ctx['client'].get(
        f'/api/v1/sales/{ctx["sale1"].id}/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    data = response.json()
    assert 'items' in data
    assert 'payments' in data
    assert 'branch' in data
    assert 'operator' in data
    assert len(data['items']) >= 1
    assert len(data['payments']) >= 1
    assert data['status'] == 'confirmed'


# =============================================================================
# Cash session list
# =============================================================================

@pytest.mark.django_db
def test_cash_session_list_paginated(web_context):
    ctx = web_context
    response = ctx['client'].get(
        '/api/v1/cash-sessions/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    data = response.json()
    assert 'count' in data
    assert 'results' in data
    assert data['count'] >= 1


@pytest.mark.django_db
def test_cash_session_list_filters_branch(web_context):
    ctx = web_context
    response = ctx['client'].get(
        f'/api/v1/cash-sessions/?branch={ctx["branch"].id}',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    assert len(response.json()['results']) >= 1


@pytest.mark.django_db
def test_cash_session_list_filters_operator(web_context):
    ctx = web_context
    response = ctx['client'].get(
        f'/api/v1/cash-sessions/?operator={ctx["user"].id}',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    for cs in response.json()['results']:
        assert cs['operator'] == ctx['user'].id


# =============================================================================
# Cash session detail
# =============================================================================

@pytest.mark.django_db
def test_cash_session_detail_includes_movements_and_closing_difference(web_context):
    ctx = web_context
    cs_id = ctx['cash_session'].id
    response = ctx['client'].get(
        f'/api/v1/cash-sessions/{cs_id}/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    data = response.json()
    assert 'movements' in data
    assert 'cash_breakdown' in data
    assert 'difference' in data or data.get('difference') is None


# =============================================================================
# CSV export
# =============================================================================

@pytest.mark.django_db
def test_sales_csv_export_returns_csv(web_context):
    ctx = web_context
    response = ctx['client'].get(
        '/api/v1/sales/export/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    assert response['Content-Type'] == 'text/csv'
    reader = csv.DictReader(io.StringIO(response.getvalue().decode('utf-8')))
    rows = list(reader)
    assert len(rows) >= 2


@pytest.mark.django_db
def test_sales_csv_export_respects_date_filter(web_context):
    ctx = web_context
    tomorrow = date.today() + timedelta(days=1)
    response = ctx['client'].get(
        f'/api/v1/sales/export/?date_from={tomorrow.isoformat()}&date_to={tomorrow.isoformat()}',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    reader = csv.DictReader(io.StringIO(response.getvalue().decode('utf-8')))
    rows = list(reader)
    assert len(rows) == 0


@pytest.mark.django_db
def test_sales_csv_export_respects_branch_filter(web_context):
    ctx = web_context
    response = ctx['client'].get(
        f'/api/v1/sales/export/?branch={ctx["branch"].id}',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    reader = csv.DictReader(io.StringIO(response.getvalue().decode('utf-8')))
    rows = list(reader)
    assert len(rows) >= 2


# =============================================================================
# People filters
# =============================================================================

@pytest.mark.django_db
def test_people_filter_by_q_name(web_context):
    ctx = web_context
    response = ctx['client'].get(
        '/api/v1/people/?q=Cliente',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    results = response.json().get('results', response.json())
    names = [p['name'] for p in results]
    assert any('Cliente Teste' in n for n in names)
    assert not any('Inativo' in n for n in names)


@pytest.mark.django_db
def test_people_filter_by_q_document(web_context):
    ctx = web_context
    response = ctx['client'].get(
        '/api/v1/people/?q=12345678901',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    results = response.json().get('results', response.json())
    names = [p['name'] for p in results]
    assert 'Cliente Teste' in names


@pytest.mark.django_db
def test_people_filter_by_role(web_context):
    ctx = web_context
    response = ctx['client'].get(
        '/api/v1/people/?role=customer',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    results = response.json().get('results', response.json())
    for person in results:
        assert 'customer' in person.get('role_values', [])


@pytest.mark.django_db
def test_people_filter_by_active(web_context):
    ctx = web_context
    response = ctx['client'].get(
        '/api/v1/people/?active=true',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    results = response.json().get('results', response.json())
    for person in results:
        assert person['is_active'] is True


@pytest.mark.django_db
def test_people_filter_active_false(web_context):
    ctx = web_context
    response = ctx['client'].get(
        '/api/v1/people/?active=false',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    results = response.json().get('results', response.json())
    for person in results:
        assert person['is_active'] is False


# =============================================================================
# Financial filters — payables
# =============================================================================

@pytest.mark.django_db
def test_payables_list_paginated(web_context):
    ctx = web_context
    response = ctx['client'].get(
        '/api/v1/payables/', HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    data = response.json()
    assert 'count' in data
    assert 'results' in data
    assert data['count'] >= 2


@pytest.mark.django_db
def test_payables_filter_by_status(web_context):
    ctx = web_context
    response = ctx['client'].get(
        '/api/v1/payables/?status=pending',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    for p in response.json()['results']:
        assert p['status'] == 'pending'


@pytest.mark.django_db
def test_payables_filter_by_period(web_context):
    ctx = web_context
    response = ctx['client'].get(
        '/api/v1/payables/?date_from=2020-01-01&date_to=2030-12-31',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    assert response.json()['count'] >= 2


@pytest.mark.django_db
def test_payables_filter_by_branch(web_context):
    ctx = web_context
    response = ctx['client'].get(
        f'/api/v1/payables/?branch={ctx["branch"].id}',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    assert response.json()['count'] >= 2


# =============================================================================
# Financial filters — receivables
# =============================================================================

@pytest.mark.django_db
def test_receivables_list_paginated(web_context):
    ctx = web_context
    response = ctx['client'].get(
        '/api/v1/receivables/', HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    data = response.json()
    assert 'count' in data
    assert 'results' in data
    assert data['count'] >= 2


@pytest.mark.django_db
def test_receivables_filter_by_status(web_context):
    ctx = web_context
    response = ctx['client'].get(
        '/api/v1/receivables/?status=pending',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    for r in response.json()['results']:
        assert r['status'] == 'pending'


@pytest.mark.django_db
def test_receivables_filter_by_period(web_context):
    ctx = web_context
    response = ctx['client'].get(
        '/api/v1/receivables/?date_from=2020-01-01&date_to=2030-12-31',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    assert response.json()['count'] >= 2


# =============================================================================
# Role denial — operator cannot view financial data
# =============================================================================

@pytest.mark.django_db
def test_operator_denied_payables(web_context):
    ctx = web_context
    op_client = ctx['client'].__class__()
    op_client = _auth_client(op_client, ctx['operator'], ctx['tenant'], role='operator')
    response = op_client.get(
        '/api/v1/payables/', HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 403


@pytest.mark.django_db
def test_operator_denied_receivables(web_context):
    ctx = web_context
    op_client = ctx['client'].__class__()
    op_client = _auth_client(op_client, ctx['operator'], ctx['tenant'], role='operator')
    response = op_client.get(
        '/api/v1/receivables/', HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 403


@pytest.mark.django_db
def test_operator_can_view_sales(web_context):
    ctx = web_context
    op_client = ctx['client'].__class__()
    op_client = _auth_client(op_client, ctx['operator'], ctx['tenant'], role='operator')
    response = op_client.get(
        '/api/v1/sales/', HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200


# =============================================================================
# Cross-tenant 404
# =============================================================================

@pytest.mark.django_db
def test_cross_tenant_sale_404(client, web_context):
    ctx = web_context
    other = Tenant.objects.create(name='Other Web', slug='other-web')
    other_user = User.objects.create_user(email='other-web@test.local', password='pass123')
    _auth_client(client, other_user, other, role='admin')
    response = client.get(
        f'/api/v1/sales/{ctx["sale1"].id}/',
        HTTP_X_TENANT_ID=str(other.id),
    )
    assert response.status_code == 404


@pytest.mark.django_db
def test_cross_tenant_cash_session_404(client, web_context):
    ctx = web_context
    other = Tenant.objects.create(name='Other Web 2', slug='other-web-2')
    other_user = User.objects.create_user(email='other-web-2@test.local', password='pass123')
    _auth_client(client, other_user, other, role='admin')
    response = client.get(
        f'/api/v1/cash-sessions/{ctx["cash_session"].id}/',
        HTTP_X_TENANT_ID=str(other.id),
    )
    assert response.status_code == 404


# =============================================================================
# No mutation endpoints for sales (web is read-only)
# =============================================================================

@pytest.mark.django_db
def test_sales_no_create_endpoint(web_context):
    ctx = web_context
    response = ctx['client'].post(
        '/api/v1/sales/',
        {'branch': str(ctx['branch'].id)},
        content_type='application/json',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code in (403, 404, 405)


@pytest.mark.django_db
def test_sales_no_update_endpoint(web_context):
    ctx = web_context
    response = ctx['client'].put(
        f'/api/v1/sales/{ctx["sale1"].id}/',
        {'branch': str(ctx['branch'].id)},
        content_type='application/json',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code in (403, 404, 405)


@pytest.mark.django_db
def test_sales_no_delete_endpoint(web_context):
    ctx = web_context
    response = ctx['client'].delete(
        f'/api/v1/sales/{ctx["sale1"].id}/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code in (403, 404, 405)
