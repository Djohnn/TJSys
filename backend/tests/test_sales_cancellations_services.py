from decimal import Decimal

import pytest
from django.db import connection

from inventory.models import StockBalance
from sales.models import CashMovement, Sale, SaleRefund
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
