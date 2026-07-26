"""Sprint 13 reconciliation scenarios (Given/When/Then)."""

from decimal import Decimal

import pytest


def _captured_payment(ctx, *, fee=Decimal('3.00')):
    from payments.models import PaymentProviderConfig
    from payments.services import capture_payment, create_payment_intent

    config = PaymentProviderConfig.all_objects.create(
        tenant=ctx['tenant'], provider='fake', secret='secret'
    )
    intent = create_payment_intent(
        tenant=ctx['tenant'],
        sale=ctx['sale'],
        provider_config=config,
        idempotency_key='reconcile-intent',
        actor=ctx['user'],
    )
    transaction = capture_payment(intent=intent, actor=ctx['user'])
    transaction.fee_amount = fee
    transaction.net_amount = transaction.gross_amount - fee
    transaction.save(update_fields=['fee_amount', 'net_amount', 'updated_at'])
    return transaction


@pytest.mark.django_db
def test_reconciliation_confirms_gross_fee_and_net_settlement(sale_context):
    """Given matching settlement, when confirmed, then fee effect is recorded."""
    from financial.models import CashflowEntry
    from payments.models import PaymentReconciliationItem
    from payments.services import confirm_reconciliation, import_reconciliation_batch

    ctx = sale_context
    transaction = _captured_payment(ctx)
    batch = import_reconciliation_batch(
        tenant=ctx['tenant'],
        provider='fake',
        rows=[
            {
                'provider_reference': transaction.provider_reference,
                'gross_amount': '20.00',
                'fee_amount': '3.00',
                'settled_amount': '17.00',
            }
        ],
    )
    confirm_reconciliation(batch=batch, actor=ctx['user'])

    item = PaymentReconciliationItem.all_objects.get(batch=batch)
    assert item.status == 'matched'
    assert item.difference_amount == Decimal('0.00')
    assert CashflowEntry.all_objects.filter(
        tenant=ctx['tenant'], source_type='payment_fee', amount=Decimal('3.00')
    ).exists()


@pytest.mark.django_db
def test_reconciliation_divergence_requires_manual_review(sale_context):
    """Given a net divergence, when imported, then confirmation is blocked."""
    from payments.models import PaymentReconciliationItem
    from payments.services import (
        ReconciliationDivergence,
        confirm_reconciliation,
        import_reconciliation_batch,
    )

    ctx = sale_context
    transaction = _captured_payment(ctx)
    batch = import_reconciliation_batch(
        tenant=ctx['tenant'],
        provider='fake',
        rows=[
            {
                'provider_reference': transaction.provider_reference,
                'gross_amount': '20.00',
                'fee_amount': '3.00',
                'settled_amount': '16.00',
            }
        ],
    )
    item = PaymentReconciliationItem.all_objects.get(batch=batch)
    assert item.status == 'divergent'
    assert item.difference_amount == Decimal('-1.00')
    with pytest.raises(ReconciliationDivergence):
        confirm_reconciliation(batch=batch, actor=ctx['user'])
