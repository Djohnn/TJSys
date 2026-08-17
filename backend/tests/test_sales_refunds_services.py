from decimal import Decimal
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.db import connection

from audit.models import AuditRecord
from outbox.models import OutboxMessage
from sales.models import CashMovement, CashSession, Sale, SaleRefund, SaleReturn
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


def _attempt_artifacts(tenant, idempotency_key):
    refunds = SaleRefund.all_objects.filter(
        tenant=tenant,
        idempotency_key=idempotency_key,
    )
    refund = refunds.select_related('sale').first()
    cash_outs = CashMovement.all_objects.none()
    if refund is not None:
        cash_outs = CashMovement.all_objects.filter(
            tenant=tenant,
            movement_type='cash_out',
            cash_session_id=refund.sale.cash_session_id,
            notes=f'Refund {refund.id}',
        )

    return {
        'refunds': refunds.count(),
        'cash_outs': cash_outs.count(),
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

    def test_completed_refund_replays_after_sale_is_cancelled(self, sale_context):
        """Given a completed refund, when its sale is cancelled, then the same request replays."""
        ctx = sale_context
        key = 'refund-replay-after-cancel'

        def _test():
            from sales.services import create_sale_refund

            first = create_sale_refund(
                tenant=ctx['tenant'],
                sale=ctx['sale'],
                method='pix',
                amount=Decimal('10.00'),
                reason='Produto avariado',
                idempotency_key=key,
            )
            before = _attempt_artifacts(ctx['tenant'], key)
            ctx['sale'].status = 'cancelled'
            ctx['sale'].save(update_fields=['status', 'updated_at'])

            replay = create_sale_refund(
                tenant=ctx['tenant'],
                sale=ctx['sale'],
                method='pix',
                amount=Decimal('10.000'),
                reason='Produto avariado',
                idempotency_key=key,
            )

            assert replay.id == first.id
            assert _attempt_artifacts(ctx['tenant'], key) == before

        _run_in_tenant(ctx['tenant'], _test)

    def test_divergent_payload_after_sale_cancellation_conflicts(self, sale_context):
        """Given a completed refund, when a cancelled-sale replay diverges, then it conflicts."""
        ctx = sale_context
        key = 'refund-conflict-after-cancel'

        def _test():
            from sales.services import DuplicateIdempotencyKey, create_sale_refund

            create_sale_refund(
                tenant=ctx['tenant'],
                sale=ctx['sale'],
                method='pix',
                amount=Decimal('10.00'),
                reason='Motivo original',
                idempotency_key=key,
            )
            before = _attempt_artifacts(ctx['tenant'], key)
            ctx['sale'].status = 'cancelled'
            ctx['sale'].save(update_fields=['status', 'updated_at'])

            with pytest.raises(DuplicateIdempotencyKey):
                create_sale_refund(
                    tenant=ctx['tenant'],
                    sale=ctx['sale'],
                    method='pix',
                    amount=Decimal('10.00'),
                    reason='Motivo divergente',
                    idempotency_key=key,
                )

            assert _attempt_artifacts(ctx['tenant'], key) == before

        _run_in_tenant(ctx['tenant'], _test)

    def test_cancelled_different_sale_cannot_reuse_refund_key(self, sale_context):
        """Given a refund for sale A, when sale B reuses its key, then the facts are not reused."""
        ctx = sale_context
        key = 'refund-cross-sale-key'

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
            other_sale = Sale.all_objects.create(
                tenant=ctx['tenant'],
                branch=ctx['sale'].branch,
                cash_session=ctx['sale'].cash_session,
                operator=ctx['sale'].operator,
                status='cancelled',
                gross_total=Decimal('20.00'),
                net_total=Decimal('20.00'),
            )

            with pytest.raises(DuplicateIdempotencyKey):
                create_sale_refund(
                    tenant=ctx['tenant'],
                    sale=other_sale,
                    method='pix',
                    amount=Decimal('10.00'),
                    reason='Motivo original',
                    idempotency_key=key,
                )

            assert SaleRefund.all_objects.filter(
                tenant=ctx['tenant'],
                idempotency_key=key,
            ).values_list('id', flat=True).get() == first.id

        _run_in_tenant(ctx['tenant'], _test)

    def test_refund_key_is_scoped_to_tenant(self, sale_context):
        """Given a refund in tenant A, when tenant B uses its key, then B gets its own fact."""
        ctx = sale_context
        key = 'refund-cross-tenant-key'

        def _test():
            from sales.services import create_sale_refund

            first = create_sale_refund(
                tenant=ctx['tenant'],
                sale=ctx['sale'],
                method='pix',
                amount=Decimal('10.00'),
                reason='Motivo compartilhado',
                idempotency_key=key,
            )
            other_tenant = Tenant.objects.create(
                name='Other refund key tenant',
                slug='other-refund-key-tenant',
            )
            other_token = set_current_tenant_id(other_tenant.id)
            try:
                with connection.cursor() as cursor:
                    cursor.execute(
                        'SET app.current_tenant_id = %s',
                        [str(other_tenant.id)],
                    )
                other_user = get_user_model().objects.create_user(
                    email='other-refund-key@example.test',
                    password='!',
                )
                other_company = Company.all_objects.create(
                    tenant=other_tenant,
                    name='Other Refund Key Company',
                )
                other_branch = Branch.all_objects.create(
                    tenant=other_tenant,
                    company=other_company,
                    name='Other Refund Key Branch',
                )
                other_session = CashSession.all_objects.create(
                    tenant=other_tenant,
                    branch=other_branch,
                    operator=other_user,
                    opening_amount=Decimal('0'),
                    expected_amount=Decimal('0'),
                )
                other_sale = Sale.all_objects.create(
                    tenant=other_tenant,
                    branch=other_branch,
                    cash_session=other_session,
                    operator=other_user,
                    gross_total=Decimal('20.00'),
                    net_total=Decimal('20.00'),
                )
                other_refund = create_sale_refund(
                    tenant=other_tenant,
                    sale=other_sale,
                    method='pix',
                    amount=Decimal('10.00'),
                    reason='Motivo compartilhado',
                    idempotency_key=key,
                )
            finally:
                reset_current_tenant_id(other_token)
                with connection.cursor() as cursor:
                    cursor.execute(
                        'SET app.current_tenant_id = %s',
                        [str(ctx['tenant'].id)],
                    )

            assert other_refund.id != first.id
            assert SaleRefund.all_objects.filter(
                tenant=ctx['tenant'],
                idempotency_key=key,
            ).count() == 1

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

    def test_refund_reason_is_stripped_before_persistence_and_events(self, sale_context):
        """Given a padded refund reason, audit and outbox use its normalized value."""
        ctx = sale_context
        key = 'refund-normalized-reason'

        def _test():
            from sales.services import create_sale_refund

            refund = create_sale_refund(
                tenant=ctx['tenant'],
                sale=ctx['sale'],
                method='pix',
                amount=Decimal('10.00'),
                reason='  Produto avariado  ',
                idempotency_key=key,
            )

            assert refund.reason == 'Produto avariado'
            assert AuditRecord.objects.get(correlation_id=key).detail['reason'] == (
                'Produto avariado'
            )
            assert OutboxMessage.objects.get(correlation_id=key).payload['reason'] == (
                'Produto avariado'
            )

        _run_in_tenant(ctx['tenant'], _test)

    def test_refund_snapshot_ignores_preexisting_cash_out_same_session(self, sale_context):
        """Given a same-session cash out, then only the refund movement counts."""
        ctx = sale_context
        key = 'refund-same-session-scoped-snapshot'

        def _test():
            from sales.services import create_sale_refund

            cash_session = ctx['sale'].cash_session
            cash_session.refresh_from_db()
            expected_before = cash_session.expected_amount
            CashMovement.all_objects.create(
                tenant=ctx['tenant'],
                cash_session=cash_session,
                movement_type='cash_out',
                amount=Decimal('3.00'),
                payment_method='cash',
                reference='preexisting-cash-out',
                notes='Preexisting sangria',
            )
            cash_session.expected_amount -= Decimal('3.00')
            cash_session.version += 1
            cash_session.save(update_fields=['expected_amount', 'version', 'updated_at'])

            refund = create_sale_refund(
                tenant=ctx['tenant'],
                sale=ctx['sale'],
                method='cash',
                amount=Decimal('10.00'),
                reason='Sessao original',
                idempotency_key=key,
            )

            cash_session.refresh_from_db()
            assert refund.idempotency_key == key
            assert cash_session.expected_amount == expected_before - Decimal('13.00')
            assert _attempt_artifacts(ctx['tenant'], key) == {
                'refunds': 1,
                'cash_outs': 1,
                'audits': 1,
                'outbox': 1,
            }

        _run_in_tenant(ctx['tenant'], _test)

    def test_refund_snapshot_does_not_count_other_refund_cash_out(self, sale_context):
        """Given another refund, then only this refund's cash movement counts."""
        ctx = sale_context
        key = 'refund-specific-cash-out-snapshot'

        def _test():
            from sales.services import create_sale_refund

            other_refund = create_sale_refund(
                tenant=ctx['tenant'],
                sale=ctx['sale'],
                method='cash',
                amount=Decimal('3.00'),
                reason='Outro refund',
                idempotency_key='refund-other-cash-out',
            )

            refund = create_sale_refund(
                tenant=ctx['tenant'],
                sale=ctx['sale'],
                method='cash',
                amount=Decimal('10.00'),
                reason='Sessao original',
                idempotency_key=key,
            )

            assert refund.idempotency_key == key
            assert _attempt_artifacts(ctx['tenant'], key) == {
                'refunds': 1,
                'cash_outs': 1,
                'audits': 1,
                'outbox': 1,
            }
            assert CashMovement.all_objects.filter(
                cash_session=ctx['sale'].cash_session,
                notes=f'Refund {other_refund.id}',
            ).count() == 1

        _run_in_tenant(ctx['tenant'], _test)

    def test_outbox_failure_rolls_back_refund_cash_and_events(self, sale_context):
        """Given a cash refund, when Outbox fails, then refund and cash roll back."""
        ctx = sale_context
        from sales.services import create_sale_refund

        key = 'refund-outbox-failure-atomicity'

        def _test():
            cash_session = ctx['sale'].cash_session
            cash_session.refresh_from_db()
            expected_before = cash_session.expected_amount
            effects_before = _attempt_artifacts(ctx['tenant'], key)

            with patch(
                'sales.services.create_outbox_message',
                side_effect=RuntimeError('outbox unavailable'),
            ):
                with pytest.raises(RuntimeError, match='outbox unavailable'):
                    create_sale_refund(
                        tenant=ctx['tenant'],
                        sale=ctx['sale'],
                        method='cash',
                        amount=Decimal('10.00'),
                        reason='Falha de Outbox',
                        idempotency_key=key,
                    )

            cash_session.refresh_from_db()
            assert _attempt_artifacts(ctx['tenant'], key) == effects_before
            assert cash_session.expected_amount == expected_before

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
            other_token = set_current_tenant_id(other_tenant.id)
            try:
                with connection.cursor() as cursor:
                    cursor.execute(
                        'SET app.current_tenant_id = %s',
                        [str(other_tenant.id)],
                    )
                other_user = get_user_model().objects.create_user(
                    email='refund-other-tenant@example.test',
                    password='!',
                )
                other_company = Company.all_objects.create(
                    tenant=other_tenant,
                    name='Other Refund Company',
                )
                other_branch = Branch.all_objects.create(
                    tenant=other_tenant,
                    company=other_company,
                    name='Other Refund Branch',
                )
                other_session = CashSession.all_objects.create(
                    tenant=other_tenant,
                    branch=other_branch,
                    operator=other_user,
                    opening_amount=Decimal('0'),
                    expected_amount=Decimal('0'),
                )
                other_sale = Sale.all_objects.create(
                    tenant=other_tenant,
                    branch=other_branch,
                    cash_session=other_session,
                    operator=other_user,
                    gross_total=Decimal('10.00'),
                    net_total=Decimal('10.00'),
                )
                sale_return = SaleReturn.all_objects.create(
                    tenant=other_tenant,
                    sale=other_sale,
                    reason='Outro tenant',
                    status='completed',
                )
            finally:
                reset_current_tenant_id(other_token)
                with connection.cursor() as cursor:
                    cursor.execute(
                        'SET app.current_tenant_id = %s',
                        [str(ctx['tenant'].id)],
                    )

            assert SaleReturn.objects.filter(pk=sale_return.pk).exists() is False
            assert SaleReturn.all_objects.filter(pk=sale_return.pk).exists() is False
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
