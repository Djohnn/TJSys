from datetime import date
from decimal import Decimal

import pytest

from financial.models import CashflowEntry
from financial.services import cashflow_projection


@pytest.mark.django_db
def test_cashflow_projection_separates_realized_and_forecast(sale_context):
    """When a period is queried, realized and forecast balances shall remain separate."""
    ctx = sale_context
    realized_entry = CashflowEntry.all_objects.get(
        tenant=ctx['tenant'],
        branch=ctx['branch'],
        direction='inflow',
        status='realized',
    )
    period_date = realized_entry.effective_date
    CashflowEntry.all_objects.create(
        tenant=ctx['tenant'],
        branch=ctx['branch'],
        direction='outflow',
        status='forecast',
        amount=Decimal('7.50'),
        effective_date=period_date,
        source_type='manual_test',
    )

    result = cashflow_projection(
        tenant=ctx['tenant'],
        branch=ctx['branch'],
        date_from=period_date,
        date_to=period_date,
    )

    assert result['realized_inflow'] == Decimal('20.00')
    assert result['realized_outflow'] == Decimal('0.00')
    assert result['forecast_outflow'] == Decimal('7.50')
    assert result['realized_balance'] == Decimal('20.00')
    assert result['forecast_balance'] == Decimal('-7.50')


@pytest.mark.django_db
def test_cashflow_projection_excludes_other_branch(sale_context):
    """Given another branch's entry, the branch projection shall not expose it."""
    ctx = sale_context

    result = cashflow_projection(
        tenant=ctx['tenant'],
        branch=ctx['branch'],
        date_from=date(2027, 1, 1),
        date_to=date(2027, 1, 31),
    )

    assert result['entries'] == []
