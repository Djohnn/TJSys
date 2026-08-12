from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from threading import Barrier

import pytest
from django.db import connections

from audit.models import AuditRecord
from inventory.models import StockBalance, StockMovement, StockOperation
from outbox.models import OutboxMessage
from sales.models import SaleItem, SaleReturn, SaleReturnItem
from tenancy.context import reset_current_tenant_id, set_current_tenant_id


def _attempt_return(*, tenant, sale, sale_item, idempotency_key, barrier):
    from sales.services import InsufficientReturnableQuantity, create_sale_return

    token = set_current_tenant_id(tenant.id)
    thread_connection = connections['default']
    try:
        with thread_connection.cursor() as cursor:
            cursor.execute('SET app.current_tenant_id = %s', [str(tenant.id)])
            cursor.execute('SELECT pg_backend_pid()')
            backend_pid = cursor.fetchone()[0]
        barrier.wait(timeout=10)
        try:
            sale_return = create_sale_return(
                tenant=tenant,
                sale=sale,
                items=[
                    {
                        'sale_item_id': str(sale_item.id),
                        'quantity': Decimal('2'),
                    }
                ],
                reason='Devolução concorrente',
                idempotency_key=idempotency_key,
            )
        except InsufficientReturnableQuantity:
            return 'insufficient', None, backend_pid
        return 'completed', sale_return.id, backend_pid
    finally:
        reset_current_tenant_id(token)
        thread_connection.close()


def _run_concurrent_returns(*, tenant, sale, sale_item, idempotency_keys):
    barrier = Barrier(2)
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [
            executor.submit(
                _attempt_return,
                tenant=tenant,
                sale=sale,
                sale_item=sale_item,
                idempotency_key=idempotency_key,
                barrier=barrier,
            )
            for idempotency_key in idempotency_keys
        ]
        return [future.result(timeout=30) for future in futures]


def _return_stock_operations(*, tenant, idempotency_keys):
    stock_keys = [f'{key}:stock:1' for key in idempotency_keys]
    return StockOperation.all_objects.filter(
        tenant=tenant,
        operation_type='receipt',
        idempotency_key__in=stock_keys,
    )


@pytest.mark.django_db(transaction=True)
def test_concurrent_distinct_keys_cannot_overconsume_returnable_quantity(sale_context):
    """Given one returnable balance, when distinct keys race, then only one consumes it."""
    ctx = sale_context
    tenant = ctx['tenant']
    sale = ctx['sale']
    sale_item = SaleItem.all_objects.get(sale=sale)
    keys = ('return-race-distinct-a', 'return-race-distinct-b')

    balance_before = StockBalance.all_objects.get(
        tenant=tenant,
        product=sale_item.product,
        location=ctx['location'],
        lot=None,
    )
    assert balance_before.quantity == Decimal('3.000000')

    results = _run_concurrent_returns(
        tenant=tenant,
        sale=sale,
        sale_item=sale_item,
        idempotency_keys=keys,
    )

    assert sorted(result[0] for result in results) == ['completed', 'insufficient']
    assert len({result[2] for result in results}) == 2
    assert SaleReturn.all_objects.filter(tenant=tenant, idempotency_key__in=keys).count() == 1
    assert SaleReturnItem.all_objects.filter(
        sale_return__tenant=tenant,
        sale_return__idempotency_key__in=keys,
    ).count() == 1

    stock_operations = _return_stock_operations(tenant=tenant, idempotency_keys=keys)
    assert stock_operations.count() == 1
    stock_operation = stock_operations.get()
    movements = StockMovement.all_objects.filter(operation=stock_operation)
    assert movements.count() == 1
    movement = movements.get()
    assert movement.direction == 'in'
    assert movement.quantity == Decimal('2.000000')

    balance_after = StockBalance.all_objects.get(pk=balance_before.pk)
    assert balance_after.quantity == Decimal('5.000000')
    assert AuditRecord.objects.filter(
        tenant_id=str(tenant.id),
        action='sales.return.created',
        correlation_id__in=keys,
    ).count() == 1
    assert OutboxMessage.objects.filter(
        tenant_id=str(tenant.id),
        event_type='sales.return.created',
        correlation_id__in=keys,
    ).count() == 1


@pytest.mark.django_db(transaction=True)
def test_concurrent_same_key_replays_single_return_and_single_stock_effect(sale_context):
    """Given the same key and payload, when requests race, then both replay one return."""
    ctx = sale_context
    tenant = ctx['tenant']
    sale = ctx['sale']
    sale_item = SaleItem.all_objects.get(sale=sale)
    idempotency_key = 'return-race-same-key'
    keys = (idempotency_key, idempotency_key)

    balance_before = StockBalance.all_objects.get(
        tenant=tenant,
        product=sale_item.product,
        location=ctx['location'],
        lot=None,
    )
    assert balance_before.quantity == Decimal('3.000000')

    results = _run_concurrent_returns(
        tenant=tenant,
        sale=sale,
        sale_item=sale_item,
        idempotency_keys=keys,
    )

    assert [result[0] for result in results] == ['completed', 'completed']
    assert results[0][1] == results[1][1]
    assert len({result[2] for result in results}) == 2
    assert SaleReturn.all_objects.filter(
        tenant=tenant,
        idempotency_key=idempotency_key,
    ).count() == 1
    assert SaleReturnItem.all_objects.filter(
        sale_return__tenant=tenant,
        sale_return__idempotency_key=idempotency_key,
    ).count() == 1

    stock_operations = _return_stock_operations(tenant=tenant, idempotency_keys=keys)
    assert stock_operations.count() == 1
    stock_operation = stock_operations.get()
    movements = StockMovement.all_objects.filter(operation=stock_operation)
    assert movements.count() == 1
    movement = movements.get()
    assert movement.direction == 'in'
    assert movement.quantity == Decimal('2.000000')

    balance_after = StockBalance.all_objects.get(pk=balance_before.pk)
    assert balance_after.quantity == Decimal('5.000000')
    assert AuditRecord.objects.filter(
        tenant_id=str(tenant.id),
        action='sales.return.created',
        correlation_id=idempotency_key,
    ).count() == 1
    assert OutboxMessage.objects.filter(
        tenant_id=str(tenant.id),
        event_type='sales.return.created',
        correlation_id=idempotency_key,
    ).count() == 1
