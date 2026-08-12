from decimal import Decimal

import pytest
from django.db import connection

from audit.models import AuditRecord
from inventory.models import StockBalance, StockOperation
from outbox.models import OutboxMessage
from sales.models import Sale, SaleItem, SaleReturn
from tenancy.context import reset_current_tenant_id, set_current_tenant_id


def _run_in_tenant(tenant, callback):
    token = set_current_tenant_id(tenant.id)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SET app.current_tenant_id = %s', [str(tenant.id)])
        return callback()
    finally:
        reset_current_tenant_id(token)


def _assert_no_return_effects(*, tenant, idempotency_key):
    assert not SaleReturn.all_objects.filter(
        tenant=tenant,
        idempotency_key=idempotency_key,
    ).exists()
    assert not StockOperation.all_objects.filter(
        tenant=tenant,
        idempotency_key__startswith=f'{idempotency_key}:stock:',
    ).exists()
    assert not AuditRecord.objects.filter(
        tenant_id=str(tenant.id),
        correlation_id__startswith=idempotency_key,
    ).exists()
    assert not OutboxMessage.objects.filter(
        tenant_id=str(tenant.id),
        correlation_id__startswith=idempotency_key,
    ).exists()


@pytest.mark.django_db
class TestSaleReturnService:
    @pytest.mark.parametrize(
        ('quantity', 'idempotency_key'),
        [
            pytest.param(Decimal('0'), 'return-zero-quantity', id='zero'),
            pytest.param(Decimal('-1'), 'return-negative-quantity', id='negative'),
        ],
    )
    def test_non_positive_quantity_is_rejected_without_effects(
        self,
        sale_context,
        quantity,
        idempotency_key,
    ):
        """Given a non-positive quantity, when returning, then no effect is persisted."""
        ctx = sale_context
        from sales.services import InsufficientReturnableQuantity, create_sale_return

        sale = Sale.all_objects.get(pk=ctx['sale'].pk)
        sale_item = SaleItem.all_objects.get(sale=sale)

        def _test():
            with pytest.raises(InsufficientReturnableQuantity):
                create_sale_return(
                    tenant=ctx['tenant'],
                    sale=sale,
                    items=[{'sale_item_id': str(sale_item.id), 'quantity': quantity}],
                    reason='Quantidade inválida',
                    idempotency_key=idempotency_key,
                )
            _assert_no_return_effects(
                tenant=ctx['tenant'],
                idempotency_key=idempotency_key,
            )

        _run_in_tenant(ctx['tenant'], _test)

    def test_non_confirmed_sale_is_rejected_without_effects(self, sale_context):
        """Given a cancelled sale, when returning, then no compensation effect is persisted."""
        ctx = sale_context
        from sales.services import SaleNotCompensable, create_sale_return

        sale = Sale.all_objects.get(pk=ctx['sale'].pk)
        sale_item = SaleItem.all_objects.get(sale=sale)
        idempotency_key = 'return-cancelled-sale'

        def _test():
            Sale.all_objects.filter(pk=sale.pk).update(status='cancelled')
            with pytest.raises(SaleNotCompensable):
                create_sale_return(
                    tenant=ctx['tenant'],
                    sale=sale,
                    items=[{'sale_item_id': str(sale_item.id), 'quantity': Decimal('1')}],
                    reason='Venda não compensável',
                    idempotency_key=idempotency_key,
                )
            _assert_no_return_effects(
                tenant=ctx['tenant'],
                idempotency_key=idempotency_key,
            )

        _run_in_tenant(ctx['tenant'], _test)

    def test_partial_return_reenters_stock(self, sale_context):
        ctx = sale_context
        from sales.services import create_sale_return

        sale = Sale.all_objects.filter(tenant=ctx['tenant']).first()
        sale_item = SaleItem.all_objects.filter(sale=sale).first()

        def _test():
            sale_return = create_sale_return(
                tenant=ctx['tenant'],
                sale=sale,
                items=[{'sale_item_id': str(sale_item.id), 'quantity': Decimal('1')}],
                reason='Devolução parcial',
                idempotency_key='return-partial-1',
            )
            balance = StockBalance.all_objects.get(
                tenant=ctx['tenant'],
                product=sale_item.product,
                location=ctx['location'],
                lot=None,
            )
            assert sale_return.status == 'completed'
            assert sale_return.items.count() == 1
            assert balance.quantity == Decimal('4.000000')

        _run_in_tenant(ctx['tenant'], _test)

    def test_return_above_sold_quantity_raises(self, sale_context):
        ctx = sale_context
        from sales.services import InsufficientReturnableQuantity, create_sale_return

        sale = Sale.all_objects.filter(tenant=ctx['tenant']).first()
        sale_item = SaleItem.all_objects.filter(sale=sale).first()

        def _test():
            with pytest.raises(InsufficientReturnableQuantity):
                create_sale_return(
                    tenant=ctx['tenant'],
                    sale=sale,
                    items=[{'sale_item_id': str(sale_item.id), 'quantity': Decimal('99')}],
                    reason='Devolução acima do permitido',
                    idempotency_key='return-excess-1',
                )

        _run_in_tenant(ctx['tenant'], _test)

    def test_idempotent_replay_returns_same_return(self, sale_context):
        ctx = sale_context
        from sales.services import create_sale_return

        sale = Sale.all_objects.filter(tenant=ctx['tenant']).first()
        sale_item = SaleItem.all_objects.filter(sale=sale).first()

        def _test():
            first = create_sale_return(
                tenant=ctx['tenant'],
                sale=sale,
                items=[{'sale_item_id': str(sale_item.id), 'quantity': Decimal('1')}],
                reason='Devolução idempotente',
                idempotency_key='return-idem-1',
            )
            replay = create_sale_return(
                tenant=ctx['tenant'],
                sale=sale,
                items=[{'sale_item_id': str(sale_item.id), 'quantity': Decimal('1')}],
                reason='Devolução idempotente',
                idempotency_key='return-idem-1',
            )
            assert replay.id == first.id
            assert replay.status == 'completed'

        _run_in_tenant(ctx['tenant'], _test)

    def test_idempotent_replay_canonicalizes_equivalent_quantity(self, sale_context):
        """Given equivalent decimal payloads, when replayed, then the same return is returned."""
        ctx = sale_context
        from sales.services import create_sale_return

        sale = Sale.all_objects.get(pk=ctx['sale'].pk)
        sale_item = SaleItem.all_objects.get(sale=sale)

        def _test():
            first = create_sale_return(
                tenant=ctx['tenant'],
                sale=sale,
                items=[{'sale_item_id': sale_item.id, 'quantity': Decimal('1')}],
                reason='Devolução canônica',
                idempotency_key='return-canonical-payload',
            )
            replay = create_sale_return(
                tenant=ctx['tenant'],
                sale=sale,
                items=[
                    {
                        'sale_item_id': str(sale_item.id),
                        'quantity': Decimal('1.000000'),
                    }
                ],
                reason='Devolução canônica',
                idempotency_key='return-canonical-payload',
            )

            assert replay.id == first.id

        _run_in_tenant(ctx['tenant'], _test)

    @pytest.mark.parametrize(
        ('original_quantity', 'idempotency_key'),
        [
            pytest.param(
                Decimal('1.000000'),
                'return-legacy-payload-hash-decimal',
                id='decimal-scale',
            ),
            pytest.param(
                '1E+0',
                'return-legacy-payload-hash-exponent',
                id='raw-exponent',
            ),
        ],
    )
    def test_idempotent_replay_accepts_legacy_hash_without_new_effects(
        self,
        sale_context,
        original_quantity,
        idempotency_key,
    ):
        """Given a legacy payload hash, when replayed, then no new effect is created."""
        ctx = sale_context
        from sales.services import _payload_hash, create_sale_return

        sale = Sale.all_objects.get(pk=ctx['sale'].pk)
        sale_item = SaleItem.all_objects.get(sale=sale)
        reason = 'Devolução com hash legado'

        def _effect_counts():
            return {
                'sale_returns': SaleReturn.all_objects.filter(
                    tenant=ctx['tenant'],
                    idempotency_key=idempotency_key,
                ).count(),
                'stock_operations': StockOperation.all_objects.filter(
                    tenant=ctx['tenant'],
                    idempotency_key__startswith=f'{idempotency_key}:stock:',
                ).count(),
                'audit_records': AuditRecord.objects.filter(
                    tenant_id=str(ctx['tenant'].id),
                    correlation_id__startswith=idempotency_key,
                ).count(),
                'outbox_messages': OutboxMessage.objects.filter(
                    tenant_id=str(ctx['tenant'].id),
                    correlation_id__startswith=idempotency_key,
                ).count(),
            }

        def _test():
            first = create_sale_return(
                tenant=ctx['tenant'],
                sale=sale,
                items=[
                    {
                        'sale_item_id': str(sale_item.id),
                        'quantity': original_quantity,
                    }
                ],
                reason=reason,
                idempotency_key=idempotency_key,
            )
            legacy_fingerprint = _payload_hash(
                {
                    'sale_id': str(sale.id),
                    'items': [
                        {
                            'sale_item_id': str(sale_item.id),
                            'quantity': str(original_quantity),
                        }
                    ],
                    'reason': reason,
                }
            )
            SaleReturn.all_objects.filter(pk=first.pk).update(
                payload_hash=legacy_fingerprint,
            )
            balance_before = StockBalance.all_objects.get(
                tenant=ctx['tenant'],
                product=sale_item.product,
                location=ctx['location'],
                lot=None,
            ).quantity
            effects_before = _effect_counts()
            assert effects_before == {
                'sale_returns': 1,
                'stock_operations': 1,
                'audit_records': 2,
                'outbox_messages': 2,
            }

            replay = create_sale_return(
                tenant=ctx['tenant'],
                sale=sale,
                items=[
                    {
                        'sale_item_id': str(sale_item.id),
                        'quantity': original_quantity,
                    }
                ],
                reason=reason,
                idempotency_key=idempotency_key,
            )

            assert replay.id == first.id
            assert _effect_counts() == effects_before
            assert StockBalance.all_objects.get(
                tenant=ctx['tenant'],
                product=sale_item.product,
                location=ctx['location'],
                lot=None,
            ).quantity == balance_before

        _run_in_tenant(ctx['tenant'], _test)

    def test_idempotent_replay_with_different_payload_raises(self, sale_context):
        ctx = sale_context
        from sales.services import DuplicateIdempotencyKey, create_sale_return

        sale = Sale.all_objects.filter(tenant=ctx['tenant']).first()
        sale_item = SaleItem.all_objects.filter(sale=sale).first()

        def _test():
            create_sale_return(
                tenant=ctx['tenant'],
                sale=sale,
                items=[{'sale_item_id': str(sale_item.id), 'quantity': Decimal('1')}],
                reason='Devolução idempotente',
                idempotency_key='return-idem-conflict-1',
            )
            with pytest.raises(DuplicateIdempotencyKey):
                create_sale_return(
                    tenant=ctx['tenant'],
                    sale=sale,
                    items=[{'sale_item_id': str(sale_item.id), 'quantity': Decimal('2')}],
                    reason='Payload diferente',
                    idempotency_key='return-idem-conflict-1',
                )

        _run_in_tenant(ctx['tenant'], _test)
