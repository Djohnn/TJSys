import json

import pytest

from tests.test_fiscal_services import _run_in_tenant


@pytest.mark.django_db
def test_fiscal_status_returns_latest_attempt(client, fiscal_sale_context):
    from fiscal.models import FiscalDocument

    ctx = fiscal_sale_context
    client.force_login(ctx['user'])
    session = client.session
    session['mfa_tenant_id'] = str(ctx['tenant'].id)
    session['mfa_method'] = 'totp'
    session.save()

    def _create_docs():
        FiscalDocument.all_objects.create(
            tenant=ctx['tenant'],
            sale=ctx['sale'],
            status='REJECTED',
            attempt_number=1,
            is_active=False,
            error_detail='Erro anterior',
        )
        FiscalDocument.all_objects.create(
            tenant=ctx['tenant'],
            sale=ctx['sale'],
            status='CONCLUDED',
            attempt_number=2,
            protocol='12345',
        )

    _run_in_tenant(ctx['tenant'], _create_docs)

    response = client.get(
        f'/api/v1/sales/{ctx["sale"].id}/fiscal-status/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )

    assert response.status_code == 200
    assert response.json()['fiscal_status'] == 'CONCLUDED'
    assert response.json()['attempt'] == 2
    assert response.json()['protocol'] == '12345'


@pytest.mark.django_db
def test_fiscal_status_returns_404_when_document_does_not_exist(client, fiscal_sale_context):
    ctx = fiscal_sale_context
    client.force_login(ctx['user'])
    session = client.session
    session['mfa_tenant_id'] = str(ctx['tenant'].id)
    session['mfa_method'] = 'totp'
    session.save()

    response = client.get(
        f'/api/v1/sales/{ctx["sale"].id}/fiscal-status/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )

    assert response.status_code == 404


def test_fiscal_webhook_rejects_invalid_json(client):
    response = client.post(
        '/api/v1/fiscal/webhook/',
        data='{',
        content_type='application/json',
    )

    assert response.status_code == 400
    assert response.json()['error'] == 'invalid json'


def test_fiscal_webhook_rejects_missing_provider_id(client):
    response = client.post(
        '/api/v1/fiscal/webhook/',
        data=json.dumps({'status': 'CONCLUIDO'}),
        content_type='application/json',
    )

    assert response.status_code == 400
    assert response.json()['error'] == 'missing idNota'


@pytest.mark.django_db
def test_fiscal_webhook_ignores_unknown_provider_document(client):
    response = client.post(
        '/api/v1/fiscal/webhook/',
        data=json.dumps({'idNota': 'unknown'}),
        content_type='application/json',
    )

    assert response.status_code == 200


@pytest.mark.django_db
def test_fiscal_webhook_queries_provider_instead_of_trusting_body(
    monkeypatch,
    client,
    fiscal_sale_context,
):
    from fiscal.models import FiscalDocument
    from fiscal.ports import QueryResult

    ctx = fiscal_sale_context

    def fake_query(self, tenant, provider_document_id):
        assert provider_document_id == 'nfce-123'
        return QueryResult(
            status='CONCLUIDO',
            protocol='real-protocol',
            xml_url=None,
            pdf_url=None,
            error_reason=None,
        )

    monkeypatch.setattr('fiscal.adapters.plugnotas.PlugNotasAdapter.query', fake_query)

    def _create_doc():
        return FiscalDocument.all_objects.create(
            tenant=ctx['tenant'],
            sale=ctx['sale'],
            status='PROCESSING',
            provider_document_id='nfce-123',
        )

    doc = _run_in_tenant(ctx['tenant'], _create_doc)

    response = client.post(
        '/api/v1/fiscal/webhook/',
        data=json.dumps({'idNota': 'nfce-123', 'status': 'REJEITADO'}),
        content_type='application/json',
    )

    assert response.status_code == 200
    doc.refresh_from_db()
    assert doc.status == 'CONCLUDED'
    assert doc.protocol == 'real-protocol'
    assert doc.webhook_received_at is not None


@pytest.mark.django_db
def test_request_fiscal_creates_document(monkeypatch, client, fiscal_sale_context):
    from fiscal.models import FiscalDocument
    from fiscal.ports import EmitResult

    ctx = fiscal_sale_context
    client.force_login(ctx['user'])
    session = client.session
    session['mfa_tenant_id'] = str(ctx['tenant'].id)
    session['mfa_method'] = 'totp'
    session.save()

    def fake_emit(self, tenant, emitter, document, items, payments):
        return EmitResult(provider_document_id='nfce-test-001', raw_response={})

    monkeypatch.setattr('fiscal.adapters.plugnotas.PlugNotasAdapter.emit', fake_emit)

    response = client.post(
        f'/api/v1/sales/{ctx["sale"].id}/request-fiscal/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 201
    data = response.json()
    assert data['fiscal_status'] in ('PENDING', 'PROCESSING')

    doc = FiscalDocument.all_objects.filter(sale=ctx['sale'], is_active=True).first()
    assert doc is not None


@pytest.mark.django_db
def test_request_fiscal_returns_existing_document(client, fiscal_sale_context):
    from fiscal.services import emit_nfce

    ctx = fiscal_sale_context
    client.force_login(ctx['user'])
    session = client.session
    session['mfa_tenant_id'] = str(ctx['tenant'].id)
    session['mfa_method'] = 'totp'
    session.save()

    doc = emit_nfce(ctx['sale'], ctx['tenant'])

    response = client.post(
        f'/api/v1/sales/{ctx["sale"].id}/request-fiscal/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 201
    data = response.json()
    assert data['attempt'] == doc.attempt_number


@pytest.mark.django_db
def test_request_fiscal_404_for_nonexistent_sale(client, fiscal_sale_context):
    import uuid

    ctx = fiscal_sale_context
    client.force_login(ctx['user'])
    session = client.session
    session['mfa_tenant_id'] = str(ctx['tenant'].id)
    session['mfa_method'] = 'totp'
    session.save()

    response = client.post(
        f'/api/v1/sales/{uuid.uuid4()}/request-fiscal/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 404


@pytest.mark.django_db
def test_fiscal_config_returns_true_when_emitter_exists(client, fiscal_sale_context):
    ctx = fiscal_sale_context
    client.force_login(ctx['user'])

    response = client.get(
        f'/api/v1/fiscal/config/?branch={ctx["branch"].id}',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    data = response.json()
    assert data['has_fiscal_config'] is True
    assert data['emitter_id'] is not None


@pytest.mark.django_db
def test_fiscal_config_returns_false_when_no_emitter(client, fiscal_sale_context):
    from fiscal.models import FiscalEmitter

    ctx = fiscal_sale_context
    client.force_login(ctx['user'])

    FiscalEmitter.all_objects.filter(branch=ctx['branch']).update(registered_at_provider=False)

    response = client.get(
        f'/api/v1/fiscal/config/?branch={ctx["branch"].id}',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    data = response.json()
    assert data['has_fiscal_config'] is False
    assert data['emitter_id'] is None
