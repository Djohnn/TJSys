from decimal import Decimal
from unittest.mock import patch

import pytest
from django.db import connection

from audit.models import AuditRecord
from catalog.models import Product
from inventory.models import StockBalance, StockMovement, StockOperation
from outbox.models import OutboxMessage
from sales.models import Sale, SaleItem, SaleReturn, SaleReturnItem
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
        from sales.services import InvalidReturnQuantity, create_sale_return

        sale = Sale.all_objects.get(pk=ctx['sale'].pk)
        sale_item = SaleItem.all_objects.get(sale=sale)

        def _test():
            with pytest.raises(InvalidReturnQuantity):
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

    def test_outbox_failure_rolls_back_return_stock_and_events(self, sale_context):
        """Given a valid return, when Outbox fails, then every return effect rolls back."""
        ctx = sale_context
        from sales.services import create_sale_return

        sale = Sale.all_objects.get(pk=ctx['sale'].pk)
        sale_item = SaleItem.all_objects.get(sale=sale)
        key = 'return-outbox-failure-atomicity'

        def _effect_counts():
            stock_operations = StockOperation.all_objects.filter(
                tenant=ctx['tenant'],
                idempotency_key__startswith=f'{key}:stock:',
            )
            return {
                'sale_returns': SaleReturn.all_objects.filter(
                    tenant=ctx['tenant'], idempotency_key=key
                ).count(),
                'sale_return_items': SaleReturnItem.all_objects.filter(
                    tenant=ctx['tenant'], sale_return__idempotency_key=key
                ).count(),
                'stock_operations': stock_operations.count(),
                'stock_movements': StockMovement.all_objects.filter(
                    operation__in=stock_operations
                ).count(),
                'audit_records': AuditRecord.objects.filter(
                    tenant_id=str(ctx['tenant'].id), correlation_id__startswith=key
                ).count(),
                'outbox_messages': OutboxMessage.objects.filter(
                    tenant_id=str(ctx['tenant'].id), correlation_id__startswith=key
                ).count(),
            }

        def _test():
            balance_before = StockBalance.all_objects.get(
                tenant=ctx['tenant'],
                product=sale_item.product,
                location=ctx['location'],
                lot=None,
            ).quantity
            effects_before = _effect_counts()

            with patch(
                'sales.services.create_outbox_message',
                side_effect=RuntimeError('outbox unavailable'),
            ):
                with pytest.raises(RuntimeError, match='outbox unavailable'):
                    create_sale_return(
                        tenant=ctx['tenant'],
                        sale=sale,
                        items=[
                            {'sale_item_id': str(sale_item.id), 'quantity': Decimal('1')}
                        ],
                        reason='Falha de Outbox',
                        idempotency_key=key,
                    )

            assert _effect_counts() == effects_before
            assert StockBalance.all_objects.get(
                tenant=ctx['tenant'],
                product=sale_item.product,
                location=ctx['location'],
                lot=None,
            ).quantity == balance_before

        _run_in_tenant(ctx['tenant'], _test)

    def test_duplicate_item_total_above_returnable_quantity_has_no_effects(
        self,
        sale_context,
    ):
        """Given duplicate lines exceed the balance, when returning, then no effect persists."""
        ctx = sale_context
        from sales.services import InsufficientReturnableQuantity, create_sale_return

        sale = Sale.all_objects.get(pk=ctx['sale'].pk)
        sale_item = SaleItem.all_objects.get(sale=sale)
        idempotency_key = 'return-duplicate-excess'
        balance_before = StockBalance.all_objects.get(
            tenant=ctx['tenant'],
            product=sale_item.product,
            location=ctx['location'],
            lot=None,
        ).quantity

        def _test():
            with pytest.raises(InsufficientReturnableQuantity):
                create_sale_return(
                    tenant=ctx['tenant'],
                    sale=sale,
                    items=[
                        {'sale_item_id': str(sale_item.id), 'quantity': Decimal('2')},
                        {'sale_item_id': str(sale_item.id), 'quantity': Decimal('2')},
                    ],
                    reason='Duplicatas excedem saldo',
                    idempotency_key=idempotency_key,
                )

            _assert_no_return_effects(
                tenant=ctx['tenant'],
                idempotency_key=idempotency_key,
            )
            assert not SaleReturnItem.all_objects.filter(
                sale_return__tenant=ctx['tenant'],
                sale_return__idempotency_key=idempotency_key,
            ).exists()
            assert StockBalance.all_objects.get(
                tenant=ctx['tenant'],
                product=sale_item.product,
                location=ctx['location'],
                lot=None,
            ).quantity == balance_before

        _run_in_tenant(ctx['tenant'], _test)

    def test_duplicate_item_total_creates_one_aggregated_effect(self, sale_context):
        """Given valid duplicate lines, when returning, then one summed effect is created."""
        ctx = sale_context
        from sales.services import create_sale_return

        sale = Sale.all_objects.get(pk=ctx['sale'].pk)
        sale_item = SaleItem.all_objects.get(sale=sale)
        idempotency_key = 'return-duplicate-aggregated'

        def _test():
            sale_return = create_sale_return(
                tenant=ctx['tenant'],
                sale=sale,
                items=[
                    {'sale_item_id': str(sale_item.id), 'quantity': Decimal('1')},
                    {'sale_item_id': str(sale_item.id), 'quantity': Decimal('1')},
                ],
                reason='Duplicatas agregadas',
                idempotency_key=idempotency_key,
            )
            replay = create_sale_return(
                tenant=ctx['tenant'],
                sale=sale,
                items=[{'sale_item_id': str(sale_item.id), 'quantity': Decimal('2')}],
                reason='Duplicatas agregadas',
                idempotency_key=idempotency_key,
            )

            assert replay.id == sale_return.id
            return_items = SaleReturnItem.all_objects.filter(sale_return=sale_return)
            assert return_items.count() == 1
            assert return_items.get().quantity == Decimal('2.000000')
            stock_operations = StockOperation.all_objects.filter(
                tenant=ctx['tenant'],
                operation_type='receipt',
                idempotency_key__startswith=f'{idempotency_key}:stock:',
            )
            assert stock_operations.count() == 1
            movements = StockMovement.all_objects.filter(operation=stock_operations.get())
            assert movements.count() == 1
            assert movements.get().quantity == Decimal('2.000000')
            assert StockBalance.all_objects.get(
                tenant=ctx['tenant'],
                product=sale_item.product,
                location=ctx['location'],
                lot=None,
            ).quantity == Decimal('5.000000')
            assert AuditRecord.objects.filter(
                tenant_id=str(ctx['tenant'].id),
                action='sales.return.created',
                correlation_id=idempotency_key,
            ).count() == 1
            assert OutboxMessage.objects.filter(
                tenant_id=str(ctx['tenant'].id),
                event_type='sales.return.created',
                correlation_id=idempotency_key,
            ).count() == 1

        _run_in_tenant(ctx['tenant'], _test)

    def test_return_receipts_follow_stable_resource_order(self, sale_context, monkeypatch):
        """Given inverse item order, when returning, then receipts use stable resource order."""
        ctx = sale_context
        from sales import services as sales_services

        sale = Sale.all_objects.get(pk=ctx['sale'].pk)
        first_item = SaleItem.all_objects.get(sale=sale)

        def _test():
            second_product = Product.all_objects.create(
                tenant=ctx['tenant'],
                sku='RETURN-ORDER-SECOND',
                name='Produto para ordem de devolução',
                base_unit=ctx['unit'],
            )
            second_item = SaleItem.all_objects.create(
                tenant=ctx['tenant'],
                sale=sale,
                product=second_product,
                unit=ctx['unit'],
                quantity=Decimal('1'),
                factor=Decimal('1'),
                unit_price=Decimal('5'),
                line_total=Decimal('5'),
            )
            stable_items = sorted(
                [first_item, second_item],
                key=lambda item: (
                    str(ctx['location'].id),
                    str(item.product_id),
                    str(item.id),
                ),
            )
            request_items = [
                {'sale_item_id': str(item.id), 'quantity': Decimal('1')}
                for item in reversed(stable_items)
            ]
            receipt_product_order = []
            real_create_receipt = sales_services.create_receipt

            def _recording_create_receipt(*args, **kwargs):
                receipt_product_order.append(str(args[2].id))
                return real_create_receipt(*args, **kwargs)

            monkeypatch.setattr(
                sales_services,
                'create_receipt',
                _recording_create_receipt,
            )

            sale_return = sales_services.create_sale_return(
                tenant=ctx['tenant'],
                sale=sale,
                items=request_items,
                reason='Ordem estável de efeitos',
                idempotency_key='return-stable-effect-order',
            )
            replay = sales_services.create_sale_return(
                tenant=ctx['tenant'],
                sale=sale,
                items=[
                    {'sale_item_id': str(item.id), 'quantity': Decimal('1')}
                    for item in stable_items
                ],
                reason='Ordem estável de efeitos',
                idempotency_key='return-stable-effect-order',
            )

            assert replay.id == sale_return.id
            assert receipt_product_order == [str(item.product_id) for item in stable_items]
            assert sale_return.items.count() == 2
            assert StockOperation.all_objects.filter(
                tenant=ctx['tenant'],
                idempotency_key__startswith='return-stable-effect-order:stock:',
            ).count() == 2

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
        ('invalid_quantities', 'idempotency_key'),
        [
            pytest.param(
                (Decimal('2'), Decimal('-1')),
                'return-replay-negative-line',
                id='negative-line',
            ),
            pytest.param(
                (Decimal('1'), Decimal('0')),
                'return-replay-zero-line',
                id='zero-line',
            ),
        ],
    )
    def test_idempotent_replay_rejects_non_positive_lines_without_new_effects(
        self,
        sale_context,
        invalid_quantities,
        idempotency_key,
    ):
        """Given an existing return, when replay has a non-positive line, then it fails."""
        ctx = sale_context
        from sales.services import InvalidReturnQuantity, create_sale_return

        sale = Sale.all_objects.get(pk=ctx['sale'].pk)
        sale_item = SaleItem.all_objects.get(sale=sale)

        def _effect_counts():
            stock_operations = StockOperation.all_objects.filter(
                tenant=ctx['tenant'],
                idempotency_key__startswith=f'{idempotency_key}:stock:',
            )
            return {
                'sale_returns': SaleReturn.all_objects.filter(
                    tenant=ctx['tenant'],
                    idempotency_key=idempotency_key,
                ).count(),
                'sale_return_items': SaleReturnItem.all_objects.filter(
                    sale_return__tenant=ctx['tenant'],
                    sale_return__idempotency_key=idempotency_key,
                ).count(),
                'stock_operations': stock_operations.count(),
                'stock_movements': StockMovement.all_objects.filter(
                    operation__in=stock_operations,
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
            existing = create_sale_return(
                tenant=ctx['tenant'],
                sale=sale,
                items=[{'sale_item_id': str(sale_item.id), 'quantity': Decimal('1')}],
                reason='Replay deve validar linhas',
                idempotency_key=idempotency_key,
            )
            effects_before = _effect_counts()
            balance_before = StockBalance.all_objects.get(
                tenant=ctx['tenant'],
                product=sale_item.product,
                location=ctx['location'],
                lot=None,
            ).quantity

            with pytest.raises(InvalidReturnQuantity):
                create_sale_return(
                    tenant=ctx['tenant'],
                    sale=sale,
                    items=[
                        {
                            'sale_item_id': str(sale_item.id),
                            'quantity': quantity,
                        }
                        for quantity in invalid_quantities
                    ],
                    reason='Replay deve validar linhas',
                    idempotency_key=idempotency_key,
                )

            assert SaleReturn.all_objects.get(
                tenant=ctx['tenant'],
                idempotency_key=idempotency_key,
            ).id == existing.id
            assert _effect_counts() == effects_before
            assert StockBalance.all_objects.get(
                tenant=ctx['tenant'],
                product=sale_item.product,
                location=ctx['location'],
                lot=None,
            ).quantity == balance_before

        _run_in_tenant(ctx['tenant'], _test)

    def test_legacy_order_dependent_hash_uses_strict_semantic_replay(self, sale_context):
        """Given an old reversed hash, when replay is equivalent, then the fact is reused."""
        ctx = sale_context
        from sales.services import DuplicateIdempotencyKey, _payload_hash, create_sale_return

        sale = Sale.all_objects.get(pk=ctx['sale'].pk)
        first_item = SaleItem.all_objects.get(sale=sale)
        idempotency_key = 'return-semantic-legacy-order'
        reason = 'Replay semântico estrito'

        def _effect_counts():
            stock_operations = StockOperation.all_objects.filter(
                tenant=ctx['tenant'],
                idempotency_key__startswith=f'{idempotency_key}:stock:',
            )
            return {
                'sale_returns': SaleReturn.all_objects.filter(
                    tenant=ctx['tenant'],
                    idempotency_key=idempotency_key,
                ).count(),
                'sale_return_items': SaleReturnItem.all_objects.filter(
                    sale_return__tenant=ctx['tenant'],
                    sale_return__idempotency_key=idempotency_key,
                ).count(),
                'stock_operations': stock_operations.count(),
                'stock_movements': StockMovement.all_objects.filter(
                    operation__in=stock_operations,
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
            second_product = Product.all_objects.create(
                tenant=ctx['tenant'],
                sku='RETURN-SEMANTIC-SECOND',
                name='Produto para replay semântico',
                base_unit=ctx['unit'],
            )
            second_item = SaleItem.all_objects.create(
                tenant=ctx['tenant'],
                sale=sale,
                product=second_product,
                unit=ctx['unit'],
                quantity=Decimal('1'),
                factor=Decimal('1'),
                unit_price=Decimal('5'),
                line_total=Decimal('5'),
            )
            canonical_order = sorted([first_item, second_item], key=lambda item: str(item.id))
            legacy_order = list(reversed(canonical_order))
            existing = create_sale_return(
                tenant=ctx['tenant'],
                sale=sale,
                items=[
                    {'sale_item_id': str(item.id), 'quantity': Decimal('1')}
                    for item in legacy_order
                ],
                reason=reason,
                idempotency_key=idempotency_key,
            )
            old_fingerprint = _payload_hash(
                {
                    'sale_id': str(sale.id),
                    'items': [
                        {'sale_item_id': str(item.id), 'quantity': '1'}
                        for item in legacy_order
                    ],
                    'reason': reason,
                }
            )
            assert old_fingerprint != existing.payload_hash
            SaleReturn.all_objects.filter(pk=existing.pk).update(payload_hash=old_fingerprint)
            effects_before = _effect_counts()
            balances_before = {
                str(item.product_id): StockBalance.all_objects.get(
                    tenant=ctx['tenant'],
                    product=item.product,
                    location=ctx['location'],
                    lot=None,
                ).quantity
                for item in canonical_order
            }

            replay = create_sale_return(
                tenant=ctx['tenant'],
                sale=sale,
                items=[
                    {'sale_item_id': str(item.id), 'quantity': Decimal('1')}
                    for item in canonical_order
                ],
                reason=reason,
                idempotency_key=idempotency_key,
            )

            assert replay.id == existing.id
            assert _effect_counts() == effects_before
            assert {
                str(item.product_id): StockBalance.all_objects.get(
                    tenant=ctx['tenant'],
                    product=item.product,
                    location=ctx['location'],
                    lot=None,
                ).quantity
                for item in canonical_order
            } == balances_before
            with pytest.raises(DuplicateIdempotencyKey):
                create_sale_return(
                    tenant=ctx['tenant'],
                    sale=sale,
                    items=[
                        {'sale_item_id': str(item.id), 'quantity': Decimal('1')}
                        for item in canonical_order
                    ],
                    reason='Motivo divergente',
                    idempotency_key=idempotency_key,
                )
            with pytest.raises(DuplicateIdempotencyKey):
                create_sale_return(
                    tenant=ctx['tenant'],
                    sale=sale,
                    items=[
                        {
                            'sale_item_id': str(canonical_order[0].id),
                            'quantity': Decimal('2'),
                        },
                        {
                            'sale_item_id': str(canonical_order[1].id),
                            'quantity': Decimal('1'),
                        },
                    ],
                    reason=reason,
                    idempotency_key=idempotency_key,
                )
            assert _effect_counts() == effects_before

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
