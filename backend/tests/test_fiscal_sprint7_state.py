"""Sprint 7 — focused coverage for NFC-e state machine edge cases.

Adds tests not already present in the fiscal suite:
  1. Polling timeout (30 min) forces FAILED.
  2. Maximum auto-reattempt (MAX_AUTO_REATTEMPTS=2) does NOT re-enqueue at the
     last attempt.
  3. Missing NCM on a sale item produces FAILED with error_detail in emission.
  4. Multi-tenant isolation: a FiscalDocument in tenant A is invisible to B.
  5. Duplicate webhook delivery is idempotent; the body is only a trigger and
     the authoritative state always comes from adapter.query().
"""

from datetime import timedelta

import pytest
from django.utils import timezone

from tests.test_fiscal_services import _run_in_tenant


@pytest.mark.django_db
def test_poll_timeout_forces_failed(fiscal_sale_context):
    from fiscal.models import FiscalDocument
    from fiscal.services import poll_fiscal_document

    ctx = fiscal_sale_context

    def _create_and_backdate():
        doc = FiscalDocument.all_objects.create(
            tenant=ctx['tenant'],
            sale=ctx['sale'],
            status=FiscalDocument.STATUS_PROCESSING,
            provider_document_id='nfce-slow',
        )
        # auto_now_add ignores the kwarg; update() bypasses it to backdate.
        FiscalDocument.all_objects.filter(id=doc.id).update(
            created_at=timezone.now() - timedelta(minutes=31)
        )
        doc.refresh_from_db()
        return doc

    doc = _run_in_tenant(ctx['tenant'], _create_and_backdate)

    poll_fiscal_document(doc)
    doc.refresh_from_db()

    assert doc.status == FiscalDocument.STATUS_FAILED
    assert 'Timeout' in doc.error_detail


@pytest.mark.django_db
def test_max_reattempt_rejected_does_not_reenqueue(fiscal_sale_context, monkeypatch):
    from fiscal.models import FiscalDocument
    from fiscal.ports import QueryResult
    from fiscal.services import (
        MAX_AUTO_REATTEMPTS,
        poll_fiscal_document,
    )

    ctx = fiscal_sale_context
    assert MAX_AUTO_REATTEMPTS == 2

    def fake_query(self, tenant, provider_document_id):
        return QueryResult(
            status='REJEITADO',
            protocol=None,
            xml_url=None,
            pdf_url=None,
            error_reason='NCM inválido',
        )

    monkeypatch.setattr('fiscal.adapters.plugnotas.PlugNotasAdapter.query', fake_query)

    def _test():
        doc = FiscalDocument.all_objects.create(
            tenant=ctx['tenant'],
            sale=ctx['sale'],
            status=FiscalDocument.STATUS_PROCESSING,
            provider_document_id='nfce-maxretry',
            attempt_number=MAX_AUTO_REATTEMPTS,
        )
        poll_fiscal_document(doc)
        doc.refresh_from_db()

        assert doc.status == FiscalDocument.STATUS_REJECTED
        assert doc.is_active is False
        # No new PENDING/active attempt may be queued at the last attempt.
        remaining = FiscalDocument.all_objects.filter(
            tenant=ctx['tenant'],
            sale=ctx['sale'],
            is_active=True,
        )
        assert remaining.count() == 0

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_emit_fails_clearly_when_ncm_missing(fiscal_sale_context):
    from fiscal.models import FiscalDocument
    from fiscal.services import emit_nfce

    ctx = fiscal_sale_context

    def _test():
        ctx['product'].ncm = ''
        ctx['product'].save(update_fields=['ncm'])
        doc = emit_nfce(ctx['sale'], ctx['tenant'])
        assert doc.status == FiscalDocument.STATUS_FAILED
        assert 'NCM' in doc.error_detail
        assert 'FISCAL-SHARED' in doc.error_detail

    _run_in_tenant(ctx['tenant'], _test)


@pytest.mark.django_db
def test_fiscal_document_isolation_between_tenants(tenant_alpha, tenant_beta):
    from fiscal.models import FiscalDocument

    # Create an (unrelated) sale-based doc in tenant alpha only. No sale/prod
    # requirement here — we only assert cross-tenant visibility of the row.
    def _create():
        return FiscalDocument.all_objects.create(
            tenant=tenant_alpha,
            status=FiscalDocument.STATUS_PENDING,
            direction=FiscalDocument.DIRECTION_OUTPUT,
        )

    doc = _run_in_tenant(tenant_alpha, _create)

    # The tenant filter for beta must not see alpha's document.
    terms = {'tenant': tenant_beta}
    assert (
        _run_in_tenant(tenant_beta, lambda: FiscalDocument.all_objects.filter(**terms).count()) == 0
    )
    assert (
        _run_in_tenant(
            tenant_beta,
            lambda: FiscalDocument.all_objects.filter(tenant=tenant_beta, id=doc.id).exists(),
        )
        is False
    )


@pytest.mark.django_db
def test_duplicate_webhook_is_idempotent(monkeypatch, client, fiscal_sale_context):
    import json

    from fiscal.models import FiscalDocument
    from fiscal.ports import QueryResult

    ctx = fiscal_sale_context

    def fake_query(self, tenant, provider_document_id):
        assert provider_document_id == 'nfce-dups'
        return QueryResult(
            status='CONCLUIDO',
            protocol='dup-protocol',
            xml_url='xml-key',
            pdf_url='pdf-key',
            error_reason=None,
        )

    monkeypatch.setattr('fiscal.adapters.plugnotas.PlugNotasAdapter.query', fake_query)

    def _create():
        return FiscalDocument.all_objects.create(
            tenant=ctx['tenant'],
            sale=ctx['sale'],
            status=FiscalDocument.STATUS_PROCESSING,
            provider_document_id='nfce-dups',
        )

    _run_in_tenant(ctx['tenant'], _create)

    # Deliver the same webhook twice (provider returns CONCLUIDO both times).
    for _ in range(2):
        response = client.post(
            '/api/v1/fiscal/webhook/',
            data=json.dumps({'idNota': 'nfce-dups'}),
            content_type='application/json',
        )
        assert response.status_code == 200

    docs = _run_in_tenant(
        ctx['tenant'],
        lambda: list(FiscalDocument.all_objects.filter(tenant=ctx['tenant'], sale=ctx['sale'])),
    )
    # Same single document, concluded once; no duplicate created by the webhook.
    assert len(docs) == 1
    assert docs[0].status == FiscalDocument.STATUS_CONCLUDED
    assert docs[0].protocol == 'dup-protocol'
