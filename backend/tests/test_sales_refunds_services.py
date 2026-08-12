from decimal import Decimal

import pytest
from django.db import connection

from sales.models import CashMovement, Sale
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
class TestSaleRefundService:
    def test_cash_refund_creates_cash_out_movement(self, sale_context):
        ctx = sale_context
        from sales.services import create_sale_refund

        sale = Sale.all_objects.filter(tenant=ctx['tenant']).first()

        def _test():
            refund = create_sale_refund(
                tenant=ctx['tenant'],
                sale=sale,
                method='cash',
                amount=Decimal('20.00'),
                reason='Produto avariado',
                idempotency_key='refund-cash-1',
            )
            movement = CashMovement.all_objects.filter(
                tenant=ctx['tenant'],
                cash_session=sale.cash_session,
                movement_type='cash_out',
            ).last()
            assert refund.status == 'completed'
            assert refund.method == 'cash'
            assert refund.amount == Decimal('20.00')
            assert movement is not None
            assert movement.amount == Decimal('20.00')

        _run_in_tenant(ctx['tenant'], _test)

    def test_pix_refund_does_not_create_cash_movement(self, sale_context):
        ctx = sale_context
        from sales.services import create_sale_refund

        sale = Sale.all_objects.filter(tenant=ctx['tenant']).first()

        def _test():
            refund = create_sale_refund(
                tenant=ctx['tenant'],
                sale=sale,
                method='pix',
                amount=Decimal('20.00'),
                reason='Produto avariado',
                idempotency_key='refund-pix-1',
            )
            movement = CashMovement.all_objects.filter(
                tenant=ctx['tenant'],
                cash_session=sale.cash_session,
                movement_type='cash_out',
            ).last()
            assert refund.status == 'completed'
            assert refund.method == 'pix'
            assert movement is None

        _run_in_tenant(ctx['tenant'], _test)

    def test_card_external_refund_does_not_create_cash_movement(self, sale_context):
        ctx = sale_context
        from sales.services import create_sale_refund

        sale = Sale.all_objects.filter(tenant=ctx['tenant']).first()

        def _test():
            refund = create_sale_refund(
                tenant=ctx['tenant'],
                sale=sale,
                method='card_external',
                amount=Decimal('20.00'),
                reason='Produto avariado',
                idempotency_key='refund-card-1',
            )
            movement = CashMovement.all_objects.filter(
                tenant=ctx['tenant'],
                cash_session=sale.cash_session,
                movement_type='cash_out',
            ).last()
            assert refund.status == 'completed'
            assert movement is None

        _run_in_tenant(ctx['tenant'], _test)

    def test_cash_refund_with_closed_cash_session_raises(self, sale_context):
        ctx = sale_context
        from sales.services import CashSessionRequired, close_cash_session, create_sale_refund

        sale = Sale.all_objects.filter(tenant=ctx['tenant']).first()

        def _test():
            close_cash_session(
                cash_session=sale.cash_session,
                closing_amount=Decimal('30.00'),
                idempotency_key='close-refund-test',
            )
            with pytest.raises(CashSessionRequired):
                create_sale_refund(
                    tenant=ctx['tenant'],
                    sale=sale,
                    method='cash',
                    amount=Decimal('10.00'),
                    reason='Produto avariado',
                    idempotency_key='refund-closed-cash-1',
                )

        _run_in_tenant(ctx['tenant'], _test)

    def test_refund_idempotent_replay(self, sale_context):
        ctx = sale_context
        from sales.services import create_sale_refund

        sale = Sale.all_objects.filter(tenant=ctx['tenant']).first()

        def _test():
            first = create_sale_refund(
                tenant=ctx['tenant'],
                sale=sale,
                method='cash',
                amount=Decimal('20.00'),
                reason='Produto avariado',
                idempotency_key='refund-idem-1',
            )
            replay = create_sale_refund(
                tenant=ctx['tenant'],
                sale=sale,
                method='cash',
                amount=Decimal('20.00'),
                reason='Produto avariado',
                idempotency_key='refund-idem-1',
            )
            assert replay.id == first.id

        _run_in_tenant(ctx['tenant'], _test)
