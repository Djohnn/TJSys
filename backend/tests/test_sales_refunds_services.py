from decimal import Decimal

import pytest
from django.db import connection

from audit.models import AuditRecord
from outbox.models import OutboxMessage
from sales.models import CashMovement, Sale, SaleRefund, SaleReturn
from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Tenant


def _run_in_tenant(tenant, callback):
    token = set_current_tenant_id(tenant.id)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SET app.current_tenant_id = %s', [str(tenant.id)])
        return callback()
    finally:
        reset_current_tenant_id(token)


def _attempt_artifacts(tenant, idempotency_key):
    return {
        'refunds': SaleRefund.all_objects.filter(
            tenant=tenant,
            idempotency_key=idempotency_key,
        ).count(),
        'cash_outs': CashMovement.all_objects.filter(
            tenant=tenant,
            movement_type='cash_out',
        ).count(),
        'audits': AuditRecord.objects.filter(
            tenant_id=str(tenant.id),
            action='sales.refund.created',
            correlation_id=idempotency_key,
        ).count(),
        'outbox': OutboxMessage.objects.filter(
            tenant_id=str(tenant.id),
            event_type='sales.refund.created',
            correlation_id=idempotency_key,
        ).count(),
    }


@pytest.mark.django_db
class TestSaleRefundService:
    @pytest.mark.parametrize('method', ['bank_transfer', '', None])
    def test_rejects_invalid_method_without_side_effects(self, sale_context, method):
        """Given an invalid method, when refunding, then no compensation artifact is saved."""
        ctx = sale_context
        key = f'refund-invalid-method-{method}'

        def _test():
            from sales.services import create_sale_refund

            before = _attempt_artifacts(ctx['tenant'], key)
            balance_before = ctx['sale'].cash_session.expected_amount

            with pytest.raises(ValueError, match='Refund method is invalid'):
                create_sale_refund(
                    tenant=ctx['tenant'],
                    sale=ctx['sale'],
                    method=method,
                    amount=Decimal('10.00'),
                    reason='Produto avariado',
                    idempotency_key=key,
                )

            ctx['sale'].cash_session.refresh_from_db()
            assert _attempt_artifacts(ctx['tenant'], key) == before
            assert ctx['sale'].cash_session.expected_amount == balance_before

        _run_in_tenant(ctx['tenant'], _test)

    @pytest.mark.parametrize('amount', [Decimal('0.00'), Decimal('-0.01')])
    def test_rejects_non_positive_amount_without_side_effects(self, sale_context, amount):
        """Given a non-positive amount, when refunding, then no side effect is committed."""
        ctx = sale_context
        key = f'refund-invalid-amount-{amount}'

        def _test():
            from sales.services import create_sale_refund

            before = _attempt_artifacts(ctx['tenant'], key)
            balance_before = ctx['sale'].cash_session.expected_amount

            with pytest.raises(ValueError, match='Refund amount must be positive'):
                create_sale_refund(
                    tenant=ctx['tenant'],
                    sale=ctx['sale'],
                    method='cash',
                    amount=amount,
                    reason='Produto avariado',
                    idempotency_key=key,
                )

            ctx['sale'].cash_session.refresh_from_db()
            assert _attempt_artifacts(ctx['tenant'], key) == before
            assert ctx['sale'].cash_session.expected_amount == balance_before

        _run_in_tenant(ctx['tenant'], _test)

    def test_rejects_blank_reason_without_side_effects(self, sale_context):
        """Given a whitespace reason, when refunding, then no side effect is committed."""
        ctx = sale_context
        key = 'refund-blank-reason'

        def _test():
            from sales.services import create_sale_refund

            before = _attempt_artifacts(ctx['tenant'], key)

            with pytest.raises(ValueError, match='Reason is required'):
                create_sale_refund(
                    tenant=ctx['tenant'],
                    sale=ctx['sale'],
                    method='pix',
                    amount=Decimal('10.00'),
                    reason='   ',
                    idempotency_key=key,
                )

            assert _attempt_artifacts(ctx['tenant'], key) == before

        _run_in_tenant(ctx['tenant'], _test)

    def test_rejects_amount_above_sale_net_total_without_side_effects(self, sale_context):
        """Given no prior refund, when amount exceeds net total, then it is rejected atomically."""
        ctx = sale_context
        key = 'refund-above-total'

        def _test():
            from sales.services import RefundAmountExceeded, create_sale_refund

            before = _attempt_artifacts(ctx['tenant'], key)
            balance_before = ctx['sale'].cash_session.expected_amount

            with pytest.raises(RefundAmountExceeded):
                create_sale_refund(
                    tenant=ctx['tenant'],
                    sale=ctx['sale'],
                    method='cash',
                    amount=Decimal('20.01'),
                    reason='Produto avariado',
                    idempotency_key=key,
                )

            ctx['sale'].cash_session.refresh_from_db()
            assert _attempt_artifacts(ctx['tenant'], key) == before
            assert ctx['sale'].cash_session.expected_amount == balance_before

        _run_in_tenant(ctx['tenant'], _test)

    def test_completed_refunds_reduce_refundable_balance(self, sale_context):
        """Given a completed refund, when remainder is exceeded, then only it persists."""
        ctx = sale_context
        first_key = 'refund-balance-first'
        rejected_key = 'refund-balance-rejected'

        def _test():
            from sales.services import RefundAmountExceeded, create_sale_refund

            first = create_sale_refund(
                tenant=ctx['tenant'],
                sale=ctx['sale'],
                method='pix',
                amount=Decimal('15.00'),
                reason='Primeiro estorno',
                idempotency_key=first_key,
            )
            before = _attempt_artifacts(ctx['tenant'], rejected_key)

            with pytest.raises(RefundAmountExceeded):
                create_sale_refund(
                    tenant=ctx['tenant'],
                    sale=ctx['sale'],
                    method='pix',
                    amount=Decimal('5.01'),
                    reason='Excede saldo restante',
                    idempotency_key=rejected_key,
                )

            assert _attempt_artifacts(ctx['tenant'], rejected_key) == before
            assert SaleRefund.all_objects.get(pk=first.pk).status == 'completed'
            assert (
                SaleRefund.all_objects.filter(sale=ctx['sale'], status='completed').count()
                == 1
            )

        _run_in_tenant(ctx['tenant'], _test)

    def test_rejects_refund_when_no_balance_remains(self, sale_context):
        """Given the full total was refunded, when another is requested, then it is rejected."""
        ctx = sale_context
        key = 'refund-no-balance'

        def _test():
            from sales.services import RefundAmountExceeded, create_sale_refund

            create_sale_refund(
                tenant=ctx['tenant'],
                sale=ctx['sale'],
                method='pix',
                amount=Decimal('20.00'),
                reason='Estorno integral',
                idempotency_key='refund-full-balance',
            )
            before = _attempt_artifacts(ctx['tenant'], key)

            with pytest.raises(RefundAmountExceeded):
                create_sale_refund(
                    tenant=ctx['tenant'],
                    sale=ctx['sale'],
                    method='pix',
                    amount=Decimal('0.01'),
                    reason='Sem saldo',
                    idempotency_key=key,
                )

            assert _attempt_artifacts(ctx['tenant'], key) == before

        _run_in_tenant(ctx['tenant'], _test)

    def test_rejects_refund_for_cancelled_sale_without_side_effects(self, sale_context):
        """Given a cancelled sale, when refunding, then no compensation artifact is saved."""
        ctx = sale_context
        key = 'refund-cancelled-sale'

        def _test():
            from sales.services import SaleNotCompensable, create_sale_refund

            ctx['sale'].status = 'cancelled'
            ctx['sale'].save(update_fields=['status', 'updated_at'])
            before = _attempt_artifacts(ctx['tenant'], key)
            balance_before = ctx['sale'].cash_session.expected_amount

            with pytest.raises(SaleNotCompensable):
                create_sale_refund(
                    tenant=ctx['tenant'],
                    sale=ctx['sale'],
                    method='cash',
                    amount=Decimal('10.00'),
                    reason='Venda cancelada',
                    idempotency_key=key,
                )

            ctx['sale'].cash_session.refresh_from_db()
            assert _attempt_artifacts(ctx['tenant'], key) == before
            assert ctx['sale'].cash_session.expected_amount == balance_before

        _run_in_tenant(ctx['tenant'], _test)

    def test_cash_refund_creates_one_cash_out_and_events(self, sale_context):
        """Given the original session is open, when refunding, then one cash effect is recorded."""
        ctx = sale_context
        key = 'refund-cash-1'

        def _test():
            from sales.services import create_sale_refund

            balance_before = ctx['sale'].cash_session.expected_amount
            refund = create_sale_refund(
                tenant=ctx['tenant'],
                sale=ctx['sale'],
                method='cash',
                amount=Decimal('10.00'),
                reason='Produto avariado',
                idempotency_key=key,
            )

            ctx['sale'].cash_session.refresh_from_db()
            movement = CashMovement.all_objects.get(
                tenant=ctx['tenant'],
                cash_session=ctx['sale'].cash_session,
                movement_type='cash_out',
            )
            assert refund.status == 'completed'
            assert refund.method == 'cash'
            assert refund.amount == Decimal('10.00')
            assert refund.reason == 'Produto avariado'
            assert movement.amount == Decimal('10.00')
            assert ctx['sale'].cash_session.expected_amount == balance_before - Decimal('10.00')
            assert _attempt_artifacts(ctx['tenant'], key) == {
                'refunds': 1,
                'cash_outs': 1,
                'audits': 1,
                'outbox': 1,
            }
            audit = AuditRecord.objects.get(correlation_id=key)
            outbox = OutboxMessage.objects.get(correlation_id=key)
            assert audit.detail['reason'] == 'Produto avariado'
            assert outbox.payload['reason'] == 'Produto avariado'

        _run_in_tenant(ctx['tenant'], _test)

    @pytest.mark.parametrize('method', ['pix', 'card_external'])
    def test_non_cash_refund_never_creates_cash_movement(self, sale_context, method):
        """Given a non-cash method, when refunding, then only refund and events are recorded."""
        ctx = sale_context
        key = f'refund-{method}-no-cash'

        def _test():
            from sales.services import create_sale_refund

            balance_before = ctx['sale'].cash_session.expected_amount
            refund = create_sale_refund(
                tenant=ctx['tenant'],
                sale=ctx['sale'],
                method=method,
                amount=Decimal('10.00'),
                reason='Produto avariado',
                idempotency_key=key,
            )

            ctx['sale'].cash_session.refresh_from_db()
            assert refund.status == 'completed'
            assert refund.method == method
            assert ctx['sale'].cash_session.expected_amount == balance_before
            assert _attempt_artifacts(ctx['tenant'], key) == {
                'refunds': 1,
                'cash_outs': 0,
                'audits': 1,
                'outbox': 1,
            }

        _run_in_tenant(ctx['tenant'], _test)

    def test_closed_original_cash_session_rolls_back_entire_attempt(self, sale_context):
        """Given the sale session is closed, when cash is refunded, then the attempt rolls back."""
        ctx = sale_context
        key = 'refund-closed-cash-1'

        def _test():
            from sales.services import CashSessionRequired, close_cash_session, create_sale_refund

            close_cash_session(
                cash_session=ctx['sale'].cash_session,
                closing_amount=Decimal('70.00'),
                idempotency_key='close-refund-test',
            )
            ctx['sale'].cash_session.refresh_from_db()
            before = _attempt_artifacts(ctx['tenant'], key)
            balance_before = ctx['sale'].cash_session.expected_amount

            with pytest.raises(CashSessionRequired):
                create_sale_refund(
                    tenant=ctx['tenant'],
                    sale=ctx['sale'],
                    method='cash',
                    amount=Decimal('10.00'),
                    reason='Produto avariado',
                    idempotency_key=key,
                )

            ctx['sale'].cash_session.refresh_from_db()
            assert _attempt_artifacts(ctx['tenant'], key) == before
            assert ctx['sale'].cash_session.expected_amount == balance_before

        _run_in_tenant(ctx['tenant'], _test)

    def test_new_open_session_does_not_mask_closed_original_session(self, sale_context):
        """Given the original session closed, when another opens, then it cannot get the refund."""
        ctx = sale_context
        key = 'refund-wrong-open-session'

        def _test():
            from sales.services import (
                CashSessionRequired,
                close_cash_session,
                create_sale_refund,
                open_cash_session,
            )

            close_cash_session(
                cash_session=ctx['sale'].cash_session,
                closing_amount=Decimal('70.00'),
                idempotency_key='close-original-session',
            )
            replacement = open_cash_session(
                tenant=ctx['tenant'],
                branch=ctx['branch'],
                operator=ctx['user'],
                opening_amount=Decimal('30.00'),
                idempotency_key='replacement-session',
            )
            before = _attempt_artifacts(ctx['tenant'], key)
            replacement_balance = replacement.expected_amount

            with pytest.raises(CashSessionRequired):
                create_sale_refund(
                    tenant=ctx['tenant'],
                    sale=ctx['sale'],
                    method='cash',
                    amount=Decimal('10.00'),
                    reason='Produto avariado',
                    idempotency_key=key,
                )

            replacement.refresh_from_db()
            assert _attempt_artifacts(ctx['tenant'], key) == before
            assert replacement.expected_amount == replacement_balance

        _run_in_tenant(ctx['tenant'], _test)

    def test_refund_idempotent_replay_canonicalizes_amount(self, sale_context):
        """Given equivalent amount scales, when replayed, then the same refund is returned once."""
        ctx = sale_context
        key = 'refund-idem-canonical'

        def _test():
            from sales.services import create_sale_refund

            first = create_sale_refund(
                tenant=ctx['tenant'],
                sale=ctx['sale'],
                method='cash',
                amount='10',
                reason='Produto avariado',
                idempotency_key=key,
            )
            replay = create_sale_refund(
                tenant=ctx['tenant'],
                sale=ctx['sale'],
                method='cash',
                amount=Decimal('10.0000'),
                reason='Produto avariado',
                idempotency_key=key,
            )

            assert replay.id == first.id
            assert _attempt_artifacts(ctx['tenant'], key) == {
                'refunds': 1,
                'cash_outs': 1,
                'audits': 1,
                'outbox': 1,
            }

        _run_in_tenant(ctx['tenant'], _test)

    def test_replay_with_different_payload_conflicts_without_new_side_effects(self, sale_context):
        """Given a used key, when reason changes, then the replay conflicts without duplication."""
        ctx = sale_context
        key = 'refund-idem-conflict'

        def _test():
            from sales.services import DuplicateIdempotencyKey, create_sale_refund

            first = create_sale_refund(
                tenant=ctx['tenant'],
                sale=ctx['sale'],
                method='pix',
                amount=Decimal('10.00'),
                reason='Motivo original',
                idempotency_key=key,
            )
            before = _attempt_artifacts(ctx['tenant'], key)

            with pytest.raises(DuplicateIdempotencyKey):
                create_sale_refund(
                    tenant=ctx['tenant'],
                    sale=ctx['sale'],
                    method='pix',
                    amount=Decimal('10.00'),
                    reason='Motivo divergente',
                    idempotency_key=key,
                )

            assert SaleRefund.all_objects.get(idempotency_key=key).id == first.id
            assert _attempt_artifacts(ctx['tenant'], key) == before

        _run_in_tenant(ctx['tenant'], _test)

    def test_replays_legacy_hash_without_reason_but_rejects_other_divergence(self, sale_context):
        """Given a pre-reason refund, when replayed, then only matching fields replay."""
        ctx = sale_context
        key = 'refund-legacy-hash'

        def _test():
            from sales.services import DuplicateIdempotencyKey, _payload_hash, create_sale_refund

            legacy_hash = _payload_hash(
                {
                    'sale_id': str(ctx['sale'].id),
                    'method': 'pix',
                    'amount': '20.0',
                    'sale_return_id': None,
                }
            )
            legacy = SaleRefund.all_objects.create(
                tenant=ctx['tenant'],
                sale=ctx['sale'],
                method='pix',
                amount=Decimal('20.00'),
                reason='',
                status='completed',
                idempotency_key=key,
                payload_hash=legacy_hash,
            )

            replay = create_sale_refund(
                tenant=ctx['tenant'],
                sale=ctx['sale'],
                method='pix',
                amount=Decimal('20.000'),
                reason='Motivo agora obrigatorio',
                idempotency_key=key,
            )
            assert replay.id == legacy.id

            with pytest.raises(DuplicateIdempotencyKey):
                create_sale_refund(
                    tenant=ctx['tenant'],
                    sale=ctx['sale'],
                    method='pix',
                    amount=Decimal('19.00'),
                    reason='Motivo agora obrigatorio',
                    idempotency_key=key,
                )

            assert SaleRefund.all_objects.filter(idempotency_key=key).count() == 1
            assert CashMovement.all_objects.filter(movement_type='cash_out').count() == 0
            assert AuditRecord.objects.filter(correlation_id=key).count() == 0
            assert OutboxMessage.objects.filter(correlation_id=key).count() == 0

        _run_in_tenant(ctx['tenant'], _test)

    @pytest.mark.parametrize('status', ['draft', 'cancelled'])
    def test_rejects_sale_return_in_incompatible_status(self, sale_context, status):
        """Given a non-completed return, when linked to a refund, then it is rejected atomically."""
        ctx = sale_context
        key = f'refund-return-{status}'

        def _test():
            from sales.services import create_sale_refund

            sale_return = SaleReturn.all_objects.create(
                tenant=ctx['tenant'],
                sale=ctx['sale'],
                reason='Devolucao',
                status=status,
            )
            before = _attempt_artifacts(ctx['tenant'], key)

            with pytest.raises(ValueError, match='Sale return must be completed'):
                create_sale_refund(
                    tenant=ctx['tenant'],
                    sale=ctx['sale'],
                    sale_return=sale_return,
                    method='pix',
                    amount=Decimal('10.00'),
                    reason='Produto devolvido',
                    idempotency_key=key,
                )

            assert _attempt_artifacts(ctx['tenant'], key) == before

        _run_in_tenant(ctx['tenant'], _test)

    def test_rejects_sale_return_from_another_sale(self, sale_context):
        """Given a return from another sale, when linked, then the refund is rejected atomically."""
        ctx = sale_context
        key = 'refund-other-sale-return'

        def _test():
            from sales.services import create_sale_refund

            other_sale = Sale.all_objects.create(
                tenant=ctx['tenant'],
                branch=ctx['sale'].branch,
                cash_session=ctx['sale'].cash_session,
                operator=ctx['sale'].operator,
                status='confirmed',
                gross_total=Decimal('20.00'),
                net_total=Decimal('20.00'),
            )
            sale_return = SaleReturn.all_objects.create(
                tenant=ctx['tenant'],
                sale=other_sale,
                reason='Outra venda',
                status='completed',
            )
            before = _attempt_artifacts(ctx['tenant'], key)

            with pytest.raises(ValueError, match='Sale return must belong to the refunded sale'):
                create_sale_refund(
                    tenant=ctx['tenant'],
                    sale=ctx['sale'],
                    sale_return=sale_return,
                    method='pix',
                    amount=Decimal('10.00'),
                    reason='Produto devolvido',
                    idempotency_key=key,
                )

            assert _attempt_artifacts(ctx['tenant'], key) == before

        _run_in_tenant(ctx['tenant'], _test)

    def test_rejects_sale_return_from_another_tenant(self, sale_context):
        """Given another tenant's return, when linked, then the refund is rejected atomically."""
        ctx = sale_context
        key = 'refund-other-tenant-return'

        def _test():
            from sales.services import create_sale_refund

            other_tenant = Tenant.objects.create(name='Other refund tenant', slug='refund-other')
            sale_return = SaleReturn.all_objects.create(
                tenant=other_tenant,
                sale=ctx['sale'],
                reason='Outro tenant',
                status='completed',
            )
            before = _attempt_artifacts(ctx['tenant'], key)

            with pytest.raises(ValueError, match='Sale return must belong to the same tenant'):
                create_sale_refund(
                    tenant=ctx['tenant'],
                    sale=ctx['sale'],
                    sale_return=sale_return,
                    method='pix',
                    amount=Decimal('10.00'),
                    reason='Produto devolvido',
                    idempotency_key=key,
                )

            assert _attempt_artifacts(ctx['tenant'], key) == before

        _run_in_tenant(ctx['tenant'], _test)
