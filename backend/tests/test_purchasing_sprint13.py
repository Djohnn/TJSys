from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.db import connection

from catalog.models import Product, Unit
from purchasing.models import (
    PurchaseOrderItem,
    RecurringPurchaseOrderTemplate,
    RecurringTemplateItem,
    Supplier,
)
from purchasing.services import advance_recurring_template_schedule, generate_po_from_template
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
def s13_context():
    tenant = Tenant.objects.create(name='S13 Tenant', slug='s13-ctx')

    def _create():
        company = Company.all_objects.create(tenant=tenant, name='S13 Empresa')
        branch = Branch.all_objects.create(tenant=tenant, company=company, name='S13 Filial')
        unit = Unit.all_objects.create(tenant=tenant, symbol='UN', name='Unidade')
        product = Product.all_objects.create(
            tenant=tenant,
            sku='S13-PROD',
            name='S13 Produto',
            base_unit=unit,
        )
        supplier = Supplier.all_objects.create(
            tenant=tenant,
            name='S13 Fornecedor',
            cnpj='00.000.000/0001-00',
        )
        template = RecurringPurchaseOrderTemplate.all_objects.create(
            tenant=tenant,
            supplier=supplier,
            branch=branch,
            frequency='monthly',
            next_run='2026-07-01',
        )
        tpl_item = RecurringTemplateItem.all_objects.create(
            tenant=tenant,
            template=template,
            product=product,
            unit=unit,
            quantity=Decimal('10'),
            unit_cost=Decimal('5.00'),
            factor=Decimal('1'),
        )
        return {
            'tenant': tenant,
            'branch': branch,
            'unit': unit,
            'product': product,
            'supplier': supplier,
            'template': template,
            'tpl_item': tpl_item,
        }

    return _run_in_tenant(tenant, _create)


@pytest.mark.django_db
class TestRecurringPurchaseOrderTemplate:
    def test_generate_po_from_template(self, s13_context):
        ctx = s13_context
        po = generate_po_from_template(ctx['template'], ctx['tenant'])
        assert po.status == 'draft'
        assert po.supplier_id == ctx['supplier'].id
        assert po.branch_id == ctx['branch'].id
        items = PurchaseOrderItem.all_objects.filter(purchase_order=po)
        assert items.count() == 1
        assert items[0].quantity == Decimal('10')
        assert items[0].unit_cost == Decimal('5.00')

    def test_generate_po_respects_items_total(self, s13_context):
        ctx = s13_context
        po = generate_po_from_template(ctx['template'], ctx['tenant'])
        assert po.items_total == Decimal('50.00')

    def test_advance_monthly_schedule(self, s13_context):
        ctx = s13_context
        advance_recurring_template_schedule(ctx['template'])
        ctx['template'].refresh_from_db()
        assert str(ctx['template'].next_run) == '2026-08-01'

    def test_advance_weekly_schedule(self, s13_context):
        ctx = s13_context
        ctx['template'].frequency = 'weekly'
        ctx['template'].save()
        advance_recurring_template_schedule(ctx['template'])
        ctx['template'].refresh_from_db()
        assert str(ctx['template'].next_run) == '2026-07-08'

    def test_multiple_items_generated(self, s13_context):
        ctx = s13_context
        product2 = Product.all_objects.create(
            tenant=ctx['tenant'],
            sku='S13-PROD2',
            name='S13 Produto 2',
            base_unit=ctx['unit'],
        )
        RecurringTemplateItem.all_objects.create(
            tenant=ctx['tenant'],
            template=ctx['template'],
            product=product2,
            unit=ctx['unit'],
            quantity=Decimal('5'),
            unit_cost=Decimal('3.00'),
            factor=Decimal('2'),
        )
        po = generate_po_from_template(ctx['template'], ctx['tenant'])
        items = PurchaseOrderItem.all_objects.filter(purchase_order=po)
        assert items.count() == 2
        assert po.items_total == Decimal('50.00') + Decimal('30.00')


@pytest.mark.django_db
class TestAutoOnboardSupplier:
    def test_auto_onboard_creates_supplier(self, s13_context):
        from purchasing.services import auto_onboard_supplier

        ctx = s13_context
        supplier = auto_onboard_supplier(
            tenant=ctx['tenant'],
            cnpj='11.111.111/0001-11',
            name='Novo Fornecedor',
        )
        assert supplier.cnpj == '11.111.111/0001-11'
        assert supplier.name == 'Novo Fornecedor'

    def test_auto_onboard_uses_fallback_name(self, s13_context):
        from purchasing.services import auto_onboard_supplier

        ctx = s13_context
        supplier = auto_onboard_supplier(tenant=ctx['tenant'], cnpj='22.222.222/0001-22')
        assert '22.222' in supplier.name

    def test_auto_onboard_returns_existing_supplier(self, s13_context):
        from purchasing.services import auto_onboard_supplier

        ctx = s13_context
        s1 = auto_onboard_supplier(
            tenant=ctx['tenant'],
            cnpj='00.000.000/0001-00',
        )
        s2 = auto_onboard_supplier(
            tenant=ctx['tenant'],
            cnpj='00.000.000/0001-00',
        )
        assert s1.id == s2.id


@pytest.mark.django_db
class TestAutoOnboardAPI:
    def test_auto_onboard_endpoint(self, client, s13_context):
        ctx = s13_context
        user = get_user_model().objects.create_user(
            email='s13-api@test.local',
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
            '/api/v1/suppliers/auto_onboard/',
            {'cnpj': '99.999.999/0001-99', 'name': 'API Fornecedor'},
            content_type='application/json',
            HTTP_X_TENANT_ID=str(ctx['tenant'].id),
        )
        assert response.status_code == 201
        data = response.json()
        assert data['cnpj'] == '99.999.999/0001-99'

    def test_auto_onboard_missing_cnpj(self, client, s13_context):
        ctx = s13_context
        user = get_user_model().objects.create_user(
            email='s13-api2@test.local',
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
            '/api/v1/suppliers/auto_onboard/',
            {},
            content_type='application/json',
            HTTP_X_TENANT_ID=str(ctx['tenant'].id),
        )
        assert response.status_code == 400


@pytest.mark.django_db
class TestOCR:
    def test_parse_valid_nfe_xml(self):
        from fiscal.ocr import parse_nfe_xml

        xml = """<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe>
    <infNFe>
      <ide>
        <nNF>123456</nNF>
        <serie>1</serie>
        <dhEmi>2026-07-21T10:00:00-03:00</dhEmi>
      </ide>
      <emit>
        <CNPJ>11.111.111/0001-11</CNPJ>
        <xNome>Fornecedor XYZ Ltda</xNome>
      </emit>
      <det n="1">
        <prod>
          <cProd>PROD-001</cProd>
          <xProd>Produto Teste</xProd>
          <NCM>12345678</NCM>
          <CFOP>1102</CFOP>
          <uCom>UN</uCom>
          <qCom>10.0000</qCom>
          <vUnCom>25.5000</vUnCom>
        </prod>
      </det>
    </infNFe>
  </NFe>
</nfeProc>"""
        result = parse_nfe_xml(xml)
        assert result['supplier']['cnpj'] == '11.111.111/0001-11'
        assert result['supplier']['name'] == 'Fornecedor XYZ Ltda'
        assert len(result['items']) == 1
        assert result['items'][0]['code'] == 'PROD-001'
        assert result['items'][0]['quantity'] == Decimal('10.0000')
        assert result['items'][0]['unit_price'] == Decimal('25.5000')
        assert result['cfop'] == '1102'
        assert result['document_number'] == '123456'

    def test_parse_invalid_xml_raises(self):
        from fiscal.ocr import parse_nfe_xml

        with pytest.raises(Exception):
            parse_nfe_xml('not xml')

    def test_ocr_api_endpoint(self, client, s13_context):
        ctx = s13_context
        user = get_user_model().objects.create_user(
            email='s13-ocr@test.local',
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

        xml = """<?xml version="1.0"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe><infNFe>
    <ide><nNF>999</nNF><serie>1</serie></ide>
    <emit><CNPJ>33.333.333/0001-33</CNPJ><xNome>OCR Teste</xNome></emit>
    <det n="1"><prod>
      <cProd>OCR-001</cProd><xProd>Item OCR</xProd>
      <NCM>87654321</NCM><CFOP>2102</CFOP>
      <uCom>UN</uCom><qCom>5.0000</qCom><vUnCom>10.0000</vUnCom>
    </prod></det>
  </infNFe></NFe>
</nfeProc>"""
        response = client.post(
            '/api/v1/fiscal/ocr/',
            {'xml_content': xml},
            content_type='application/json',
            HTTP_X_TENANT_ID=str(ctx['tenant'].id),
        )
        assert response.status_code == 200
        data = response.json()
        assert data['supplier']['cnpj'] == '33.333.333/0001-33'
        assert len(data['items']) == 1
