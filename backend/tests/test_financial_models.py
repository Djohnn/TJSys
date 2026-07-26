from datetime import date
from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError, connection, transaction

from financial.models import (
    CashflowEntry,
    FinancialAccount,
    Payable,
    Receivable,
    Settlement,
)
from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Branch, Company, Tenant


def _run_in_tenant(tenant, callback):
    token = set_current_tenant_id(tenant.id)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SET app.current_tenant_id = %s', [str(tenant.id)])
        return callback()
    finally:
        reset_current_tenant_id(token)


@pytest.fixture
def financial_context():
    tenant = Tenant.objects.create(name='Financial Tenant', slug='financial-models')

    def _create():
        company = Company.all_objects.create(tenant=tenant, name='Financial Company')
        return Branch.all_objects.create(
            tenant=tenant,
            company=company,
            name='Financial Branch',
        )

    branch = _run_in_tenant(tenant, _create)
    return {'tenant': tenant, 'branch': branch}


@pytest.mark.django_db
def test_financial_core_models_are_tenant_scoped(financial_context):
    """Given financial facts, every record remains explicitly scoped to its tenant."""
    ctx = financial_context
    account = FinancialAccount.all_objects.create(
        tenant=ctx['tenant'],
        branch=ctx['branch'],
        name='Conta Movimento',
        account_type='bank',
    )
    receivable = Receivable.all_objects.create(
        tenant=ctx['tenant'],
        branch=ctx['branch'],
        description='Venda cartão',
        amount=Decimal('100.00'),
        due_date=date(2026, 7, 31),
        idempotency_key='receivable-1',
    )
    payable = Payable.all_objects.create(
        tenant=ctx['tenant'],
        branch=ctx['branch'],
        supplier_name='Fornecedor',
        amount=Decimal('40.00'),
        due_date=date(2026, 7, 25),
        idempotency_key='payable-1',
    )
    settlement = Settlement.all_objects.create(
        tenant=ctx['tenant'],
        account=account,
        receivable=receivable,
        amount=Decimal('25.00'),
        settled_on=date(2026, 7, 22),
        idempotency_key='settlement-1',
    )
    cashflow = CashflowEntry.all_objects.create(
        tenant=ctx['tenant'],
        branch=ctx['branch'],
        account=account,
        direction='inflow',
        status='realized',
        amount=Decimal('25.00'),
        effective_date=date(2026, 7, 22),
        source_type='settlement',
        source_id=settlement.id,
        idempotency_key='cashflow-1',
    )

    scoped_tenants = {
        account.tenant,
        receivable.tenant,
        payable.tenant,
        settlement.tenant,
        cashflow.tenant,
    }
    assert scoped_tenants == {
        ctx['tenant'],
    }


@pytest.mark.django_db
def test_financial_amounts_must_be_positive(financial_context):
    """When a zero-value financial fact is persisted, the database rejects it."""
    ctx = financial_context

    with pytest.raises(IntegrityError), transaction.atomic():
        Receivable.all_objects.create(
            tenant=ctx['tenant'],
            description='Inválido',
            amount=Decimal('0'),
            idempotency_key='zero-receivable',
        )


@pytest.mark.django_db
def test_idempotency_key_is_unique_per_tenant(financial_context):
    """When the same tenant reuses a key, the database rejects the duplicate fact."""
    ctx = financial_context
    Payable.all_objects.create(
        tenant=ctx['tenant'],
        supplier_name='Fornecedor A',
        amount=Decimal('10.00'),
        idempotency_key='same-payable-key',
    )

    with pytest.raises(IntegrityError), transaction.atomic():
        Payable.all_objects.create(
            tenant=ctx['tenant'],
            supplier_name='Fornecedor B',
            amount=Decimal('20.00'),
            idempotency_key='same-payable-key',
        )


@pytest.mark.django_db
def test_settlement_targets_exactly_one_obligation(financial_context):
    """A settlement cannot target both a payable and a receivable."""
    ctx = financial_context
    payable = Payable.all_objects.create(
        tenant=ctx['tenant'],
        supplier_name='Fornecedor',
        amount=Decimal('10.00'),
    )
    receivable = Receivable.all_objects.create(
        tenant=ctx['tenant'],
        description='Cliente',
        amount=Decimal('10.00'),
    )

    with pytest.raises(IntegrityError), transaction.atomic():
        Settlement.all_objects.create(
            tenant=ctx['tenant'],
            payable=payable,
            receivable=receivable,
            amount=Decimal('10.00'),
            settled_on=date(2026, 7, 22),
        )


@pytest.mark.django_db
def test_confirmed_settlement_is_immutable(financial_context):
    """When a settlement is confirmed, corrections require a new adjustment record."""
    ctx = financial_context
    receivable = Receivable.all_objects.create(
        tenant=ctx['tenant'],
        description='Cliente',
        amount=Decimal('10.00'),
    )
    settlement = Settlement.all_objects.create(
        tenant=ctx['tenant'],
        receivable=receivable,
        amount=Decimal('10.00'),
        settled_on=date(2026, 7, 22),
    )
    settlement.amount = Decimal('9.00')

    with pytest.raises(ValidationError):
        settlement.save()
