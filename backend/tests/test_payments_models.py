"""Sprint 13 payment model scenarios (Given/When/Then)."""

from decimal import Decimal

import pytest
from django.db import IntegrityError, transaction


@pytest.mark.django_db(transaction=True)
def test_payment_intent_idempotency_is_tenant_scoped(tenant_alpha, tenant_beta):
    """Given an idempotency key, when reused, then only the same tenant is blocked."""
    from payments.models import PaymentIntent, PaymentProviderConfig

    alpha = PaymentProviderConfig.all_objects.create(
        tenant=tenant_alpha, provider='fake', secret='alpha-secret'
    )
    beta = PaymentProviderConfig.all_objects.create(
        tenant=tenant_beta, provider='fake', secret='beta-secret'
    )
    PaymentIntent.all_objects.create(
        tenant=tenant_alpha,
        provider_config=alpha,
        amount=Decimal('10.00'),
        idempotency_key='intent-1',
    )
    PaymentIntent.all_objects.create(
        tenant=tenant_beta,
        provider_config=beta,
        amount=Decimal('10.00'),
        idempotency_key='intent-1',
    )
    with pytest.raises(IntegrityError), transaction.atomic():
        PaymentIntent.all_objects.create(
            tenant=tenant_alpha,
            provider_config=alpha,
            amount=Decimal('20.00'),
            idempotency_key='intent-1',
        )


@pytest.mark.django_db(transaction=True)
def test_provider_transaction_and_webhook_references_are_unique(tenant_alpha):
    """Given provider references, when replayed, then duplicates are rejected."""
    from payments.models import (
        PaymentIntent,
        PaymentProviderConfig,
        PaymentTransaction,
        PaymentWebhookEvent,
    )

    config = PaymentProviderConfig.all_objects.create(
        tenant=tenant_alpha, provider='fake', secret='restricted'
    )
    intent = PaymentIntent.all_objects.create(
        tenant=tenant_alpha,
        provider_config=config,
        amount=Decimal('50.00'),
        idempotency_key='intent-2',
    )
    PaymentTransaction.all_objects.create(
        tenant=tenant_alpha,
        intent=intent,
        transaction_type='capture',
        gross_amount=Decimal('50.00'),
        provider_reference='txn-1',
    )
    PaymentWebhookEvent.all_objects.create(
        tenant=tenant_alpha, provider='fake', external_id='evt-1', payload={}
    )
    with pytest.raises(IntegrityError), transaction.atomic():
        PaymentTransaction.all_objects.create(
            tenant=tenant_alpha,
            intent=intent,
            transaction_type='capture',
            gross_amount=Decimal('50.00'),
            provider_reference='txn-1',
        )
    with pytest.raises(IntegrityError), transaction.atomic():
        PaymentWebhookEvent.all_objects.create(
            tenant=tenant_alpha, provider='fake', external_id='evt-1', payload={}
        )


@pytest.mark.django_db
def test_reconciliation_item_exposes_net_difference(tenant_alpha):
    """Given gross, fee and settled amounts, then difference is explicit."""
    from payments.models import PaymentReconciliationBatch, PaymentReconciliationItem

    batch = PaymentReconciliationBatch.all_objects.create(tenant=tenant_alpha, provider='fake')
    item = PaymentReconciliationItem.all_objects.create(
        tenant=tenant_alpha,
        batch=batch,
        provider_reference='txn-2',
        gross_amount=Decimal('100.00'),
        fee_amount=Decimal('3.00'),
        settled_amount=Decimal('96.00'),
    )
    assert item.expected_net_amount == Decimal('97.00')
    assert item.difference_amount == Decimal('-1.00')
