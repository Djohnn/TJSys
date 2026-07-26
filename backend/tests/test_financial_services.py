from datetime import date
from decimal import Decimal

import pytest

from financial.models import CashflowEntry, Payable, Receivable, Settlement
from financial.services import (
    OverSettlementError,
    record_sale_financial_effects,
    settle_payable,
    settle_receivable,
)
from sales.models import SalePayment


@pytest.mark.django_db
def test_confirmed_sale_records_financial_effects_automatically(sale_context):
    """When a sale is confirmed, its payment shall already exist in the financial ledger."""
    ctx = sale_context

    receivables = Receivable.all_objects.filter(
        tenant=ctx['tenant'],
        source_type='sale_payment',
    )

    assert receivables.count() == 1
    assert receivables.get().amount == ctx['sale'].net_total


@pytest.mark.django_db
def test_card_sale_creates_expected_receivable_and_forecast_cashflow(sale_context):
    """When a card sale is recorded, finance shall forecast its external settlement."""
    ctx = sale_context
    CashflowEntry.all_objects.filter(tenant=ctx['tenant']).delete()
    Settlement.all_objects.filter(tenant=ctx['tenant']).delete()
    Receivable.all_objects.filter(tenant=ctx['tenant']).delete()
    payment = SalePayment.all_objects.get(tenant=ctx['tenant'], sale=ctx['sale'])
    payment.method = 'card_external'
    payment.save(update_fields=['method'])

    receivables = record_sale_financial_effects(
        tenant=ctx['tenant'],
        sale=ctx['sale'],
    )

    assert len(receivables) == 1
    assert receivables[0].status == 'pending'
    assert receivables[0].amount == Decimal('20.00')
    entry = CashflowEntry.all_objects.get(source_id=receivables[0].id)
    assert entry.status == 'forecast'
    assert entry.direction == 'inflow'


@pytest.mark.django_db
def test_cash_sale_creates_realized_receivable_and_settlement(sale_context):
    """When a cash sale is recorded, finance shall realize it immediately."""
    ctx = sale_context

    receivable = record_sale_financial_effects(
        tenant=ctx['tenant'],
        sale=ctx['sale'],
    )[0]

    receivable.refresh_from_db()
    assert receivable.status == 'settled'
    assert Settlement.all_objects.filter(receivable=receivable).count() == 1
    assert CashflowEntry.all_objects.get(source_id=receivable.id).status == 'realized'


@pytest.mark.django_db
def test_settle_payable_partially_and_block_over_settlement(sale_context):
    """When a payable is partially settled, finance shall preserve its remaining balance."""
    ctx = sale_context
    payable = Payable.all_objects.create(
        tenant=ctx['tenant'],
        branch=ctx['branch'],
        supplier_name='Fornecedor',
        amount=Decimal('100.00'),
    )

    settlement = settle_payable(
        tenant=ctx['tenant'],
        payable=payable,
        amount=Decimal('40.00'),
        settled_on=date(2026, 7, 22),
        idempotency_key='settle-payable-1',
    )

    payable.refresh_from_db()
    assert settlement.amount == Decimal('40.00')
    assert payable.status == 'partially_settled'

    with pytest.raises(OverSettlementError):
        settle_payable(
            tenant=ctx['tenant'],
            payable=payable,
            amount=Decimal('61.00'),
            settled_on=date(2026, 7, 22),
            idempotency_key='settle-payable-over',
        )


@pytest.mark.django_db
def test_settle_receivable_fully(sale_context):
    """When the full balance is received, finance shall mark the receivable settled."""
    ctx = sale_context
    receivable = Receivable.all_objects.create(
        tenant=ctx['tenant'],
        branch=ctx['branch'],
        description='Cliente',
        amount=Decimal('75.00'),
    )

    settle_receivable(
        tenant=ctx['tenant'],
        receivable=receivable,
        amount=Decimal('75.00'),
        settled_on=date(2026, 7, 22),
        idempotency_key='settle-receivable-1',
    )

    receivable.refresh_from_db()
    assert receivable.status == 'settled'
