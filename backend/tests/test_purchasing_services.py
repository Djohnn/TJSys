from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError

from catalog.models import Product, Unit
from purchasing.models import PurchaseOrder, PurchaseOrderItem, Supplier
from purchasing.services import InvalidPurchaseOrderStatus, approve_purchase_order
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
def po_with_items_context():
    tenant = Tenant.objects.create(name='PO Svc Tenant', slug='po-svc')

    def _create():
        company = Company.all_objects.create(tenant=tenant, name='Empresa PO')
        branch = Branch.all_objects.create(
            tenant=tenant,
            company=company,
            name='Filial PO',
        )
        unit = Unit.all_objects.create(tenant=tenant, symbol='UN', name='Unidade')
        product = Product.all_objects.create(
            tenant=tenant,
            sku='PO-SVC',
            name='Produto PO',
            base_unit=unit,
        )
        supplier = Supplier.all_objects.create(
            tenant=tenant,
            name='Fornecedor PO',
            cnpj='00.000.000/0001-00',
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
        return {
            'tenant': tenant,
            'branch': branch,
            'unit': unit,
            'product': product,
            'supplier': supplier,
            'po': po,
            'item': item,
        }

    return _run_in_tenant(tenant, _create)


@pytest.mark.django_db
class TestApprovePurchaseOrder:
    def test_approve_draft_purchase_order(self, po_with_items_context):
        ctx = po_with_items_context
        result = approve_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            idempotency_key='approve-1',
        )
        assert result.status == 'approved'
        result.refresh_from_db()
        assert result.status == 'approved'

    def test_approve_without_items_raises(self, po_with_items_context):
        ctx = po_with_items_context
        empty_po = PurchaseOrder.all_objects.create(
            tenant=ctx['tenant'],
            supplier=ctx['supplier'],
            branch=ctx['branch'],
        )
        with pytest.raises(InvalidPurchaseOrderStatus):
            approve_purchase_order(
                tenant=ctx['tenant'],
                purchase_order=empty_po,
                idempotency_key='approve-empty',
            )

    def test_approve_already_approved_raises(self, po_with_items_context):
        ctx = po_with_items_context
        approve_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            idempotency_key='approve-first',
        )
        with pytest.raises(InvalidPurchaseOrderStatus):
            approve_purchase_order(
                tenant=ctx['tenant'],
                purchase_order=ctx['po'],
                idempotency_key='approve-second',
            )

    def test_approve_wrong_tenant_raises(self, po_with_items_context):
        ctx = po_with_items_context
        other_tenant = Tenant.objects.create(name='Other', slug='other-po-svc')
        with pytest.raises(ValueError):
            approve_purchase_order(
                tenant=other_tenant,
                purchase_order=ctx['po'],
                idempotency_key='approve-wrong',
            )

    def test_approve_idempotent_replay(self, po_with_items_context):
        ctx = po_with_items_context
        result1 = approve_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            idempotency_key='approve-replay',
        )
        ctx['po'].refresh_from_db()
        result2 = approve_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            idempotency_key='approve-replay',
        )
        assert result1.id == result2.id

    def test_item_edit_blocked_after_approval(self, po_with_items_context):
        ctx = po_with_items_context
        approve_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            idempotency_key='approve-block',
        )
        item = PurchaseOrderItem(
            tenant=ctx['tenant'],
            purchase_order=ctx['po'],
            product=ctx['product'],
            unit=ctx['unit'],
            quantity=Decimal('5'),
            unit_cost=Decimal('10.00'),
            factor=Decimal('1'),
        )
        with pytest.raises(ValidationError):
            item.full_clean()
