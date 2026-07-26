from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError
from django.db import connection

from catalog.models import Product, Unit
from purchasing.models import PurchaseOrder, PurchaseOrderItem, Supplier
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


@pytest.fixture
def purchasing_context():
    tenant = Tenant.objects.create(name='Purchasing Tenant', slug='purch-ctx')

    def _create():
        company = Company.all_objects.create(tenant=tenant, name='Empresa Compra')
        branch = Branch.all_objects.create(tenant=tenant, company=company, name='Filial Compra')
        unit = Unit.all_objects.create(tenant=tenant, symbol='UN', name='Unidade')
        product = Product.all_objects.create(
            tenant=tenant,
            sku='PURCH',
            name='Produto Compra',
            base_unit=unit,
        )
        supplier = Supplier.all_objects.create(
            tenant=tenant,
            name='Fornecedor Teste',
            cnpj='00.000.000/0001-00',
        )
        return {
            'tenant': tenant,
            'company': company,
            'branch': branch,
            'unit': unit,
            'product': product,
            'supplier': supplier,
        }

    return _run_in_tenant(tenant, _create)


@pytest.mark.django_db
class TestSupplierModel:
    def test_create_supplier_minimal(self, purchasing_context):
        ctx = purchasing_context
        supplier = Supplier.all_objects.create(
            tenant=ctx['tenant'],
            name='Fornecedor A',
        )
        assert supplier.name == 'Fornecedor A'
        assert supplier.tenant == ctx['tenant']
        assert supplier.cnpj == ''

    def test_supplier_tenant_isolation(self, purchasing_context):
        ctx = purchasing_context
        other_tenant = Tenant.objects.create(name='Other', slug='other-purch')
        Supplier.all_objects.create(tenant=other_tenant, name='Outro Forn')

        own_suppliers = Supplier.all_objects.filter(tenant=ctx['tenant'])
        assert own_suppliers.count() == 1

        other_suppliers = Supplier.all_objects.filter(tenant=other_tenant)
        assert other_suppliers.count() == 1

    def test_supplier_str(self, purchasing_context):
        ctx = purchasing_context
        supplier = Supplier.all_objects.create(
            tenant=ctx['tenant'],
            name='Meu Forn',
        )
        assert str(supplier) == 'Meu Forn'


@pytest.mark.django_db
class TestPurchaseOrderModel:
    def test_create_purchase_order_minimal(self, purchasing_context):
        ctx = purchasing_context
        po = PurchaseOrder.all_objects.create(
            tenant=ctx['tenant'],
            supplier=ctx['supplier'],
            branch=ctx['branch'],
        )
        assert po.status == 'draft'
        assert po.supplier == ctx['supplier']
        assert po.branch == ctx['branch']
        assert po.items_total == 0

    def test_purchase_order_default_status_draft(self, purchasing_context):
        ctx = purchasing_context
        po = PurchaseOrder.all_objects.create(
            tenant=ctx['tenant'],
            supplier=ctx['supplier'],
            branch=ctx['branch'],
        )
        assert po.status == 'draft'

    def test_purchase_order_status_choices(self, purchasing_context):
        ctx = purchasing_context
        for status in ['draft', 'approved', 'partially_received', 'received', 'cancelled']:
            po = PurchaseOrder.all_objects.create(
                tenant=ctx['tenant'],
                supplier=ctx['supplier'],
                branch=ctx['branch'],
                status=status,
            )
            assert po.status == status

    def test_purchase_order_clean_validates_tenant(self, purchasing_context):
        ctx = purchasing_context
        other_tenant = Tenant.objects.create(name='Other', slug='other-po')
        supplier = Supplier.all_objects.create(tenant=other_tenant, name='Cross Forn')
        po = PurchaseOrder(
            tenant=ctx['tenant'],
            supplier=supplier,
            branch=ctx['branch'],
        )
        with pytest.raises(ValidationError):
            po.full_clean()

    def test_purchase_order_str(self, purchasing_context):
        ctx = purchasing_context
        po = PurchaseOrder.all_objects.create(
            tenant=ctx['tenant'],
            supplier=ctx['supplier'],
            branch=ctx['branch'],
        )
        assert str(po).startswith('PO-')
        assert ctx['supplier'].name in str(po)

    def test_purchase_order_items_total(self, purchasing_context):
        ctx = purchasing_context
        po = PurchaseOrder.all_objects.create(
            tenant=ctx['tenant'],
            supplier=ctx['supplier'],
            branch=ctx['branch'],
        )
        item = PurchaseOrderItem.all_objects.create(
            tenant=ctx['tenant'],
            purchase_order=po,
            product=ctx['product'],
            unit=ctx['unit'],
            quantity=Decimal('10'),
            unit_cost=Decimal('5.50'),
            factor=Decimal('1'),
        )
        assert item.line_total() == Decimal('55.00')

    def test_purchase_order_tenant_isolation(self, purchasing_context):
        ctx = purchasing_context
        other_tenant = Tenant.objects.create(name='Other', slug='other-po-2')

        def _seed():
            other_company = Company.all_objects.create(tenant=other_tenant, name='Outra Emp')
            other_supplier = Supplier.all_objects.create(
                tenant=other_tenant,
                name='Outro Forn',
            )
            other_branch = Branch.all_objects.create(
                tenant=other_tenant,
                company=other_company,
                name='Outra Filial',
            )
            PurchaseOrder.all_objects.create(
                tenant=other_tenant,
                supplier=other_supplier,
                branch=other_branch,
            )

        _run_in_tenant(other_tenant, _seed)

        own_pos = PurchaseOrder.all_objects.filter(tenant=ctx['tenant'])
        assert own_pos.count() == 0


@pytest.mark.django_db
class TestPurchaseOrderItemModel:
    def test_create_purchase_order_item(self, purchasing_context):
        ctx = purchasing_context
        po = PurchaseOrder.all_objects.create(
            tenant=ctx['tenant'],
            supplier=ctx['supplier'],
            branch=ctx['branch'],
        )
        item = PurchaseOrderItem.all_objects.create(
            tenant=ctx['tenant'],
            purchase_order=po,
            product=ctx['product'],
            unit=ctx['unit'],
            quantity=Decimal('5'),
            unit_cost=Decimal('10.00'),
            factor=Decimal('1'),
        )
        assert item.quantity == Decimal('5')
        assert item.unit_cost == Decimal('10.00')
        assert item.line_total() == Decimal('50.00')

    def test_quantity_must_be_positive(self, purchasing_context):
        ctx = purchasing_context
        po = PurchaseOrder.all_objects.create(
            tenant=ctx['tenant'],
            supplier=ctx['supplier'],
            branch=ctx['branch'],
        )
        item = PurchaseOrderItem(
            tenant=ctx['tenant'],
            purchase_order=po,
            product=ctx['product'],
            unit=ctx['unit'],
            quantity=Decimal('0'),
            unit_cost=Decimal('10.00'),
            factor=Decimal('1'),
        )
        with pytest.raises(ValidationError):
            item.full_clean()

    def test_unit_cost_must_be_positive(self, purchasing_context):
        ctx = purchasing_context
        po = PurchaseOrder.all_objects.create(
            tenant=ctx['tenant'],
            supplier=ctx['supplier'],
            branch=ctx['branch'],
        )
        item = PurchaseOrderItem(
            tenant=ctx['tenant'],
            purchase_order=po,
            product=ctx['product'],
            unit=ctx['unit'],
            quantity=Decimal('1'),
            unit_cost=Decimal('0'),
            factor=Decimal('1'),
        )
        with pytest.raises(ValidationError):
            item.full_clean()

    def test_factor_must_be_positive(self, purchasing_context):
        ctx = purchasing_context
        po = PurchaseOrder.all_objects.create(
            tenant=ctx['tenant'],
            supplier=ctx['supplier'],
            branch=ctx['branch'],
        )
        item = PurchaseOrderItem(
            tenant=ctx['tenant'],
            purchase_order=po,
            product=ctx['product'],
            unit=ctx['unit'],
            quantity=Decimal('1'),
            unit_cost=Decimal('10.00'),
            factor=Decimal('0'),
        )
        with pytest.raises(ValidationError):
            item.full_clean()

    def test_line_total_with_factor(self, purchasing_context):
        ctx = purchasing_context
        po = PurchaseOrder.all_objects.create(
            tenant=ctx['tenant'],
            supplier=ctx['supplier'],
            branch=ctx['branch'],
        )
        item = PurchaseOrderItem.all_objects.create(
            tenant=ctx['tenant'],
            purchase_order=po,
            product=ctx['product'],
            unit=ctx['unit'],
            quantity=Decimal('2'),
            unit_cost=Decimal('25.00'),
            factor=Decimal('3'),
        )
        assert item.line_total() == Decimal('150.00')

    def test_item_tenant_validates_product_tenant(self, purchasing_context):
        ctx = purchasing_context
        other_tenant = Tenant.objects.create(name='Other', slug='other-item')

        result = {}

        def _seed():
            result['product'] = Product.all_objects.create(
                tenant=other_tenant,
                sku='OTHER',
                name='Outro Prod',
                base_unit=ctx['unit'],
            )

        _run_in_tenant(other_tenant, _seed)
        other_product = result['product']
        po = PurchaseOrder.all_objects.create(
            tenant=ctx['tenant'],
            supplier=ctx['supplier'],
            branch=ctx['branch'],
        )
        item = PurchaseOrderItem(
            tenant=ctx['tenant'],
            purchase_order=po,
            product=other_product,
            unit=ctx['unit'],
            quantity=Decimal('1'),
            unit_cost=Decimal('10.00'),
            factor=Decimal('1'),
        )
        with pytest.raises(ValidationError):
            item.full_clean()
