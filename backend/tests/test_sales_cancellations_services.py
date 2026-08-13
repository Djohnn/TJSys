from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from threading import Barrier

import pytest
from django.db import connection, connections

from audit.models import AuditRecord
from inventory.models import StockBalance, StockOperation
from outbox.models import OutboxMessage
from sales.models import (
    CashMovement,
    Sale,
    SaleCancellation,
    SaleRefund,
    SaleReturn,
)
from tenancy.context import reset_current_tenant_id, set_current_tenant_id


def _run_in_tenant(tenant, callback):
    token = set_current_tenant_id(tenant.id)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SET app.current_tenant_id = %s', [str(tenant.id)])
        return callback()
    finally:
        reset_current_tenant_id(token)


@pytest.mark.django_db
class TestSaleCancellationService:
    def test_missing_reason_or_key_has_no_effects(self, sale_context):
        """Given missing required fields, when cancelling, then nothing is persisted."""
        ctx = sale_context
        from sales.services import cancel_sale

        sale = Sale.all_objects.get(pk=ctx['sale'].pk)

        def _test():
            before = {
                'cancellations': SaleCancellation.all_objects.filter(sale=sale).count(),
                'refunds': SaleRefund.all_objects.filter(sale=sale).count(),
                'cash_outs': CashMovement.all_objects.filter(
                    cash_session=sale.cash_session,
                    movement_type='cash_out',
                ).count(),
            }
            with pytest.raises(ValueError, match='Idempotency-Key'):
                cancel_sale(
                    tenant=ctx['tenant'],
                    sale=sale,
                    reason='Cancelamento',
                    idempotency_key='',
                )
            with pytest.raises(ValueError, match='Reason'):
                cancel_sale(
                    tenant=ctx['tenant'],
                    sale=sale,
                    reason=' ',
                    idempotency_key='cancel-missing-reason',
                )
            assert before == {
                'cancellations': 0,
                'refunds': 0,
                'cash_outs': 0,
            }

        _run_in_tenant(ctx['tenant'], _test)

    def test_non_confirmed_sale_is_rejected_without_effects(self, sale_context):
        """Given a non-confirmed sale, when cancelling, then no effect is persisted."""
        ctx = sale_context
        from sales.services import SaleAlreadyCancelled, cancel_sale

        sale = Sale.all_objects.get(pk=ctx['sale'].pk)

        def _test():
            Sale.all_objects.filter(pk=sale.pk).update(status='cancelled')
            with pytest.raises(SaleAlreadyCancelled):
                cancel_sale(
                    tenant=ctx['tenant'],
                    sale=sale,
                    reason='Venda já cancelada',
                    idempotency_key='cancel-non-confirmed',
                )
            assert SaleCancellation.all_objects.filter(sale=sale).count() == 0
            assert SaleRefund.all_objects.filter(sale=sale).count() == 0

        _run_in_tenant(ctx['tenant'], _test)

    @pytest.mark.parametrize('return_status', ['draft', 'completed'])
    def test_existing_return_blocks_before_any_effect(self, sale_context, return_status):
        """Given an existing return, when cancelling, then compensation is blocked atomically."""
        ctx = sale_context
        from sales.services import SaleHasReturns, cancel_sale

        sale = Sale.all_objects.get(pk=ctx['sale'].pk)
        key = f'cancel-return-{return_status}'

        def _test():
            SaleReturn.all_objects.create(
                tenant=ctx['tenant'],
                sale=sale,
                reason='Devolução existente',
                status=return_status,
            )
            with pytest.raises(SaleHasReturns):
                cancel_sale(
                    tenant=ctx['tenant'],
                    sale=sale,
                    reason='Cancelamento bloqueado',
                    idempotency_key=key,
                )
            assert SaleCancellation.all_objects.filter(
                tenant=ctx['tenant'], idempotency_key=key
            ).count() == 0
            assert SaleRefund.all_objects.filter(tenant=ctx['tenant'], sale=sale).count() == 0
            assert CashMovement.all_objects.filter(
                tenant=ctx['tenant'],
                cash_session=sale.cash_session,
                movement_type='cash_out',
            ).count() == 0

        _run_in_tenant(ctx['tenant'], _test)

    def test_closed_original_cash_session_blocks_without_using_replacement(self, sale_context):
        """Given the original session is closed, when another opens, then cancellation fails."""
        ctx = sale_context
        from sales.services import (
            CashSessionRequired,
            cancel_sale,
            close_cash_session,
            open_cash_session,
        )

        sale = Sale.all_objects.get(pk=ctx['sale'].pk)
        key = 'cancel-closed-original-session'

        def _test():
            close_cash_session(
                cash_session=sale.cash_session,
                closing_amount=Decimal('70.00'),
                idempotency_key='close-before-cancel',
            )
            replacement = open_cash_session(
                tenant=ctx['tenant'],
                branch=ctx['branch'],
                operator=ctx['user'],
                opening_amount=Decimal('30.00'),
                idempotency_key='replacement-before-cancel',
            )
            replacement_balance = replacement.expected_amount
            with pytest.raises(CashSessionRequired):
                cancel_sale(
                    tenant=ctx['tenant'],
                    sale=sale,
                    reason='Sessão original fechada',
                    idempotency_key=key,
                )
            replacement.refresh_from_db()
            assert replacement.expected_amount == replacement_balance
            assert SaleCancellation.all_objects.filter(
                tenant=ctx['tenant'], idempotency_key=key
            ).count() == 0
            assert SaleRefund.all_objects.filter(tenant=ctx['tenant'], sale=sale).count() == 0

        _run_in_tenant(ctx['tenant'], _test)

    def test_unsupported_payment_refund_method_blocks_before_effects(self, sale_context):
        """Given an unsupported payment method, when cancelling, then no effect is persisted."""
        ctx = sale_context
        from sales.services import SaleNotCompensable, cancel_sale

        sale = Sale.all_objects.get(pk=ctx['sale'].pk)
        key = 'cancel-unsupported-payment-method'

        def _test():
            sale.payments.update(method='card_integrated')
            with pytest.raises(SaleNotCompensable, match='cannot be refunded'):
                cancel_sale(
                    tenant=ctx['tenant'],
                    sale=sale,
                    reason='Método sem refund compatível',
                    idempotency_key=key,
                )
            assert SaleCancellation.all_objects.filter(
                tenant=ctx['tenant'], idempotency_key=key
            ).count() == 0
            assert SaleRefund.all_objects.filter(tenant=ctx['tenant'], sale=sale).count() == 0
            assert CashMovement.all_objects.filter(
                tenant=ctx['tenant'],
                cash_session=sale.cash_session,
                movement_type='cash_out',
            ).count() == 0

        _run_in_tenant(ctx['tenant'], _test)

    def test_inconsistent_stock_effect_blocks_before_effects(self, sale_context):
        """Given a sale without its issue effect, when cancelling, then no effect is persisted."""
        ctx = sale_context
        from sales.services import SaleNotCompensable, cancel_sale

        sale = Sale.all_objects.get(pk=ctx['sale'].pk)
        key = 'cancel-inconsistent-stock'

        def _test():
            sale.items.update(stock_operation=None)
            with pytest.raises(SaleNotCompensable, match='stock effects'):
                cancel_sale(
                    tenant=ctx['tenant'],
                    sale=sale,
                    reason='Estoque inconsistente',
                    idempotency_key=key,
                )
            assert SaleCancellation.all_objects.filter(
                tenant=ctx['tenant'], idempotency_key=key
            ).count() == 0
            assert SaleRefund.all_objects.filter(tenant=ctx['tenant'], sale=sale).count() == 0
            assert CashMovement.all_objects.filter(
                tenant=ctx['tenant'],
                cash_session=sale.cash_session,
                movement_type='cash_out',
            ).count() == 0

        _run_in_tenant(ctx['tenant'], _test)

    def test_preflight_failure_rolls_back_all_effects(self, sale_context, monkeypatch):
        """Given a downstream stock failure, when cancelling, then all prior writes roll back."""
        ctx = sale_context
        from sales.services import cancel_sale

        sale = Sale.all_objects.get(pk=ctx['sale'].pk)
        key = 'cancel-downstream-rollback'

        def fail_receipt(*args, **kwargs):
            raise RuntimeError('stock failure')

        monkeypatch.setattr('sales.services.create_receipt', fail_receipt)

        def _test():
            with pytest.raises(RuntimeError, match='stock failure'):
                cancel_sale(
                    tenant=ctx['tenant'],
                    sale=sale,
                    reason='Falha de estoque',
                    idempotency_key=key,
                )
            sale.refresh_from_db()
            assert sale.status == 'confirmed'
            assert SaleCancellation.all_objects.filter(
                tenant=ctx['tenant'], idempotency_key=key
            ).count() == 0
            assert SaleRefund.all_objects.filter(tenant=ctx['tenant'], sale=sale).count() == 0
            assert StockOperation.all_objects.filter(
                tenant=ctx['tenant'], idempotency_key__startswith=f'{key}:stock:'
            ).count() == 0
            assert AuditRecord.objects.filter(
                tenant_id=str(ctx['tenant'].id), correlation_id=key
            ).count() == 0
            assert OutboxMessage.objects.filter(
                tenant_id=str(ctx['tenant'].id), correlation_id=key
            ).count() == 0

        _run_in_tenant(ctx['tenant'], _test)

    def test_cancel_sale_reverses_stock(self, sale_context):
        ctx = sale_context
        from sales.services import cancel_sale

        sale = Sale.all_objects.filter(tenant=ctx['tenant']).first()

        def _test():
            balance_before = StockBalance.all_objects.get(
                tenant=ctx['tenant'],
                product=ctx['product'],
                location=ctx['location'],
                lot=None,
            )
            assert balance_before.quantity == Decimal('3.000000')

            cancellation = cancel_sale(
                tenant=ctx['tenant'],
                sale=sale,
                reason='Cancelamento total',
                idempotency_key='cancel-1',
                actor=ctx['user'],
            )
            sale.refresh_from_db()
            assert sale.status == 'cancelled'
            assert cancellation.status == 'completed'

            balance_after = StockBalance.all_objects.get(
                tenant=ctx['tenant'],
                product=ctx['product'],
                location=ctx['location'],
                lot=None,
            )
            assert balance_after.quantity == Decimal('5.000000')

        _run_in_tenant(ctx['tenant'], _test)

    def test_cancel_sale_creates_cash_refund(self, sale_context):
        ctx = sale_context
        from sales.services import cancel_sale

        sale = Sale.all_objects.filter(tenant=ctx['tenant']).first()

        def _test():
            cancel_sale(
                tenant=ctx['tenant'],
                sale=sale,
                reason='Cancelamento com reembolso',
                idempotency_key='cancel-refund-1',
                actor=ctx['user'],
            )
            refund = SaleRefund.all_objects.filter(
                tenant=ctx['tenant'],
                sale=sale,
            ).first()
            assert refund is not None
            assert refund.method == 'cash'
            assert refund.amount == Decimal('20.00')
            assert refund.reason == 'Cancelamento com reembolso'

            movement = CashMovement.all_objects.filter(
                tenant=ctx['tenant'],
                cash_session=sale.cash_session,
                movement_type='cash_out',
            ).last()
            assert movement is not None

        _run_in_tenant(ctx['tenant'], _test)

    def test_cancel_sale_idempotent(self, sale_context):
        ctx = sale_context
        from sales.services import cancel_sale

        sale = Sale.all_objects.filter(tenant=ctx['tenant']).first()

        def _test():
            first = cancel_sale(
                tenant=ctx['tenant'],
                sale=sale,
                reason='Cancelamento idempotente',
                idempotency_key='cancel-idem-1',
                actor=ctx['user'],
            )
            replay = cancel_sale(
                tenant=ctx['tenant'],
                sale=sale,
                reason='Cancelamento idempotente',
                idempotency_key='cancel-idem-1',
                actor=ctx['user'],
            )
            assert replay.id == first.id

            balance = StockBalance.all_objects.get(
                tenant=ctx['tenant'],
                product=ctx['product'],
                location=ctx['location'],
                lot=None,
            )
            assert balance.quantity == Decimal('5.000000')
            assert SaleCancellation.all_objects.filter(
                tenant=ctx['tenant'], idempotency_key='cancel-idem-1'
            ).count() == 1
            assert SaleRefund.all_objects.filter(tenant=ctx['tenant'], sale=sale).count() == 1
            assert CashMovement.all_objects.filter(
                tenant=ctx['tenant'],
                cash_session=sale.cash_session,
                movement_type='cash_out',
            ).count() == 1
            assert AuditRecord.objects.filter(
                tenant_id=str(ctx['tenant'].id), correlation_id='cancel-idem-1'
            ).count() == 1
            assert OutboxMessage.objects.filter(
                tenant_id=str(ctx['tenant'].id), correlation_id='cancel-idem-1'
            ).count() == 1

        _run_in_tenant(ctx['tenant'], _test)

    def test_cancel_already_cancelled_sale_raises(self, sale_context):
        ctx = sale_context
        from sales.services import SaleAlreadyCancelled, cancel_sale

        sale = Sale.all_objects.filter(tenant=ctx['tenant']).first()

        def _test():
            cancel_sale(
                tenant=ctx['tenant'],
                sale=sale,
                reason='Primeiro cancelamento',
                idempotency_key='cancel-already-1',
                actor=ctx['user'],
            )
            with pytest.raises(SaleAlreadyCancelled):
                cancel_sale(
                    tenant=ctx['tenant'],
                    sale=sale,
                    reason='Segundo cancelamento',
                    idempotency_key='cancel-already-2',
                    actor=ctx['user'],
                )

        _run_in_tenant(ctx['tenant'], _test)

    def test_same_key_with_different_payload_conflicts(self, sale_context):
        """Given a cancellation key, when the reason diverges, then no new effect is created."""
        ctx = sale_context
        from sales.services import DuplicateIdempotencyKey, cancel_sale

        sale = Sale.all_objects.get(pk=ctx['sale'].pk)
        key = 'cancel-conflict'

        def _test():
            first = cancel_sale(
                tenant=ctx['tenant'],
                sale=sale,
                reason='Motivo original',
                idempotency_key=key,
            )
            before = {
                'cancellations': SaleCancellation.all_objects.filter(sale=sale).count(),
                'refunds': SaleRefund.all_objects.filter(sale=sale).count(),
                'cash_outs': CashMovement.all_objects.filter(
                    cash_session=sale.cash_session, movement_type='cash_out'
                ).count(),
            }
            with pytest.raises(DuplicateIdempotencyKey):
                cancel_sale(
                    tenant=ctx['tenant'],
                    sale=sale,
                    reason='Motivo divergente',
                    idempotency_key=key,
                )
            assert SaleCancellation.all_objects.get(pk=first.pk).id == first.id
            assert before == {
                'cancellations': 1,
                'refunds': 1,
                'cash_outs': 1,
            }

        _run_in_tenant(ctx['tenant'], _test)

    def test_manual_partial_refund_is_completed_by_cancellation(self, sale_context):
        """Given a partial manual refund, when cancelling, then the residual is refunded once."""
        ctx = sale_context
        from sales.services import cancel_sale, create_sale_refund

        sale = Sale.all_objects.get(pk=ctx['sale'].pk)

        def _test():
            create_sale_refund(
                tenant=ctx['tenant'],
                sale=sale,
                method='cash',
                amount=Decimal('10.00'),
                reason='Estorno manual parcial',
                idempotency_key='manual-partial-before-cancel',
            )
            cancellation = cancel_sale(
                tenant=ctx['tenant'],
                sale=sale,
                reason='Cancelamento completa saldo',
                idempotency_key='cancel-completes-residual',
            )
            refunds = SaleRefund.all_objects.filter(tenant=ctx['tenant'], sale=sale)
            assert cancellation.status == 'completed'
            assert refunds.count() == 2
            assert sum(refund.amount for refund in refunds) == sale.net_total
            assert all(refund.reason for refund in refunds)
            assert all(refund.payload_hash for refund in refunds)
            assert CashMovement.all_objects.filter(
                tenant=ctx['tenant'], cash_session=sale.cash_session, movement_type='cash_out'
            ).count() == 2
            sale.cash_session.refresh_from_db()
            assert sale.cash_session.expected_amount == Decimal('50.00')

        _run_in_tenant(ctx['tenant'], _test)

    def test_concluded_fiscal_document_is_untouched_and_adapter_is_not_called(
        self, fiscal_sale_context, monkeypatch
    ):
        """Given a concluded fiscal document, when cancelling, then fiscal state is untouched."""
        ctx = fiscal_sale_context
        from fiscal.models import FiscalDocument
        from sales.services import cancel_sale

        def fail_provider(*args, **kwargs):
            raise AssertionError('fiscal adapter called')

        monkeypatch.setattr('fiscal.services._resolve_provider', fail_provider)

        def _test():
            document = FiscalDocument.all_objects.create(
                tenant=ctx['tenant'],
                sale=ctx['sale'],
                status=FiscalDocument.STATUS_CONCLUDED,
                provider_document_id='provider-final-123',
                protocol='protocol-123',
                xml_key='xml/final.xml',
                pdf_key='pdf/final.pdf',
            )
            before = {
                'status': document.status,
                'provider_document_id': document.provider_document_id,
                'protocol': document.protocol,
                'xml_key': document.xml_key,
                'pdf_key': document.pdf_key,
            }
            cancel_sale(
                tenant=ctx['tenant'],
                sale=ctx['sale'],
                reason='Cancelamento não fiscal',
                idempotency_key='cancel-no-fiscal-call',
            )
            document.refresh_from_db()
            assert {
                'status': document.status,
                'provider_document_id': document.provider_document_id,
                'protocol': document.protocol,
                'xml_key': document.xml_key,
                'pdf_key': document.pdf_key,
            } == before
            assert not OutboxMessage.objects.filter(
                tenant_id=str(ctx['tenant'].id), event_type__startswith='fiscal.'
            ).exists()

        _run_in_tenant(ctx['tenant'], _test)


def _attempt_cancel(*, tenant, sale, reason, idempotency_key, barrier):
    from sales.services import SaleAlreadyCancelled, cancel_sale

    token = set_current_tenant_id(tenant.id)
    thread_connection = connections['default']
    try:
        with thread_connection.cursor() as cursor:
            cursor.execute('SET app.current_tenant_id = %s', [str(tenant.id)])
        barrier.wait(timeout=10)
        try:
            cancellation = cancel_sale(
                tenant=tenant,
                sale=sale,
                reason=reason,
                idempotency_key=idempotency_key,
            )
        except SaleAlreadyCancelled:
            return 'already_cancelled', None
        return 'completed', cancellation.id
    finally:
        reset_current_tenant_id(token)
        thread_connection.close()


def _run_concurrent_cancellations(*, tenant, sale, keys):
    barrier = Barrier(2)
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [
            executor.submit(
                _attempt_cancel,
                tenant=tenant,
                sale=sale,
                reason='Cancelamento concorrente',
                idempotency_key=key,
                barrier=barrier,
            )
            for key in keys
        ]
        return [future.result(timeout=30) for future in futures]


def _attempt_manual_refund_against_cancellation(*, tenant, sale, barrier):
    from sales.services import SaleNotCompensable, create_sale_refund

    token = set_current_tenant_id(tenant.id)
    thread_connection = connections['default']
    try:
        with thread_connection.cursor() as cursor:
            cursor.execute('SET app.current_tenant_id = %s', [str(tenant.id)])
        barrier.wait(timeout=10)
        try:
            refund = create_sale_refund(
                tenant=tenant,
                sale=sale,
                method='cash',
                amount=Decimal('10.00'),
                reason='Refund concorrente',
                idempotency_key='manual-race-refund',
            )
        except SaleNotCompensable:
            return 'rejected', None
        return 'completed', refund.id
    finally:
        reset_current_tenant_id(token)
        thread_connection.close()


@pytest.mark.django_db(transaction=True)
def test_concurrent_cancellation_and_manual_refund_have_one_economic_order(sale_context):
    """Given one sale, when cancellation and refund race, then total compensation is exact."""
    ctx = sale_context
    barrier = Barrier(2)
    with ThreadPoolExecutor(max_workers=2) as executor:
        cancel_future = executor.submit(
            _attempt_cancel,
            tenant=ctx['tenant'],
            sale=ctx['sale'],
            reason='Cancelamento contra refund',
            idempotency_key='cancel-vs-manual-refund',
            barrier=barrier,
        )
        refund_future = executor.submit(
            _attempt_manual_refund_against_cancellation,
            tenant=ctx['tenant'],
            sale=ctx['sale'],
            barrier=barrier,
        )
        cancel_result = cancel_future.result(timeout=30)
        refund_result = refund_future.result(timeout=30)

    assert cancel_result[0] in {'completed', 'already_cancelled'}
    assert refund_result[0] in {'completed', 'rejected'}
    assert SaleCancellation.all_objects.filter(
        tenant=ctx['tenant'], sale=ctx['sale']
    ).count() == 1
    refunds = SaleRefund.all_objects.filter(tenant=ctx['tenant'], sale=ctx['sale'])
    assert sum(refund.amount for refund in refunds) == ctx['sale'].net_total
    assert CashMovement.all_objects.filter(
        tenant=ctx['tenant'],
        cash_session=ctx['sale'].cash_session,
        movement_type='cash_out',
    ).count() == refunds.count()


@pytest.mark.django_db(transaction=True)
def test_concurrent_distinct_cancellations_have_one_winner(sale_context):
    """Given one confirmed sale, when distinct cancellation keys race, then one wins."""
    ctx = sale_context
    results = _run_concurrent_cancellations(
        tenant=ctx['tenant'],
        sale=ctx['sale'],
        keys=('cancel-race-a', 'cancel-race-b'),
    )
    assert sorted(result[0] for result in results) == ['already_cancelled', 'completed']
    assert SaleCancellation.all_objects.filter(tenant=ctx['tenant'], sale=ctx['sale']).count() == 1
    assert SaleRefund.all_objects.filter(tenant=ctx['tenant'], sale=ctx['sale']).count() == 1
    assert CashMovement.all_objects.filter(
        tenant=ctx['tenant'], cash_session=ctx['sale'].cash_session, movement_type='cash_out'
    ).count() == 1


@pytest.mark.django_db(transaction=True)
def test_concurrent_same_cancellation_key_replays_one_effect_set(sale_context):
    """Given one key, when cancellation requests race, then both return one cancellation."""
    ctx = sale_context
    key = 'cancel-race-same-key'
    results = _run_concurrent_cancellations(
        tenant=ctx['tenant'], sale=ctx['sale'], keys=(key, key)
    )
    assert [result[0] for result in results] == ['completed', 'completed']
    assert results[0][1] == results[1][1]
    assert SaleCancellation.all_objects.filter(
        tenant=ctx['tenant'], idempotency_key=key
    ).count() == 1
    assert SaleRefund.all_objects.filter(tenant=ctx['tenant'], sale=ctx['sale']).count() == 1
    assert CashMovement.all_objects.filter(
        tenant=ctx['tenant'], cash_session=ctx['sale'].cash_session, movement_type='cash_out'
    ).count() == 1
