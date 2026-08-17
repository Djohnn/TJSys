from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.db import connection

from catalog.models import Product, Unit
from fiscal.models import FiscalEmitter, FiscalProductConfig
from fiscal.services import validate_fiscal_config_for_receipt
from inventory.models import StockLocation
from purchasing.models import PurchaseOrder, PurchaseOrderItem, Supplier
from purchasing.services import approve_purchase_order, receive_purchase_order
from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Branch, Company, Tenant, TenantMembership


def _run_in_tenant(tenant, callback):
    token = set_current_tenant_id(tenant.id)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SET app.current_tenant_id = %s', [str(tenant.id)])
        return callback()
    finally:
        reset_current_tenant_id(token)


@pytest.fixture
def receipt_context():
    tenant = Tenant.objects.create(name='Fiscal RCT Tenant', slug='fiscal-rct')

    def _create():
        company = Company.all_objects.create(tenant=tenant, name='Empresa RCT Fiscal')
        branch = Branch.all_objects.create(
            tenant=tenant,
            company=company,
            name='Filial RCT Fiscal',
        )
        location = StockLocation.all_objects.create(
            tenant=tenant,
            branch=branch,
            code='RCT-FIS',
            name='RCT Fiscal',
            is_primary=True,
        )
        unit = Unit.all_objects.create(tenant=tenant, symbol='UN', name='Unidade')
        product = Product.all_objects.create(
            tenant=tenant,
            sku='RCT-FIS',
            name='Produto RCT Fiscal',
            base_unit=unit,
            ncm='12345678',
        )
        supplier = Supplier.all_objects.create(
            tenant=tenant,
            name='Fornecedor Fiscal',
            cnpj='00.000.000/0001-00',
        )
        po = PurchaseOrder.all_objects.create(
            tenant=tenant,
            supplier=supplier,
            branch=branch,
        )
        item = PurchaseOrderItem.all_objects.create(
            tenant=tenant,
            purchase_order=po,
            product=product,
            unit=unit,
            quantity=Decimal('10'),
            unit_cost=Decimal('5.00'),
            factor=Decimal('1'),
        )
        approve_purchase_order(tenant=tenant, purchase_order=po, idempotency_key='fiscal-rct')
        receipt = receive_purchase_order(
            tenant=tenant,
            purchase_order=po,
            items=[{'purchase_order_item_id': item.id, 'quantity_received': Decimal('10')}],
            idempotency_key='fiscal-rct-recv',
        )
        return {
            'tenant': tenant,
            'branch': branch,
            'location': location,
            'unit': unit,
            'product': product,
            'supplier': supplier,
            'po': po,
            'item': item,
            'receipt': receipt,
        }

    return _run_in_tenant(tenant, _create)


def _validate(receipt):
    return _run_in_tenant(receipt.tenant, lambda: validate_fiscal_config_for_receipt(receipt))


def _reconcile(receipt, tenant, cfop=None):
    from fiscal.services import reconcile_receipt_fiscal

    return _run_in_tenant(tenant, lambda: reconcile_receipt_fiscal(receipt, tenant, cfop=cfop))


@pytest.mark.django_db
def test_validate_missing_emitter_returns_error(receipt_context):
    ctx = receipt_context
    issues = _validate(ctx['receipt'])
    errors = [i for i in issues if i.severity == 'error']
    assert any('emitente' in e.message.lower() for e in errors)


@pytest.mark.django_db
def test_validate_missing_supplier_cnpj(receipt_context):
    ctx = receipt_context
    ctx['supplier'].cnpj = ''
    ctx['supplier'].save()
    ctx['receipt'].refresh_from_db()

    FiscalEmitter.all_objects.create(
        tenant=ctx['tenant'],
        branch=ctx['branch'],
        provider='plugnotas',
        cpf_cnpj='12345678000199',
        registered_at_provider=True,
    )

    issues = _validate(ctx['receipt'])
    errors = [i for i in issues if i.severity == 'error']
    assert any('cnpj' in e.message.lower() for e in errors)


@pytest.mark.django_db
def test_validate_missing_ncm_returns_error(receipt_context):
    ctx = receipt_context
    ctx['product'].ncm = ''
    ctx['product'].save()

    FiscalEmitter.all_objects.create(
        tenant=ctx['tenant'],
        branch=ctx['branch'],
        provider='plugnotas',
        cpf_cnpj='12345678000199',
        registered_at_provider=True,
    )

    issues = _validate(ctx['receipt'])
    errors = [i for i in issues if i.severity == 'error']
    assert any('ncm' in e.message.lower() for e in errors)


@pytest.mark.django_db
def test_validate_missing_fiscal_product_config_warns(receipt_context):
    ctx = receipt_context

    FiscalEmitter.all_objects.create(
        tenant=ctx['tenant'],
        branch=ctx['branch'],
        provider='plugnotas',
        cpf_cnpj='12345678000199',
        registered_at_provider=True,
    )

    issues = _validate(ctx['receipt'])
    warnings = [i for i in issues if i.severity == 'warning']
    assert any('configura' in w.message.lower() for w in warnings)


@pytest.mark.django_db
def test_validate_clean_config_returns_no_errors(receipt_context):
    ctx = receipt_context

    FiscalEmitter.all_objects.create(
        tenant=ctx['tenant'],
        branch=ctx['branch'],
        provider='plugnotas',
        cpf_cnpj='12345678000199',
        registered_at_provider=True,
    )
    FiscalProductConfig.all_objects.create(
        tenant=ctx['tenant'],
        product=ctx['product'],
        cst_icms='00',
        cst_pis='99',
        cst_cofins='07',
    )

    issues = _validate(ctx['receipt'])
    errors = [i for i in issues if i.severity == 'error']
    assert len(errors) == 0


@pytest.mark.django_db
def test_reconcile_creates_fiscal_document(receipt_context):
    ctx = receipt_context

    FiscalEmitter.all_objects.create(
        tenant=ctx['tenant'],
        branch=ctx['branch'],
        provider='plugnotas',
        cpf_cnpj='12345678000199',
        registered_at_provider=True,
    )

    result = _reconcile(ctx['receipt'], ctx['tenant'])
    assert result['document'] is not None
    assert result['document'].direction == 'INPUT'
    assert result['document'].receipt_id == ctx['receipt'].id
    assert result['document'].purchase_order_id == ctx['po'].id
    assert result['document'].status == 'CONCLUDED'


@pytest.mark.django_db
def test_reconcile_idempotent(receipt_context):
    ctx = receipt_context

    FiscalEmitter.all_objects.create(
        tenant=ctx['tenant'],
        branch=ctx['branch'],
        provider='plugnotas',
        cpf_cnpj='12345678000199',
        registered_at_provider=True,
    )

    r1 = _reconcile(ctx['receipt'], ctx['tenant'])
    r2 = _reconcile(ctx['receipt'], ctx['tenant'])
    assert r1['document'].id == r2['document'].id


@pytest.mark.django_db
def test_reconcile_with_errors_returns_no_document(receipt_context):
    ctx = receipt_context
    ctx['product'].ncm = ''
    ctx['product'].save()

    result = _reconcile(ctx['receipt'], ctx['tenant'])
    assert result['document'] is None
    assert len(result['issues']) > 0


@pytest.mark.django_db
def test_api_validate_endpoint_returns_issues(client, receipt_context):
    ctx = receipt_context

    ctx['client'] = client
    ctx['client'].force_login(
        __import__('django.contrib.auth')
        .contrib.auth.get_user_model()
        .objects.get(
            email='purchasing-api@test.local',
        ),
    ) if False else None

    user = get_user_model().objects.create_user(
        email='fiscal-rct-test@test.local',
        password='pass123',
    )
    TenantMembership.objects.create(
        user=user,
        tenant=ctx['tenant'],
        role='admin',
        is_active=True,
    )
    client.force_login(user)
    session = client.session
    session['mfa_tenant_id'] = str(ctx['tenant'].id)
    session['mfa_method'] = 'totp'
    session.save()

    FiscalEmitter.all_objects.create(
        tenant=ctx['tenant'],
        branch=ctx['branch'],
        provider='plugnotas',
        cpf_cnpj='12345678000199',
        registered_at_provider=True,
    )

    response = client.post(
        f'/api/v1/receipts/{ctx["receipt"].id}/validate-fiscal/',
        {'cfop': '1102'},
        content_type='application/json',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )

    assert response.status_code == 200
    data = response.json()
    assert data['receipt_id'] == str(ctx['receipt'].id)
    assert isinstance(data['requires_attention'], bool)
    assert data['document_id'] is not None


@pytest.mark.django_db
def test_api_validate_404_for_nonexistent_receipt(client, receipt_context):
    import uuid

    ctx = receipt_context

    user = get_user_model().objects.create_user(
        email='fiscal-rct-404@test.local',
        password='pass123',
    )
    TenantMembership.objects.create(
        user=user,
        tenant=ctx['tenant'],
        role='admin',
        is_active=True,
    )
    client.force_login(user)
    session = client.session
    session['mfa_tenant_id'] = str(ctx['tenant'].id)
    session['mfa_method'] = 'totp'
    session.save()

    response = client.post(
        f'/api/v1/receipts/{uuid.uuid4()}/validate-fiscal/',
        content_type='application/json',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 404
