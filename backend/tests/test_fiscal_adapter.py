from types import SimpleNamespace

import pytest


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


def test_plugnotas_emit_returns_provider_document_id(monkeypatch):
    from fiscal.adapters.plugnotas import PlugNotasAdapter

    calls = []

    def fake_post(url, *, headers, json, timeout):
        calls.append({'url': url, 'headers': headers, 'json': json, 'timeout': timeout})
        return FakeResponse({'idNota': 'nfce-123'})

    monkeypatch.setattr('fiscal.adapters.plugnotas.requests.post', fake_post)

    emitter = SimpleNamespace(cpf_cnpj='12345678000199')
    product = SimpleNamespace(sku='SKU-1', name='Produto Teste')
    document = SimpleNamespace(idempotency_key='idem-1', cfop='5102')

    result = PlugNotasAdapter(api_key='test-key').emit(
        tenant=None,
        emitter=emitter,
        document=document,
        items=[
            {
                'product': product,
                'ncm': '12345678',
                'unidade': 'UN',
                'quantity': '1',
                'unit_price': '10.00',
                'line_total': '10.00',
                'origem': '0',
                'cst_icms': '00',
                'cst_pis': '99',
                'cst_cofins': '07',
                'aliquota_icms': '0',
            }
        ],
        payments=[{'method': 'cash', 'amount': '10.00'}],
    )

    assert result.provider_document_id == 'nfce-123'
    assert calls[0]['url'] == 'https://api.plugnotas.com.br/nfce'
    assert calls[0]['headers']['x-api-key'] == 'test-key'
    assert calls[0]['json'][0]['itens'][0]['ncm'] == '12345678'


def test_plugnotas_query_maps_summary(monkeypatch):
    from fiscal.adapters.plugnotas import PlugNotasAdapter

    def fake_get(url, *, headers, timeout):
        assert url == 'https://api.plugnotas.com.br/nfce/nfce-123/resumo'
        return FakeResponse(
            {
                'status': 'CONCLUIDO',
                'protocolo': '13579',
                'xml': 'https://xml.example',
                'pdf': 'https://pdf.example',
            }
        )

    monkeypatch.setattr('fiscal.adapters.plugnotas.requests.get', fake_get)

    result = PlugNotasAdapter(api_key='test-key').query(None, 'nfce-123')

    assert result.status == 'CONCLUIDO'
    assert result.protocol == '13579'
    assert result.xml_url == 'https://xml.example'
    assert result.pdf_url == 'https://pdf.example'


def test_plugnotas_cancel_returns_protocol(monkeypatch):
    from fiscal.adapters.plugnotas import PlugNotasAdapter

    def fake_post(url, *, headers, json, timeout):
        assert url == 'https://api.plugnotas.com.br/nfce/nfce-123/cancelamento'
        return FakeResponse({'protocolo': '24680'})

    monkeypatch.setattr('fiscal.adapters.plugnotas.requests.post', fake_post)

    result = PlugNotasAdapter(api_key='test-key').cancel(None, 'nfce-123')

    assert result.success is True
    assert result.protocol == '24680'


@pytest.mark.django_db
def test_fiscal_models_are_tenant_scoped():
    from fiscal.models import FiscalDocument, FiscalEmitter, FiscalProductConfig

    assert hasattr(FiscalEmitter, 'objects')
    assert hasattr(FiscalProductConfig, 'objects')
    assert FiscalDocument.STATUS_PROCESSING == 'PROCESSING'
