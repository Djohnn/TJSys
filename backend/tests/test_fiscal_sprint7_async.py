"""Sprint 7 — E2E async test for RequestFiscalView.

Validates that the /api/v1/sales/{id}/request-fiscal/ endpoint:
1. Returns 201 Created immediately with fiscal_status = QUEUED
2. Does NOT call the external PlugNotas API synchronously
3. Enqueues the handle_sale_completed Celery task for async processing
"""

import json
from unittest.mock import patch

import pytest
from django.utils import timezone

from tests.test_fiscal_services import _run_in_tenant


@pytest.mark.django_db
def test_request_fiscal_async_returns_queued_immediately(client, fiscal_sale_context):
    """POST /request-fiscal/ returns 201 with QUEUED status without hitting PlugNotas."""
    from fiscal.models import FiscalDocument

    ctx = fiscal_sale_context
    client.force_login(ctx['user'])
    session = client.session
    session['mfa_tenant_id'] = str(ctx['tenant'].id)
    session['mfa_method'] = 'totp'
    session.save()

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
def test_request_fiscal_async_creates_document_and_enqueues_task(client, fiscal_sale_context, monkeypatch):
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
def test_request_fiscal_async_idempotent_returns_existing(client, fiscal_sale_context):
    """Second request for same sale returns existing document (idempotent)."""
    from fiscal.models import FiscalDocument

    ctx = fiscal_sale_context
    client.force_login(ctx['user'])
    session = client.session
    session['mfa_tenant_id'] = str(ctx['tenant'].id)
    session['mfa_method'] = 'totp'
    session.save()

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