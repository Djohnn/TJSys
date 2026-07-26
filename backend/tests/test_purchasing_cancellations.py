from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.db import connection

from catalog.models import Product, Unit
from financial.models import Payable
from inventory.models import StockBalance, StockLocation
from purchasing.models import (
    PurchaseOrder,
    PurchaseOrderItem,
    Supplier,
    SupplierReturnItem,
)
from purchasing.services import (
    AlreadyCancelled,
    CannotCancelPurchaseOrder,
    OverReceiptError,
    approve_purchase_order,
    cancel_purchase_order,
    cancel_receipt,
    create_supplier_return,
    purchasing_summary,
    receive_purchase_order,
)
from tenancy.models import Branch, Company, Tenant

User = get_user_model()


def _run_in_tenant(tenant, callback):
    from tenancy.context import reset_current_tenant_id, set_current_tenant_id

    token = set_current_tenant_id(tenant.id)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SET app.current_tenant_id = %s', [str(tenant.id)])
        return callback()
    finally:
        reset_current_tenant_id(token)


@pytest.fixture
def cancel_context():
    tenant = Tenant.objects.create(name='Cancel Tenant', slug='cancel-ctx')

    def _create():
        company = Company.all_objects.create(tenant=tenant, name='Empresa')
        branch = Branch.all_objects.create(tenant=tenant, company=company, name='Filial')
        location = StockLocation.all_objects.create(
            tenant=tenant,
            branch=branch,
            code='CNL',
            name='Cancelamento',
            is_primary=True,
        )
        unit = Unit.all_objects.create(tenant=tenant, symbol='UN', name='Unidade')
        product = Product.all_objects.create(
            tenant=tenant,
            sku='CNL',
            name='Produto Cancel',
            base_unit=unit,
        )
        supplier = Supplier.all_objects.create(tenant=tenant, name='Fornecedor Cancel')
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
class TestCancelPurchaseOrder:
    def test_cancel_draft_po(self, cancel_context):
        ctx = cancel_context
        cancellation = cancel_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            reason='Cancelando pedido',
            idempotency_key='cancel-draft',
        )
        assert cancellation.status == 'completed'
        ctx['po'].refresh_from_db()
        assert ctx['po'].status == 'cancelled'

    def test_cancel_approved_po(self, cancel_context):
        ctx = cancel_context
        approve_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            idempotency_key='cancel-apr-approve',
        )
        cancellation = cancel_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            reason='Cancelando aprovado',
            idempotency_key='cancel-apr',
        )
        assert cancellation.status == 'completed'
        ctx['po'].refresh_from_db()
        assert ctx['po'].status == 'cancelled'

    def test_cancel_already_cancelled_raises(self, cancel_context):
        ctx = cancel_context
        cancel_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            reason='Primeiro',
            idempotency_key='cancel-1',
        )
        with pytest.raises(AlreadyCancelled):
            cancel_purchase_order(
                tenant=ctx['tenant'],
                purchase_order=ctx['po'],
                reason='Segundo',
                idempotency_key='cancel-2',
            )

    def test_cancel_received_po_raises(self, cancel_context):
        ctx = cancel_context
        approve_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            idempotency_key='recv-apr',
        )
        receive_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            items=[{'purchase_order_item_id': ctx['item'].id, 'quantity_received': Decimal('10')}],
            idempotency_key='recv-full',
        )
        with pytest.raises(CannotCancelPurchaseOrder):
            cancel_purchase_order(
                tenant=ctx['tenant'],
                purchase_order=ctx['po'],
                reason='Ja recebido',
                idempotency_key='cancel-recv',
            )

    def test_cancel_idempotent_replay(self, cancel_context):
        ctx = cancel_context
        c1 = cancel_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            reason='Idem',
            idempotency_key='cancel-idem',
        )
        c2 = cancel_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            reason='Idem',
            idempotency_key='cancel-idem',
        )
        assert c1.id == c2.id

    def test_cancel_cancels_pending_payable(self, cancel_context):
        ctx = cancel_context
        approve_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            idempotency_key='payable-apr',
        )
        receive_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            items=[{'purchase_order_item_id': ctx['item'].id, 'quantity_received': Decimal('5')}],
            idempotency_key='payable-recv',
        )
        payable = Payable.all_objects.filter(tenant=ctx['tenant']).first()
        assert payable is not None
        assert payable.status == 'pending'
        cancel_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            reason='Cancel payable',
            idempotency_key='cancel-pay',
        )
        payable.refresh_from_db()
        assert payable.status == 'cancelled'


@pytest.mark.django_db
class TestCancelReceipt:
    def test_cancel_confirmed_receipt(self, cancel_context):
        ctx = cancel_context
        approve_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            idempotency_key='rc-apr',
        )
        receipt = receive_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            items=[{'purchase_order_item_id': ctx['item'].id, 'quantity_received': Decimal('10')}],
            idempotency_key='rc-full',
        )
        cancellation = cancel_receipt(
            tenant=ctx['tenant'],
            receipt=receipt,
            reason='Estorno total',
            idempotency_key='cncl-rc',
        )
        assert cancellation.status == 'completed'
        receipt.refresh_from_db()
        assert receipt.status == 'cancelled'
        ctx['po'].refresh_from_db()
        assert ctx['po'].status == 'approved'

    def test_cancel_receipt_restores_stock(self, cancel_context):
        ctx = cancel_context
        approve_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            idempotency_key='rs-apr',
        )
        receipt = receive_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            items=[{'purchase_order_item_id': ctx['item'].id, 'quantity_received': Decimal('10')}],
            idempotency_key='rs-full',
        )
        cancel_receipt(
            tenant=ctx['tenant'],
            receipt=receipt,
            reason='Estorno',
            idempotency_key='cncl-rs',
        )
        balance = StockBalance.all_objects.filter(
            tenant=ctx['tenant'],
            product=ctx['product'],
            location=ctx['location'],
        ).first()
        assert balance is None or balance.quantity == 0

    def test_cancel_receipt_cancels_payable(self, cancel_context):
        ctx = cancel_context
        approve_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            idempotency_key='rpa-apr',
        )
        receipt = receive_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            items=[{'purchase_order_item_id': ctx['item'].id, 'quantity_received': Decimal('10')}],
            idempotency_key='rpa-full',
        )
        payable = Payable.all_objects.filter(tenant=ctx['tenant']).first()
        assert payable.status == 'pending'
        cancel_receipt(
            tenant=ctx['tenant'],
            receipt=receipt,
            reason='Estorno',
            idempotency_key='cncl-rpa',
        )
        payable.refresh_from_db()
        assert payable.status == 'cancelled'

    def test_cancel_receipt_idempotent(self, cancel_context):
        ctx = cancel_context
        approve_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            idempotency_key='rid-apr',
        )
        receipt = receive_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            items=[{'purchase_order_item_id': ctx['item'].id, 'quantity_received': Decimal('10')}],
            idempotency_key='rid-full',
        )
        c1 = cancel_receipt(
            tenant=ctx['tenant'],
            receipt=receipt,
            reason='Idem',
            idempotency_key='cncl-rid',
        )
        c2 = cancel_receipt(
            tenant=ctx['tenant'],
            receipt=receipt,
            reason='Idem',
            idempotency_key='cncl-rid',
        )
        assert c1.id == c2.id


@pytest.mark.django_db
class TestSupplierReturn:
    def test_full_return(self, cancel_context):
        ctx = cancel_context
        approve_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            idempotency_key='sret-apr',
        )
        receipt = receive_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            items=[{'purchase_order_item_id': ctx['item'].id, 'quantity_received': Decimal('10')}],
            idempotency_key='sret-recv',
        )
        ret = create_supplier_return(
            tenant=ctx['tenant'],
            receipt=receipt,
            items=[{'purchase_order_item_id': ctx['item'].id, 'quantity': Decimal('10')}],
            reason='Devolucao total',
            idempotency_key='sret-ret',
        )
        assert ret.status == 'completed'
        assert SupplierReturnItem.all_objects.filter(supplier_return=ret).count() == 1
        balance = StockBalance.all_objects.filter(
            tenant=ctx['tenant'],
            product=ctx['product'],
            location=ctx['location'],
        ).first()
        assert balance is None or balance.quantity == 0

    def test_partial_return(self, cancel_context):
        ctx = cancel_context
        approve_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            idempotency_key='sprt-apr',
        )
        receipt = receive_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            items=[{'purchase_order_item_id': ctx['item'].id, 'quantity_received': Decimal('10')}],
            idempotency_key='sprt-recv',
        )
        ret = create_supplier_return(
            tenant=ctx['tenant'],
            receipt=receipt,
            items=[{'purchase_order_item_id': ctx['item'].id, 'quantity': Decimal('4')}],
            reason='Devolucao parcial',
            idempotency_key='sprt-ret',
        )
        assert ret.status == 'completed'
        balance = StockBalance.all_objects.filter(
            tenant=ctx['tenant'],
            product=ctx['product'],
            location=ctx['location'],
        ).first()
        assert balance.quantity == Decimal('6')

    def test_return_over_received_raises(self, cancel_context):
        ctx = cancel_context
        approve_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            idempotency_key='sovr-apr',
        )
        receipt = receive_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            items=[{'purchase_order_item_id': ctx['item'].id, 'quantity_received': Decimal('5')}],
            idempotency_key='sovr-recv',
        )
        with pytest.raises(OverReceiptError):
            create_supplier_return(
                tenant=ctx['tenant'],
                receipt=receipt,
                items=[{'purchase_order_item_id': ctx['item'].id, 'quantity': Decimal('10')}],
                reason='Excesso',
                idempotency_key='sovr-ret',
            )

    def test_return_reduces_payable(self, cancel_context):
        ctx = cancel_context
        approve_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            idempotency_key='srpa-apr',
        )
        receipt = receive_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            items=[{'purchase_order_item_id': ctx['item'].id, 'quantity_received': Decimal('10')}],
            idempotency_key='srpa-recv',
        )
        payable = Payable.all_objects.filter(tenant=ctx['tenant']).first()
        assert payable.amount == Decimal('50.00')
        create_supplier_return(
            tenant=ctx['tenant'],
            receipt=receipt,
            items=[{'purchase_order_item_id': ctx['item'].id, 'quantity': Decimal('4')}],
            reason='Devolucao',
            idempotency_key='srpa-ret',
        )
        payable.refresh_from_db()
        assert payable.amount == Decimal('30.00')

    def test_return_idempotent(self, cancel_context):
        ctx = cancel_context
        approve_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            idempotency_key='srid-apr',
        )
        receipt = receive_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            items=[{'purchase_order_item_id': ctx['item'].id, 'quantity_received': Decimal('10')}],
            idempotency_key='srid-recv',
        )
        r1 = create_supplier_return(
            tenant=ctx['tenant'],
            receipt=receipt,
            items=[{'purchase_order_item_id': ctx['item'].id, 'quantity': Decimal('5')}],
            reason='Idem',
            idempotency_key='srid-ret',
        )
        r2 = create_supplier_return(
            tenant=ctx['tenant'],
            receipt=receipt,
            items=[{'purchase_order_item_id': ctx['item'].id, 'quantity': Decimal('5')}],
            reason='Idem',
            idempotency_key='srid-ret',
        )
        assert r1.id == r2.id


@pytest.mark.django_db
class TestPurchasingSummary:
    def test_summary_returns_counts(self, cancel_context):
        ctx = cancel_context
        data = purchasing_summary(tenant=ctx['tenant'])
        assert 'purchase_orders' in data
        assert 'receipts' in data
        assert 'payables' in data
        assert data['purchase_orders'].get('draft', 0) == 1
