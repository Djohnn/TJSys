from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from threading import Barrier

import pytest
from django.db import IntegrityError, close_old_connections, models, transaction

from catalog.models import Product, Unit
from financial.models import Payable
from inventory.models import StockBalance, StockLocation
from purchasing.models import (
    PurchaseOrder,
    PurchaseOrderItem,
    PurchaseReceipt,
    PurchaseReceiptItem,
    Supplier,
)
from purchasing.services import (
    DuplicateIdempotencyKey,
    OverReceiptError,
    ReceiptWithoutApprovedOrder,
    approve_purchase_order,
    receive_purchase_order,
)
from tenancy.models import Branch, Company, Tenant


def _run_in_tenant(tenant, callback):
    from django.db import connection

    from tenancy.context import reset_current_tenant_id, set_current_tenant_id

    token = set_current_tenant_id(tenant.id)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SET app.current_tenant_id = %s', [str(tenant.id)])
        return callback()
    finally:
        reset_current_tenant_id(token)


@pytest.fixture
def approved_po_context():
    tenant = Tenant.objects.create(name='Receiving Tenant', slug='recv-ctx')

    def _create():
        company = Company.all_objects.create(tenant=tenant, name='Empresa RCT')
        branch = Branch.all_objects.create(
            tenant=tenant,
            company=company,
            name='Filial RCT',
        )
        location = StockLocation.all_objects.create(
            tenant=tenant,
            branch=branch,
            code='RECV',
            name='Recebimento',
            is_primary=True,
        )
        unit = Unit.all_objects.create(tenant=tenant, symbol='UN', name='Unidade')
        product = Product.all_objects.create(
            tenant=tenant,
            sku='RECV',
            name='Produto RCT',
            base_unit=unit,
        )
        supplier = Supplier.all_objects.create(
            tenant=tenant,
            name='Fornecedor RCT',
        )
        po = PurchaseOrder.all_objects.create(
            tenant=tenant,
            supplier=supplier,
            branch=branch,
        )
        item = PurchaseOrderItem.all_objects.create(
            tenant=tenant,
            purchase_order=po,
            product=product,
            unit=unit,
            quantity=Decimal('10'),
            unit_cost=Decimal('5.00'),
            factor=Decimal('1'),
        )
        approve_purchase_order(tenant=tenant, purchase_order=po, idempotency_key='recv-approve')
        return {
            'tenant': tenant,
            'branch': branch,
            'location': location,
            'unit': unit,
            'product': product,
            'supplier': supplier,
            'po': po,
            'item': item,
        }

    return _run_in_tenant(tenant, _create)


@pytest.mark.django_db
class TestReceivePurchaseOrder:
    def test_full_receipt(self, approved_po_context):
        ctx = approved_po_context
        receipt = receive_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            items=[{'purchase_order_item_id': ctx['item'].id, 'quantity_received': Decimal('10')}],
            idempotency_key='recv-full',
        )
        assert receipt.status == 'confirmed'
        assert PurchaseReceiptItem.all_objects.filter(receipt=receipt).count() == 1
        ctx['po'].refresh_from_db()
        assert ctx['po'].status == 'received'

    def test_partial_receipt(self, approved_po_context):
        ctx = approved_po_context
        receipt = receive_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            items=[{'purchase_order_item_id': ctx['item'].id, 'quantity_received': Decimal('4')}],
            idempotency_key='recv-partial',
        )
        assert receipt.status == 'confirmed'
        ctx['po'].refresh_from_db()
        assert ctx['po'].status == 'partially_received'

    def test_second_partial_completes_order(self, approved_po_context):
        ctx = approved_po_context
        receive_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            items=[{'purchase_order_item_id': ctx['item'].id, 'quantity_received': Decimal('6')}],
            idempotency_key='recv-p1',
        )
        ctx['po'].refresh_from_db()
        assert ctx['po'].status == 'partially_received'

        receipt2 = receive_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            items=[{'purchase_order_item_id': ctx['item'].id, 'quantity_received': Decimal('4')}],
            idempotency_key='recv-p2',
        )
        assert receipt2.status == 'confirmed'
        ctx['po'].refresh_from_db()
        assert ctx['po'].status == 'received'

    def test_receipt_above_pending_raises(self, approved_po_context):
        ctx = approved_po_context
        with pytest.raises(OverReceiptError):
            receive_purchase_order(
                tenant=ctx['tenant'],
                purchase_order=ctx['po'],
                items=[
                    {'purchase_order_item_id': ctx['item'].id, 'quantity_received': Decimal('20')},
                ],
                idempotency_key='recv-over',
            )

    def test_receipt_increases_stock(self, approved_po_context):
        ctx = approved_po_context
        receive_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            items=[{'purchase_order_item_id': ctx['item'].id, 'quantity_received': Decimal('10')}],
            idempotency_key='recv-stock',
        )
        balance = StockBalance.all_objects.filter(
            tenant=ctx['tenant'],
            product=ctx['product'],
            location=ctx['location'],
        ).first()
        assert balance is not None
        assert balance.quantity == Decimal('10')

    def test_receipt_draft_order_raises(self, approved_po_context):
        ctx = approved_po_context
        draft_po = PurchaseOrder.all_objects.create(
            tenant=ctx['tenant'],
            supplier=ctx['supplier'],
            branch=ctx['branch'],
        )
        PurchaseOrderItem.all_objects.create(
            tenant=ctx['tenant'],
            purchase_order=draft_po,
            product=ctx['product'],
            unit=ctx['unit'],
            quantity=Decimal('5'),
            unit_cost=Decimal('3.00'),
            factor=Decimal('1'),
        )
        with pytest.raises(ReceiptWithoutApprovedOrder):
            receive_purchase_order(
                tenant=ctx['tenant'],
                purchase_order=draft_po,
                items=[{'purchase_order_item_id': 0, 'quantity_received': Decimal('1')}],
                idempotency_key='recv-draft',
            )

    def test_receipt_idempotent_replay(self, approved_po_context):
        ctx = approved_po_context
        r1 = receive_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            items=[{'purchase_order_item_id': ctx['item'].id, 'quantity_received': Decimal('10')}],
            idempotency_key='recv-idem',
        )
        r2 = receive_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            items=[{'purchase_order_item_id': ctx['item'].id, 'quantity_received': Decimal('10')}],
            idempotency_key='recv-idem',
        )
        assert r1.id == r2.id

    def test_duplicate_item_rows_are_aggregated_before_pending_validation(
        self,
        approved_po_context,
    ):
        """Given duplicate rows, when their sum exceeds pending, then reject the receipt."""
        ctx = approved_po_context

        with pytest.raises(OverReceiptError):
            receive_purchase_order(
                tenant=ctx['tenant'],
                purchase_order=ctx['po'],
                items=[
                    {
                        'purchase_order_item_id': ctx['item'].id,
                        'quantity_received': Decimal('6'),
                    },
                    {
                        'purchase_order_item_id': ctx['item'].id,
                        'quantity_received': Decimal('6'),
                    },
                ],
                idempotency_key='recv-duplicate-over',
            )

    def test_duplicate_item_rows_create_one_canonical_receipt_item(
        self,
        approved_po_context,
    ):
        """Given duplicate rows, when their sum fits pending, then persist one canonical row."""
        ctx = approved_po_context

        receipt = receive_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            items=[
                {
                    'purchase_order_item_id': ctx['item'].id,
                    'quantity_received': Decimal('4'),
                },
                {
                    'purchase_order_item_id': ctx['item'].id,
                    'quantity_received': Decimal('6'),
                },
            ],
            idempotency_key='recv-duplicate-fit',
        )

        receipt_items = PurchaseReceiptItem.all_objects.filter(receipt=receipt)
        assert receipt_items.count() == 1
        assert receipt_items.get().quantity_received == Decimal('10')

    def test_replay_with_divergent_payload_raises_conflict(self, approved_po_context):
        """Given an existing key, when payload changes, then reject the replay."""
        ctx = approved_po_context
        receive_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            items=[
                {
                    'purchase_order_item_id': ctx['item'].id,
                    'quantity_received': Decimal('4'),
                }
            ],
            idempotency_key='recv-divergent',
        )

        with pytest.raises(DuplicateIdempotencyKey):
            receive_purchase_order(
                tenant=ctx['tenant'],
                purchase_order=ctx['po'],
                items=[
                    {
                        'purchase_order_item_id': ctx['item'].id,
                        'quantity_received': Decimal('5'),
                    }
                ],
                idempotency_key='recv-divergent',
            )

    def test_receipt_idempotency_key_is_unique_per_tenant(self, approved_po_context):
        """Given a persisted receipt key, when duplicated directly, then the DB rejects it."""
        ctx = approved_po_context
        receive_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            items=[
                {
                    'purchase_order_item_id': ctx['item'].id,
                    'quantity_received': Decimal('4'),
                }
            ],
            idempotency_key='recv-db-unique',
        )

        with pytest.raises(IntegrityError), transaction.atomic():
            PurchaseReceipt.all_objects.create(
                tenant=ctx['tenant'],
                purchase_order=ctx['po'],
                status='confirmed',
                idempotency_key='recv-db-unique',
                payload_hash='different',
            )

    def test_empty_receipt_is_rejected(self, approved_po_context):
        """Given no items, when receiving an order, then reject without side effects."""
        ctx = approved_po_context

        with pytest.raises(ValueError, match='At least one receipt item is required'):
            receive_purchase_order(
                tenant=ctx['tenant'],
                purchase_order=ctx['po'],
                items=[],
                idempotency_key='recv-empty',
            )

    @pytest.mark.django_db(transaction=True)
    def test_concurrent_receipts_cannot_exceed_pending(self, approved_po_context):
        """Given two simultaneous full receipts, when committed, then only one succeeds."""
        ctx = approved_po_context
        start = Barrier(2)

        def receive(key):
            close_old_connections()
            start.wait(timeout=10)
            try:
                return _run_in_tenant(
                    ctx['tenant'],
                    lambda: receive_purchase_order(
                        tenant=ctx['tenant'],
                        purchase_order=PurchaseOrder.all_objects.get(pk=ctx['po'].pk),
                        items=[
                            {
                                'purchase_order_item_id': ctx['item'].id,
                                'quantity_received': Decimal('10'),
                            }
                        ],
                        idempotency_key=key,
                    ),
                ).status
            except ReceiptWithoutApprovedOrder:
                return 'rejected'
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(receive, ('recv-race-a', 'recv-race-b')))

        assert sorted(results) == ['confirmed', 'rejected']
        assert PurchaseReceiptItem.all_objects.filter(
            purchase_order_item=ctx['item'],
        ).aggregate(total=models.Sum('quantity_received'))['total'] == Decimal('10')

    def test_receipt_creates_payable(self, approved_po_context):
        ctx = approved_po_context
        receipt = receive_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            items=[{'purchase_order_item_id': ctx['item'].id, 'quantity_received': Decimal('10')}],
            idempotency_key='recv-payable',
        )
        payable = Payable.all_objects.filter(tenant=ctx['tenant']).first()
        assert payable is not None
        assert payable.supplier_name == ctx['supplier'].name
        assert payable.amount == Decimal('50.00')
        assert payable.status == 'pending'
        assert payable.supplier_id == ctx['supplier'].id
        assert payable.purchase_order_id == ctx['po'].id
        assert payable.purchase_receipt_id == receipt.id
