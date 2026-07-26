from decimal import Decimal

import pytest
from django.db import connection
from django.utils import timezone

from catalog.models import Product, ProductPrice, Unit
from inventory.models import StockLocation
from inventory.services import create_receipt
from sales.services import create_counter_sale, open_cash_session
from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Branch, Company, Tenant, TenantMembership


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


@pytest.fixture
def fiscal_sale_context(django_user_model):
    tenant = Tenant.objects.create(name='Fiscal Tenant', slug='fiscal-tenant')
    user = django_user_model.objects.create_user(email='fiscal@test.local', password='pass123')
    TenantMembership.objects.create(user=user, tenant=tenant, role='admin', is_active=True)

    def _create():
        unit = Unit.all_objects.create(tenant=tenant, symbol='UN', name='Unidade')
        product = Product.all_objects.create(
            tenant=tenant,
            sku='FISCAL-PROD',
            name='Produto Fiscal',
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
            name='Empresa Fiscal',
            cnpj='12345678000199',
        )
        branch = Branch.all_objects.create(tenant=tenant, company=company, name='Filial Fiscal')
        location = StockLocation.all_objects.create(
            tenant=tenant,
            branch=branch,
            code='FISCAL',
            name='Fiscal',
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
            idempotency_key='fiscal-stock',
            actor=user,
            reason='seed fiscal stock',
        )
        open_cash_session(
            tenant=tenant,
            branch=branch,
            operator=user,
            opening_amount=Decimal('0'),
            idempotency_key='fiscal-cash-open',
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
            idempotency_key='fiscal-sale',
        )
        return {
            'tenant': tenant,
            'user': user,
            'unit': unit,
            'product': product,
            'branch': branch,
            'sale': sale,
        }

    return _run_in_tenant(tenant, _create)


@pytest.mark.django_db
def test_emit_nfce_fails_when_emitter_is_missing(fiscal_sale_context):
    from fiscal.models import FiscalDocument
    from fiscal.services import emit_nfce

    ctx = fiscal_sale_context

    def _test():
        doc = emit_nfce(ctx['sale'], ctx['tenant'])
        assert doc.status == FiscalDocument.STATUS_FAILED
        assert 'Emitente fiscal' in doc.error_detail

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_emit_nfce_creates_processing_document(monkeypatch, fiscal_sale_context):
    from fiscal.models import FiscalEmitter, FiscalProductConfig
    from fiscal.ports import EmitResult
    from fiscal.services import emit_nfce

    ctx = fiscal_sale_context

    def fake_emit(self, tenant, emitter, document, items, payments):
        assert emitter.branch_id == ctx['branch'].id
        assert items[0]['ncm'] == '12345678'
        assert payments[0]['amount'] == Decimal('10.00')
        return EmitResult(provider_document_id='nfce-123', raw_response={})

    monkeypatch.setattr('fiscal.adapters.plugnotas.PlugNotasAdapter.emit', fake_emit)

    def _test():
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
            origem='0',
        )

        doc = emit_nfce(ctx['sale'], ctx['tenant'])

        assert doc.status == 'PROCESSING'
        assert doc.provider_document_id == 'nfce-123'

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_poll_rejected_creates_second_attempt(monkeypatch, fiscal_sale_context):
    from fiscal.models import FiscalDocument, FiscalEmitter
    from fiscal.ports import QueryResult
    from fiscal.services import poll_fiscal_document

    ctx = fiscal_sale_context

    def fake_query(self, tenant, provider_document_id):
        return QueryResult(
            status='REJEITADO',
            protocol=None,
            xml_url=None,
            pdf_url=None,
            error_reason='NCM inválido',
        )

    monkeypatch.setattr('fiscal.adapters.plugnotas.PlugNotasAdapter.query', fake_query)
    monkeypatch.setattr(
        'fiscal.adapters.plugnotas.PlugNotasAdapter.emit',
        lambda self, tenant, emitter, document, items, payments: pytest.fail(
            'reattempt should remain queued/pending in this test'
        ),
    )

    def _test():
        FiscalEmitter.all_objects.create(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            provider='plugnotas',
            cpf_cnpj='12345678000199',
            registered_at_provider=True,
        )
        doc = FiscalDocument.all_objects.create(
            tenant=ctx['tenant'],
            sale=ctx['sale'],
            status='PROCESSING',
            provider_document_id='nfce-123',
        )

        poll_fiscal_document(doc)
        doc.refresh_from_db()

        assert doc.status == 'REJECTED'
        assert doc.is_active is False
        new_doc = FiscalDocument.all_objects.get(sale=ctx['sale'], is_active=True)
        assert new_doc.attempt_number == 2
        assert new_doc.status == 'PENDING'

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_poll_concluded_updates_protocol_and_artifacts(monkeypatch, fiscal_sale_context):
    from fiscal.models import FiscalDocument, FiscalEmitter
    from fiscal.ports import QueryResult
    from fiscal.services import poll_fiscal_document

    ctx = fiscal_sale_context

    def fake_query(self, tenant, provider_document_id):
        return QueryResult(
            status='CONCLUIDO',
            protocol='13579',
            xml_url='xml-key',
            pdf_url='pdf-key',
            error_reason=None,
        )

    monkeypatch.setattr('fiscal.adapters.plugnotas.PlugNotasAdapter.query', fake_query)

    def _test():
        FiscalEmitter.all_objects.create(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            provider='plugnotas',
            cpf_cnpj='12345678000199',
            registered_at_provider=True,
        )
        doc = FiscalDocument.all_objects.create(
            tenant=ctx['tenant'],
            sale=ctx['sale'],
            status='PROCESSING',
            provider_document_id='nfce-123',
        )

        poll_fiscal_document(doc)
        doc.refresh_from_db()

        assert doc.status == 'CONCLUDED'
        assert doc.protocol == '13579'
        assert doc.xml_key == 'xml-key'
        assert doc.pdf_key == 'pdf-key'

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_poll_fails_when_provider_document_id_is_missing(fiscal_sale_context):
    from fiscal.models import FiscalDocument
    from fiscal.services import poll_fiscal_document

    ctx = fiscal_sale_context

    def _test():
        doc = FiscalDocument.all_objects.create(
            tenant=ctx['tenant'],
            sale=ctx['sale'],
            status='PROCESSING',
        )

        poll_fiscal_document(doc)
        doc.refresh_from_db()

        assert doc.status == 'FAILED'
        assert 'ID do provedor' in doc.error_detail

    _run_in_tenant(ctx['tenant'], _test)
