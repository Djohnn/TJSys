"""Sprint 7 — E2E async test for RequestFiscalView.

Validates that the /api/v1/sales/{id}/request-fiscal/ endpoint:
1. Returns 201 Created immediately with fiscal_status = QUEUED
2. Does NOT call the external PlugNotas API synchronously
3. Enqueues the handle_sale_completed Celery task for async processing
"""

from unittest.mock import patch

import pytest

from tests.test_fiscal_services import _run_in_tenant


@pytest.mark.django_db
def test_request_fiscal_async_returns_queued_immediately(client, fiscal_sale_context, monkeypatch):
    """POST /request-fiscal/ returns 201 with QUEUED status without hitting PlugNotas."""
    from fiscal.models import FiscalDocument

    ctx = fiscal_sale_context
    client.force_login(ctx['user'])
    session = client.session
    session['mfa_tenant_id'] = str(ctx['tenant'].id)
    session['mfa_method'] = 'totp'
    session.save()
    monkeypatch.setattr('fiscal.tasks.handle_sale_completed.delay', lambda sale_id: None)

    # Spy on the PlugNotasAdapter.emit to ensure it's NOT called synchronously
    with patch('fiscal.adapters.plugnotas.PlugNotasAdapter.emit') as mock_emit:
        mock_emit.return_value = type('EmitResult', (), {'provider_document_id': 'test-001'})()

        response = client.post(
            f'/api/v1/sales/{ctx["sale"].id}/request-fiscal/',
            HTTP_X_TENANT_ID=str(ctx['tenant'].id),
        )

    assert response.status_code == 201
    data = response.json()
    assert data['fiscal_status'] == 'QUEUED'
    assert data['attempt'] == 1

    # Verify PlugNotas was NOT called synchronously
    mock_emit.assert_not_called()

    # Verify a FiscalDocument was created in QUEUED state
    doc = _run_in_tenant(
        ctx['tenant'],
        lambda: FiscalDocument.all_objects.filter(sale=ctx['sale'], is_active=True).first(),
    )
    assert doc is not None
    assert doc.status == FiscalDocument.STATUS_QUEUED
    assert doc.attempt_number == 1


@pytest.mark.django_db
def test_request_fiscal_async_creates_document_and_enqueues_task(
    client, fiscal_sale_context, monkeypatch
):
    """Verify Celery task is enqueued for async processing."""
    from fiscal.models import FiscalDocument
    from fiscal.tasks import handle_sale_completed

    ctx = fiscal_sale_context
    client.force_login(ctx['user'])
    session = client.session
    session['mfa_tenant_id'] = str(ctx['tenant'].id)
    session['mfa_method'] = 'totp'
    session.save()

    # Track if the task was called
    task_called = {}

    def mock_delay(sale_id):
        task_called['sale_id'] = sale_id
        return type('AsyncResult', (), {'id': 'test-task-id'})()

    monkeypatch.setattr(handle_sale_completed, 'delay', mock_delay)

    # Mock PlugNotas emit to verify it's not called in the view
    with patch('fiscal.adapters.plugnotas.PlugNotasAdapter.emit') as mock_emit:
        mock_emit.return_value = type('EmitResult', (), {'provider_document_id': 'test-001'})()

        response = client.post(
            f'/api/v1/sales/{ctx["sale"].id}/request-fiscal/',
            HTTP_X_TENANT_ID=str(ctx['tenant'].id),
        )

    assert response.status_code == 201
    data = response.json()
    assert data['fiscal_status'] == 'QUEUED'

    # Verify the Celery task was enqueued
    assert task_called.get('sale_id') == str(ctx['sale'].id)

    # Verify PlugNotas was NOT called in the view
    mock_emit.assert_not_called()

    # Verify document created
    doc = _run_in_tenant(
        ctx['tenant'],
        lambda: FiscalDocument.all_objects.filter(sale=ctx['sale'], is_active=True).first(),
    )
    assert doc is not None
    assert doc.status == FiscalDocument.STATUS_QUEUED


@pytest.mark.django_db
def test_request_fiscal_async_idempotent_returns_existing(client, fiscal_sale_context, monkeypatch):
    """Second request for same sale returns existing document (idempotent)."""
    from fiscal.models import FiscalDocument

    ctx = fiscal_sale_context
    client.force_login(ctx['user'])
    session = client.session
    session['mfa_tenant_id'] = str(ctx['tenant'].id)
    session['mfa_method'] = 'totp'
    session.save()
    monkeypatch.setattr('fiscal.tasks.handle_sale_completed.delay', lambda sale_id: None)

    with patch('fiscal.adapters.plugnotas.PlugNotasAdapter.emit') as mock_emit:
        mock_emit.return_value = type('EmitResult', (), {'provider_document_id': 'test-001'})()

        # First request
        response1 = client.post(
            f'/api/v1/sales/{ctx["sale"].id}/request-fiscal/',
            HTTP_X_TENANT_ID=str(ctx['tenant'].id),
        )
        assert response1.status_code == 201
        data1 = response1.json()
        assert data1['fiscal_status'] == 'QUEUED'

        # Second request should return same document
        response2 = client.post(
            f'/api/v1/sales/{ctx["sale"].id}/request-fiscal/',
            HTTP_X_TENANT_ID=str(ctx['tenant'].id),
        )
        assert response2.status_code == 201
        data2 = response2.json()
        assert data2['fiscal_status'] == 'QUEUED'
        assert data2['attempt'] == data1['attempt']

        # Only one document should exist
        docs = _run_in_tenant(
            ctx['tenant'],
            lambda: list(FiscalDocument.all_objects.filter(sale=ctx['sale'], is_active=True)),
        )
        assert len(docs) == 1

        # PlugNotas emit should still not be called (idempotent in view)
        mock_emit.assert_not_called()


@pytest.mark.django_db
def test_request_fiscal_async_rejected_for_non_confirmed_sale(client, fiscal_sale_context):
    """Request for non-confirmed sale returns 400."""
    from sales.models import Sale

    ctx = fiscal_sale_context
    client.force_login(ctx['user'])
    session = client.session
    session['mfa_tenant_id'] = str(ctx['tenant'].id)
    session['mfa_method'] = 'totp'
    session.save()

    # Change sale status to something other than confirmed
    _run_in_tenant(
        ctx['tenant'],
        lambda: Sale.all_objects.filter(id=ctx['sale'].id).update(status='draft'),
    )

    with patch('fiscal.adapters.plugnotas.PlugNotasAdapter.emit') as mock_emit:
        response = client.post(
            f'/api/v1/sales/{ctx["sale"].id}/request-fiscal/',
            HTTP_X_TENANT_ID=str(ctx['tenant'].id),
        )

    assert response.status_code == 400
    assert 'confirmadas' in response.json()['detail']
    mock_emit.assert_not_called()


@pytest.mark.django_db
def test_request_fiscal_async_handles_missing_sale(client, fiscal_sale_context):
    """Request for non-existent sale returns 404."""
    import uuid

    ctx = fiscal_sale_context
    client.force_login(ctx['user'])
    session = client.session
    session['mfa_tenant_id'] = str(ctx['tenant'].id)
    session['mfa_method'] = 'totp'
    session.save()

    with patch('fiscal.adapters.plugnotas.PlugNotasAdapter.emit') as mock_emit:
        response = client.post(
            f'/api/v1/sales/{uuid.uuid4()}/request-fiscal/',
            HTTP_X_TENANT_ID=str(ctx['tenant'].id),
        )

    assert response.status_code == 404
    assert 'não encontrada' in response.json()['detail']
    mock_emit.assert_not_called()


@pytest.mark.django_db
def test_worker_processes_queued_document_and_persists_provider_id(
    monkeypatch, fiscal_sale_context
):
    """Given QUEUED, the worker calls the provider and persists PROCESSING."""
    from fiscal.models import FiscalDocument, FiscalEmitter, FiscalProductConfig
    from fiscal.ports import EmitResult
    from fiscal.tasks import handle_sale_completed

    ctx = fiscal_sale_context
    calls = []

    def fake_emit(self, tenant, emitter, document, items, payments):
        calls.append(document.id)
        return EmitResult(provider_document_id='worker-nfce-001', raw_response={})

    monkeypatch.setattr('fiscal.adapters.plugnotas.PlugNotasAdapter.emit', fake_emit)

    def _run_worker():
        FiscalEmitter.all_objects.get_or_create(
            tenant=ctx['tenant'],
            branch=ctx['branch'],
            provider='plugnotas',
            defaults={
                'cpf_cnpj': '12345678000199',
                'registered_at_provider': True,
            },
        )
        FiscalProductConfig.all_objects.get_or_create(
            tenant=ctx['tenant'],
            product=ctx['product'],
            defaults={
                'cst_icms': '00',
                'cst_pis': '99',
                'cst_cofins': '07',
                'origem': '0',
            },
        )
        doc = FiscalDocument.all_objects.create(
            tenant=ctx['tenant'],
            sale=ctx['sale'],
            status=FiscalDocument.STATUS_QUEUED,
        )

        result = handle_sale_completed(str(ctx['sale'].id))
        doc.refresh_from_db()
        return result, doc

    result, doc = _run_in_tenant(ctx['tenant'], _run_worker)

    assert result == {'document_id': str(doc.id), 'status': FiscalDocument.STATUS_PROCESSING}
    assert calls == [doc.id]
    assert doc.provider_document_id == 'worker-nfce-001'


@pytest.mark.django_db
def test_request_fiscal_recovers_when_concurrent_create_wins(monkeypatch, fiscal_sale_context):
    """A unique-constraint race returns the winner instead of HTTP 500."""
    from django.db import IntegrityError

    from fiscal.models import FiscalDocument
    from fiscal.views import _get_or_create_active_fiscal_document

    ctx = fiscal_sale_context

    def _run_race():
        winner = FiscalDocument.all_objects.create(
            tenant=ctx['tenant'],
            sale=ctx['sale'],
            status=FiscalDocument.STATUS_QUEUED,
        )

        def concurrent_insert(*args, **kwargs):
            raise IntegrityError('unique_active_fiscal_document_per_sale')

        monkeypatch.setattr(FiscalDocument.all_objects, 'get_or_create', concurrent_insert)
        document, created = _get_or_create_active_fiscal_document(
            ctx['sale'], ctx['tenant']
        )
        return winner, document, created

    winner, document, created = _run_in_tenant(ctx['tenant'], _run_race)

    assert created is False
    assert document.id == winner.id
