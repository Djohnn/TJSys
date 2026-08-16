from decimal import Decimal

import pytest
from django.db import connection
from django.utils import timezone

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
def fiscal_coverage_context(django_user_model):
    from decimal import Decimal

    from catalog.models import Product, ProductPrice, Unit
    from fiscal.models import FiscalEmitter
    from inventory.models import StockLocation
    from inventory.services import create_receipt
    from people.models import Person, PersonAddress, PersonDocument
    from sales.services import create_counter_sale, open_cash_session

    tenant = Tenant.objects.create(name='Coverage Tenant', slug='coverage-tenant')
    user = django_user_model.objects.create_user(
        email='coverage@test.local', password='pass123'
    )
    TenantMembership.objects.create(user=user, tenant=tenant, role='admin', is_active=True)

    def _create():
        unit = Unit.all_objects.create(tenant=tenant, symbol='UN', name='Unidade')
        product = Product.all_objects.create(
            tenant=tenant,
            sku='COV-PROD',
            name='Produto Coverage',
            base_unit=unit,
            ncm='12345678',
        )
        ProductPrice.all_objects.create(
            tenant=tenant,
            product=product,
            amount=Decimal('10.00'),
            valid_from=timezone.now(),
        )
        company = Company.all_objects.create(
            tenant=tenant,
            name='Empresa Coverage',
            cnpj='12345678000199',
        )
        branch = Branch.all_objects.create(
            tenant=tenant,
            company=company,
            name='Filial Coverage',
        )
        FiscalEmitter.all_objects.create(
            tenant=tenant,
            branch=branch,
            provider='plugnotas',
            cpf_cnpj='12345678000199',
            registered_at_provider=True,
        )
        location = StockLocation.all_objects.create(
            tenant=tenant,
            branch=branch,
            code='COV',
            name='Coverage',
            is_primary=True,
        )
        create_receipt(
            tenant,
            branch,
            product,
            location,
            Decimal('5'),
            unit,
            Decimal('1'),
            idempotency_key='coverage-stock',
            actor=user,
            reason='seed coverage stock',
        )
        open_cash_session(
            tenant=tenant,
            branch=branch,
            operator=user,
            opening_amount=Decimal('0'),
            idempotency_key='coverage-cash-open',
        )
        sale = create_counter_sale(
            tenant=tenant,
            branch=branch,
            operator=user,
            stock_location=location,
            items=[
                {
                    'product': product,
                    'unit': unit,
                    'quantity': Decimal('1'),
                    'factor': Decimal('1'),
                }
            ],
            payments=[{'method': 'cash', 'amount': Decimal('10.00')}],
            idempotency_key='coverage-sale',
        )
        # Create a person for recipient tests
        person = Person.all_objects.create(
            tenant=tenant,
            person_type='PF',
            name='Recipient Person',
        )
        PersonDocument.all_objects.create(
            tenant=tenant,
            person=person,
            document_type='CPF',
            value='12345678901',
        )
        PersonAddress.all_objects.create(
            tenant=tenant,
            person=person,
            address_type='fiscal',
            street='Rua Teste',
            number='123',
            city='Sao Paulo',
            state='SP',
            postal_code='01234567',
            country='BR',
            is_primary=True,
        )
        return {
            'tenant': tenant,
            'user': user,
            'unit': unit,
            'product': product,
            'branch': branch,
            'sale': sale,
            'person': person,
            'company': company,
            'location': location,
        }

    return _run_in_tenant(tenant, _create)


# ── Services Tests ──────────────────────────────────────────────


@pytest.mark.django_db
def test_resolve_emitter_found(fiscal_coverage_context):
    from fiscal.services import resolve_emitter

    ctx = fiscal_coverage_context
    result = _run_in_tenant(
        ctx['tenant'],
        lambda: resolve_emitter(ctx['branch']),
    )
    assert result is not None
    assert result.branch_id == ctx['branch'].id
    assert result.cpf_cnpj == '12345678000199'


@pytest.mark.django_db
def test_resolve_emitter_not_found(fiscal_coverage_context):
    from fiscal.services import resolve_emitter

    ctx = fiscal_coverage_context

    def _test():
        # Create a branch without emitter
        company = Company.all_objects.filter(tenant=ctx['tenant']).first()
        branch = Branch.all_objects.create(
            tenant=ctx['tenant'],
            company=company,
            name='No Emitter Branch',
        )
        result = resolve_emitter(branch)
        assert result is None

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_resolve_product_config_found(fiscal_coverage_context):
    from fiscal.models import FiscalProductConfig
    from fiscal.services import resolve_product_config

    ctx = fiscal_coverage_context

    def _test():
        FiscalProductConfig.all_objects.create(
            tenant=ctx['tenant'],
            product=ctx['product'],
            cst_icms='00',
            cst_pis='99',
            cst_cofins='07',
            origem='0',
            aliquota_icms=Decimal('18.00'),
        )
        result = resolve_product_config(ctx['product'])
        assert result is not None
        assert result.cst_icms == '00'
        assert result.aliquota_icms == Decimal('18.00')

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_resolve_product_config_not_found(fiscal_coverage_context):
    from fiscal.services import resolve_product_config

    ctx = fiscal_coverage_context
    result = _run_in_tenant(
        ctx['tenant'],
        lambda: resolve_product_config(ctx['product']),
    )
    assert result is None


@pytest.mark.django_db
def test_build_item_dict_with_config(fiscal_coverage_context):
    from fiscal.models import FiscalProductConfig
    from fiscal.services import build_item_dict

    ctx = fiscal_coverage_context

    def _test():
        FiscalProductConfig.all_objects.create(
            tenant=ctx['tenant'],
            product=ctx['product'],
            cst_icms='10',
            cst_pis='01',
            cst_cofins='02',
            origem='1',
            aliquota_icms=Decimal('12.00'),
        )
        # Create a sale item
        sale_item = ctx['sale'].items.select_related('product', 'unit').first()
        result = build_item_dict(sale_item)
        assert result['ncm'] == '12345678'
        assert result['cst_icms'] == '10'
        assert result['cst_pis'] == '01'
        assert result['cst_cofins'] == '02'
        assert result['origem'] == '1'
        assert result['aliquota_icms'] == Decimal('12.00')
        assert result['unidade'] == 'UN'

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_build_item_dict_without_config(fiscal_coverage_context):
    from fiscal.services import build_item_dict

    ctx = fiscal_coverage_context

    def _test():
        sale_item = ctx['sale'].items.select_related('product', 'unit').first()
        result = build_item_dict(sale_item)
        assert result['ncm'] == '12345678'
        assert result['cst_icms'] == '00'  # default
        assert result['cst_pis'] == '99'  # default
        assert result['cst_cofins'] == '07'  # default
        assert result['origem'] == '0'  # default
        assert result['aliquota_icms'] == 0  # default

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_build_payment_dict(fiscal_coverage_context):
    from fiscal.services import build_payment_dict

    ctx = fiscal_coverage_context

    def _test():
        payment = ctx['sale'].payments.first()
        result = build_payment_dict(payment)
        assert result['method'] == 'cash'
        assert result['amount'] == Decimal('10.00')

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_build_recipient_dict_with_address(fiscal_coverage_context):
    from fiscal.services import build_recipient_dict

    ctx = fiscal_coverage_context

    def _test():
        result = build_recipient_dict(ctx['person'])
        assert result['name'] == 'Recipient Person'
        assert result['cpf_cnpj'] == '12345678901'
        assert result['address'] is not None
        assert result['address']['street'] == 'Rua Teste'
        assert result['address']['city'] == 'Sao Paulo'

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_build_recipient_dict_without_address(fiscal_coverage_context):
    from fiscal.services import build_recipient_dict
    from people.models import Person

    ctx = fiscal_coverage_context

    def _test():
        person = Person.all_objects.create(
            tenant=ctx['tenant'],
            person_type='PF',
            name='No Address Person',
        )
        result = build_recipient_dict(person)
        assert result['name'] == 'No Address Person'
        assert result['address'] is None

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_build_recipient_dict_none():
    from fiscal.services import build_recipient_dict

    result = build_recipient_dict(None)
    assert result is None


@pytest.mark.django_db
def test_validate_fiscal_config_for_receipt_valid(fiscal_coverage_context):
    from fiscal.models import FiscalProductConfig
    from fiscal.services import validate_fiscal_config_for_receipt
    from purchasing.models import (
        PurchaseOrder,
        PurchaseOrderItem,
        PurchaseReceipt,
        PurchaseReceiptItem,
        Supplier,
    )

    ctx = fiscal_coverage_context

    def _test():
        supplier = Supplier.all_objects.create(
            tenant=ctx['tenant'],
            name='Supplier',
            cnpj='98765432000199',
        )
        po = PurchaseOrder.all_objects.create(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            supplier=supplier,
        )
        poi = PurchaseOrderItem.all_objects.create(
            tenant=ctx['tenant'],
            purchase_order=po,
            product=ctx['product'],
            unit=ctx['unit'],
            quantity=Decimal('1'),
            unit_cost=Decimal('10.00'),
            factor=Decimal('1'),
        )
        receipt = PurchaseReceipt.all_objects.create(
            tenant=ctx['tenant'],
            purchase_order=po,
        )
        FiscalProductConfig.all_objects.create(
            tenant=ctx['tenant'],
            product=ctx['product'],
            cst_icms='00',
            cst_pis='99',
            cst_cofins='07',
            origem='0',
        )
        PurchaseReceiptItem.all_objects.create(
            tenant=ctx['tenant'],
            receipt=receipt,
            purchase_order_item=poi,
            quantity_received=Decimal('1'),
            unit_cost=Decimal('10.00'),
        )
        issues = validate_fiscal_config_for_receipt(receipt)
        errors = [i for i in issues if i.severity == 'error']
        assert len(errors) == 0

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_validate_fiscal_config_for_receipt_missing_emitter(fiscal_coverage_context):
    from fiscal.models import FiscalEmitter
    from fiscal.services import validate_fiscal_config_for_receipt
    from purchasing.models import PurchaseOrder, PurchaseReceipt, Supplier

    ctx = fiscal_coverage_context

    def _test():
        FiscalEmitter.all_objects.filter(tenant=ctx['tenant']).delete()
        supplier = Supplier.all_objects.create(
            tenant=ctx['tenant'],
            name='Supplier',
            cnpj='98765432000199',
        )
        po = PurchaseOrder.all_objects.create(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            supplier=supplier,
        )
        receipt = PurchaseReceipt.all_objects.create(
            tenant=ctx['tenant'],
            purchase_order=po,
        )
        issues = validate_fiscal_config_for_receipt(receipt)
        error_messages = [i.message for i in issues if i.severity == 'error']
        assert any('emitente fiscal configurado' in msg.lower() for msg in error_messages)

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_validate_fiscal_config_for_receipt_missing_ncm(fiscal_coverage_context):
    from catalog.models import Product
    from fiscal.services import validate_fiscal_config_for_receipt
    from purchasing.models import (
        PurchaseOrder,
        PurchaseOrderItem,
        PurchaseReceipt,
        PurchaseReceiptItem,
        Supplier,
    )

    ctx = fiscal_coverage_context

    def _test():
        product_no_ncm = Product.all_objects.create(
            tenant=ctx['tenant'],
            sku='NO-NCM',
            name='Sem NCM',
            base_unit=ctx['unit'],
            ncm='',
        )
        supplier = Supplier.all_objects.create(
            tenant=ctx['tenant'],
            name='Supplier',
            cnpj='98765432000199',
        )
        po = PurchaseOrder.all_objects.create(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            supplier=supplier,
        )
        poi = PurchaseOrderItem.all_objects.create(
            tenant=ctx['tenant'],
            purchase_order=po,
            product=product_no_ncm,
            unit=ctx['unit'],
            quantity=Decimal('1'),
            unit_cost=Decimal('10.00'),
            factor=Decimal('1'),
        )
        receipt = PurchaseReceipt.all_objects.create(
            tenant=ctx['tenant'],
            purchase_order=po,
        )
        PurchaseReceiptItem.all_objects.create(
            tenant=ctx['tenant'],
            receipt=receipt,
            purchase_order_item=poi,
            quantity_received=Decimal('1'),
            unit_cost=Decimal('10.00'),
        )
        issues = validate_fiscal_config_for_receipt(receipt)
        error_messages = [i.message for i in issues if i.severity == 'error']
        assert any('sem NCM' in msg for msg in error_messages)

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_reconcile_receipt_fiscal_happy_path(fiscal_coverage_context):
    from fiscal.services import reconcile_receipt_fiscal
    from purchasing.models import PurchaseOrder, PurchaseReceipt, Supplier

    ctx = fiscal_coverage_context

    def _test():
        supplier = Supplier.all_objects.create(
            tenant=ctx['tenant'],
            name='Supplier',
            cnpj='98765432000199',
        )
        po = PurchaseOrder.all_objects.create(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            supplier=supplier,
        )
        receipt = PurchaseReceipt.all_objects.create(
            tenant=ctx['tenant'],
            purchase_order=po,
        )
        result = reconcile_receipt_fiscal(receipt, ctx['tenant'])
        assert result['document'] is not None
        assert result['issues'] == []
        assert result['document'].cfop == '1102'

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_reconcile_receipt_fiscal_existing_document(fiscal_coverage_context):
    from fiscal.models import FiscalDocument
    from fiscal.services import reconcile_receipt_fiscal
    from purchasing.models import PurchaseOrder, PurchaseReceipt, Supplier

    ctx = fiscal_coverage_context

    def _test():
        supplier = Supplier.all_objects.create(
            tenant=ctx['tenant'],
            name='Supplier',
            cnpj='98765432000199',
        )
        po = PurchaseOrder.all_objects.create(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            supplier=supplier,
        )
        receipt = PurchaseReceipt.all_objects.create(
            tenant=ctx['tenant'],
            purchase_order=po,
        )
        existing_doc = FiscalDocument.all_objects.create(
            tenant=ctx['tenant'],
            purchase_order=po,
            receipt=receipt,
            status='CONCLUDED',
            direction='INPUT',
        )
        result = reconcile_receipt_fiscal(receipt, ctx['tenant'])
        assert result['document'] == existing_doc

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_apply_provider_query_result_concluded(fiscal_coverage_context):
    from fiscal.models import FiscalDocument
    from fiscal.ports import QueryResult
    from fiscal.services import apply_provider_query_result

    ctx = fiscal_coverage_context

    def _test():
        doc = FiscalDocument.all_objects.create(
            tenant=ctx['tenant'],
            sale=ctx['sale'],
            status='PROCESSING',
            provider_document_id='nfce-123',
        )
        result = QueryResult(
            status='CONCLUIDO',
            protocol='13579',
            xml_url='xml-key',
            pdf_url='pdf-key',
            error_reason=None,
        )
        updated = apply_provider_query_result(doc, result)
        assert updated.status == 'CONCLUDED'
        assert updated.protocol == '13579'
        assert updated.xml_key == 'xml-key'
        assert updated.pdf_key == 'pdf-key'

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_apply_provider_query_result_rejected(fiscal_coverage_context):
    from fiscal.models import FiscalDocument
    from fiscal.ports import QueryResult
    from fiscal.services import apply_provider_query_result

    ctx = fiscal_coverage_context

    def _test():
        doc = FiscalDocument.all_objects.create(
            tenant=ctx['tenant'],
            sale=ctx['sale'],
            status='PROCESSING',
            provider_document_id='nfce-123',
            attempt_number=1,
        )
        result = QueryResult(
            status='REJEITADO',
            protocol=None,
            xml_url=None,
            pdf_url=None,
            error_reason='NCM invalido',
        )
        updated = apply_provider_query_result(doc, result)
        assert updated.status == 'REJECTED'
        assert updated.is_active is False
        assert updated.error_detail == 'NCM invalido'

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_apply_provider_query_result_cancelled(fiscal_coverage_context):
    from fiscal.models import FiscalDocument
    from fiscal.ports import QueryResult
    from fiscal.services import apply_provider_query_result

    ctx = fiscal_coverage_context

    def _test():
        doc = FiscalDocument.all_objects.create(
            tenant=ctx['tenant'],
            sale=ctx['sale'],
            status='PROCESSING',
            provider_document_id='nfce-123',
        )
        result = QueryResult(
            status='CANCELADO',
            protocol=None,
            xml_url=None,
            pdf_url=None,
            error_reason='Cancelado pelo emitente',
        )
        updated = apply_provider_query_result(doc, result)
        assert updated.status == 'CANCELLED'
        assert updated.is_active is False
        assert updated.error_detail == 'Cancelado pelo emitente'

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_apply_provider_query_result_unknown_status(fiscal_coverage_context):
    from fiscal.models import FiscalDocument
    from fiscal.ports import QueryResult
    from fiscal.services import apply_provider_query_result

    ctx = fiscal_coverage_context

    def _test():
        doc = FiscalDocument.all_objects.create(
            tenant=ctx['tenant'],
            sale=ctx['sale'],
            status='PROCESSING',
            provider_document_id='nfce-123',
        )
        result = QueryResult(
            status='UNKNOWN',
            protocol=None,
            xml_url=None,
            pdf_url=None,
            error_reason=None,
        )
        updated = apply_provider_query_result(doc, result)
        assert updated.status == 'PROCESSING'
        assert updated.last_polled_at is not None

    _run_in_tenant(ctx['tenant'], _test)


# ── Views Tests ─────────────────────────────────────────────────


@pytest.mark.django_db
def test_fiscal_config_view_with_emitter(client, fiscal_coverage_context):
    ctx = fiscal_coverage_context
    client.force_login(ctx['user'])
    session = client.session
    session['mfa_tenant_id'] = str(ctx['tenant'].id)
    session['mfa_method'] = 'totp'
    session.save()

    response = client.get(
        f'/api/v1/fiscal/config/?branch={ctx["branch"].id}',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    data = response.json()
    assert data['has_fiscal_config'] is True
    assert data['emitter_id'] is not None


@pytest.mark.django_db
def test_fiscal_config_view_without_emitter(client, fiscal_coverage_context):
    from fiscal.models import FiscalEmitter

    ctx = fiscal_coverage_context
    client.force_login(ctx['user'])

    FiscalEmitter.all_objects.filter(tenant=ctx['tenant']).update(registered_at_provider=False)

    response = client.get(
        f'/api/v1/fiscal/config/?branch={ctx["branch"].id}',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    data = response.json()
    assert data['has_fiscal_config'] is False


@pytest.mark.django_db
def test_fiscal_config_view_missing_branch_param(client, fiscal_coverage_context):
    ctx = fiscal_coverage_context
    client.force_login(ctx['user'])

    response = client.get(
        '/api/v1/fiscal/config/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_fiscal_config_view_branch_not_found(client, fiscal_coverage_context):
    import uuid

    ctx = fiscal_coverage_context
    client.force_login(ctx['user'])

    response = client.get(
        f'/api/v1/fiscal/config/?branch={uuid.uuid4()}',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 404


@pytest.mark.django_db
def test_fiscal_emitter_viewset_list(client, fiscal_coverage_context):
    ctx = fiscal_coverage_context
    client.force_login(ctx['user'])
    session = client.session
    session['mfa_tenant_id'] = str(ctx['tenant'].id)
    session['mfa_method'] = 'totp'
    session.save()

    response = client.get(
        '/api/v1/fiscal/emitters/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1


@pytest.mark.django_db
def test_fiscal_emitter_viewset_create(client, fiscal_coverage_context):
    ctx = fiscal_coverage_context
    client.force_login(ctx['user'])
    session = client.session
    session['mfa_tenant_id'] = str(ctx['tenant'].id)
    session['mfa_method'] = 'totp'
    session.save()

    new_branch = Branch.all_objects.create(
        tenant=ctx['tenant'],
        company=ctx['company'],
        name='New Branch',
    )

    response = client.post(
        '/api/v1/fiscal/emitters/',
        data={
            'branch': str(new_branch.id),
            'provider': 'plugnotas',
            'cpf_cnpj': '11122233344455',
            'api_key': 'secret-key',
        },
        content_type='application/json',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 201
    data = response.json()
    assert data['configured'] is True
    assert 'api_key' not in data


@pytest.mark.django_db
def test_fiscal_emitter_viewset_update(client, fiscal_coverage_context):
    from fiscal.models import FiscalEmitter

    ctx = fiscal_coverage_context
    client.force_login(ctx['user'])
    session = client.session
    session['mfa_tenant_id'] = str(ctx['tenant'].id)
    session['mfa_method'] = 'totp'
    session.save()

    emitter = FiscalEmitter.all_objects.filter(tenant=ctx['tenant']).first()

    response = client.put(
        f'/api/v1/fiscal/emitters/{emitter.id}/',
        data={
            'branch': str(ctx['branch'].id),
            'provider': 'plugnotas',
            'cpf_cnpj': '99988877766655',
            'api_key': 'new-secret',
        },
        content_type='application/json',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    data = response.json()
    assert data['configured'] is True


@pytest.mark.django_db
def test_fiscal_document_viewset_list(client, fiscal_coverage_context):
    ctx = fiscal_coverage_context
    client.force_login(ctx['user'])
    session = client.session
    session['mfa_tenant_id'] = str(ctx['tenant'].id)
    session['mfa_method'] = 'totp'
    session.save()

    response = client.get(
        '/api/v1/fiscal/documents/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200


@pytest.mark.django_db
def test_fiscal_document_viewset_retry_completed(client, fiscal_coverage_context):
    from fiscal.models import FiscalDocument

    ctx = fiscal_coverage_context
    client.force_login(ctx['user'])
    session = client.session
    session['mfa_tenant_id'] = str(ctx['tenant'].id)
    session['mfa_method'] = 'totp'
    session.save()

    doc = FiscalDocument.all_objects.create(
        tenant=ctx['tenant'],
        sale=ctx['sale'],
        status='CONCLUDED',
        protocol='12345',
    )

    response = client.post(
        f'/api/v1/fiscal/documents/{doc.id}/retry/',
        data={'reason': 'Test retry'},
        content_type='application/json',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 409


@pytest.mark.django_db
def test_fiscal_document_viewset_retry_no_reason(client, fiscal_coverage_context):
    from fiscal.models import FiscalDocument

    ctx = fiscal_coverage_context
    client.force_login(ctx['user'])
    session = client.session
    session['mfa_tenant_id'] = str(ctx['tenant'].id)
    session['mfa_method'] = 'totp'
    session.save()

    doc = FiscalDocument.all_objects.create(
        tenant=ctx['tenant'],
        sale=ctx['sale'],
        status='FAILED',
    )

    response = client.post(
        f'/api/v1/fiscal/documents/{doc.id}/retry/',
        data={},
        content_type='application/json',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 422


@pytest.mark.django_db
def test_fiscal_document_viewset_cancel_already_cancelled(client, fiscal_coverage_context):
    from fiscal.models import FiscalDocument

    ctx = fiscal_coverage_context
    client.force_login(ctx['user'])
    session = client.session
    session['mfa_tenant_id'] = str(ctx['tenant'].id)
    session['mfa_method'] = 'totp'
    session.save()

    doc = FiscalDocument.all_objects.create(
        tenant=ctx['tenant'],
        sale=ctx['sale'],
        status='CANCELLED',
    )

    response = client.post(
        f'/api/v1/fiscal/documents/{doc.id}/cancel/',
        data={'reason': 'Test cancel'},
        content_type='application/json',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 409


@pytest.mark.django_db
def test_fiscal_document_viewset_cancel_no_reason(client, fiscal_coverage_context):
    from fiscal.models import FiscalDocument

    ctx = fiscal_coverage_context
    client.force_login(ctx['user'])
    session = client.session
    session['mfa_tenant_id'] = str(ctx['tenant'].id)
    session['mfa_method'] = 'totp'
    session.save()

    doc = FiscalDocument.all_objects.create(
        tenant=ctx['tenant'],
        sale=ctx['sale'],
        status='CONCLUDED',
    )

    response = client.post(
        f'/api/v1/fiscal/documents/{doc.id}/cancel/',
        data={},
        content_type='application/json',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 422


@pytest.mark.django_db
def test_fiscal_document_viewset_xml_not_concluded(client, fiscal_coverage_context):
    from fiscal.models import FiscalDocument

    ctx = fiscal_coverage_context
    client.force_login(ctx['user'])
    session = client.session
    session['mfa_tenant_id'] = str(ctx['tenant'].id)
    session['mfa_method'] = 'totp'
    session.save()

    doc = FiscalDocument.all_objects.create(
        tenant=ctx['tenant'],
        sale=ctx['sale'],
        status='PROCESSING',
    )

    response = client.get(
        f'/api/v1/fiscal/documents/{doc.id}/xml/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 403


@pytest.mark.django_db
def test_fiscal_document_viewset_xml_concluded(client, fiscal_coverage_context):
    from fiscal.models import FiscalDocument

    ctx = fiscal_coverage_context
    client.force_login(ctx['user'])
    session = client.session
    session['mfa_tenant_id'] = str(ctx['tenant'].id)
    session['mfa_method'] = 'totp'
    session.save()

    doc = FiscalDocument.all_objects.create(
        tenant=ctx['tenant'],
        sale=ctx['sale'],
        status='CONCLUDED',
    )

    response = client.get(
        f'/api/v1/fiscal/documents/{doc.id}/xml/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    assert response['Content-Type'] == 'application/xml'


@pytest.mark.django_db
def test_fiscal_document_viewset_pdf_not_allowed(client, fiscal_coverage_context):
    from fiscal.models import FiscalDocument

    ctx = fiscal_coverage_context
    client.force_login(ctx['user'])
    session = client.session
    session['mfa_tenant_id'] = str(ctx['tenant'].id)
    session['mfa_method'] = 'totp'
    session.save()

    doc = FiscalDocument.all_objects.create(
        tenant=ctx['tenant'],
        sale=ctx['sale'],
        status='PENDING',
    )

    response = client.get(
        f'/api/v1/fiscal/documents/{doc.id}/pdf/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 403


@pytest.mark.django_db
def test_fiscal_document_viewset_pdf_concluded(client, fiscal_coverage_context):
    from fiscal.models import FiscalDocument

    ctx = fiscal_coverage_context
    client.force_login(ctx['user'])
    session = client.session
    session['mfa_tenant_id'] = str(ctx['tenant'].id)
    session['mfa_method'] = 'totp'
    session.save()

    doc = FiscalDocument.all_objects.create(
        tenant=ctx['tenant'],
        sale=ctx['sale'],
        status='CONCLUDED',
    )

    response = client.get(
        f'/api/v1/fiscal/documents/{doc.id}/pdf/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    assert response['Content-Type'] == 'application/pdf'


@pytest.mark.django_db
def test_fiscal_product_config_viewset_list(client, fiscal_coverage_context):
    ctx = fiscal_coverage_context
    client.force_login(ctx['user'])
    session = client.session
    session['mfa_tenant_id'] = str(ctx['tenant'].id)
    session['mfa_method'] = 'totp'
    session.save()

    response = client.get(
        '/api/v1/fiscal/product-configs/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200


@pytest.mark.django_db
def test_fiscal_product_config_viewset_create(client, fiscal_coverage_context):
    ctx = fiscal_coverage_context
    client.force_login(ctx['user'])
    session = client.session
    session['mfa_tenant_id'] = str(ctx['tenant'].id)
    session['mfa_method'] = 'totp'
    session.save()

    response = client.post(
        '/api/v1/fiscal/product-configs/',
        data={
            'product': str(ctx['product'].id),
            'cst_icms': '00',
            'cst_pis': '99',
            'cst_cofins': '07',
            'origem': '0',
        },
        content_type='application/json',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 201


@pytest.mark.django_db
def test_fiscal_product_config_viewset_upsert(client, fiscal_coverage_context):
    from fiscal.models import FiscalProductConfig

    ctx = fiscal_coverage_context
    client.force_login(ctx['user'])
    session = client.session
    session['mfa_tenant_id'] = str(ctx['tenant'].id)
    session['mfa_method'] = 'totp'
    session.save()

    # Create existing config
    FiscalProductConfig.all_objects.create(
        tenant=ctx['tenant'],
        product=ctx['product'],
        cst_icms='00',
        cst_pis='99',
        cst_cofins='07',
        origem='0',
    )

    # Upsert should update
    response = client.post(
        '/api/v1/fiscal/product-configs/',
        data={
            'product': str(ctx['product'].id),
            'cst_icms': '10',
            'cst_pis': '01',
            'cst_cofins': '02',
            'origem': '1',
        },
        content_type='application/json',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    data = response.json()
    assert data['cst_icms'] == '10'


@pytest.mark.django_db
def test_fiscal_validation_issue_as_dict():
    from fiscal.services import FiscalValidationIssue

    issue = FiscalValidationIssue('field', 'message', 'error')
    result = issue.as_dict()
    assert result == {'field': 'field', 'message': 'message', 'severity': 'error'}