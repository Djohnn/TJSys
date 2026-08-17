from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.db import connection

from catalog.models import Product, Unit
from inventory.models import StockLocation
from purchasing.models import PurchaseOrder, PurchaseOrderItem, Supplier
from purchasing.services import approve_purchase_order
from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Branch, Company, Tenant, TenantMembership

User = get_user_model()


def _run_in_tenant(tenant, callback):
    token = set_current_tenant_id(tenant.id)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'SELECT set_config(%s, %s, false)',
                ['app.current_tenant_id', str(tenant.id)],
            )
        return callback()
    finally:
        reset_current_tenant_id(token)


def _auth_client(client, user, tenant):
    TenantMembership.objects.update_or_create(
        user=user,
        tenant=tenant,
        defaults={'role': 'admin', 'is_active': True},
    )
    client.force_login(user)
    session = client.session
    session['mfa_tenant_id'] = str(tenant.id)
    session['mfa_method'] = 'totp'
    session.save()
    return client


@pytest.fixture
def api_context(client):
    tenant = Tenant.objects.create(name='Purchasing API', slug='purchasing-api')
    user = User.objects.create_user(
        email='purchasing-api@test.local',
        password='pass123',
    )
    api_client = _auth_client(client, user, tenant)

    def _create():
        unit = Unit.all_objects.create(
            tenant=tenant,
            symbol='UN',
            name='Unidade',
        )
        product = Product.all_objects.create(
            tenant=tenant,
            sku='COMP',
            name='Produto Compra',
            base_unit=unit,
        )
        company = Company.all_objects.create(tenant=tenant, name='Empresa')
        branch = Branch.all_objects.create(
            tenant=tenant,
            company=company,
            name='Filial',
        )
        supplier = Supplier.all_objects.create(
            tenant=tenant,
            name='Fornecedor Ltda',
            cnpj='00.000.000/0001-00',
        )
        location = StockLocation.all_objects.create(
            tenant=tenant,
            branch=branch,
            code='API',
            name='Principal',
            is_primary=True,
        )
        return {
            'tenant': tenant,
            'client': api_client,
            'user': user,
            'unit': unit,
            'product': product,
            'branch': branch,
            'supplier': supplier,
            'location': location,
        }

    return _run_in_tenant(tenant, _create)


def _h(headers, ctx):
    headers.setdefault('HTTP_X_TENANT_ID', str(ctx['tenant'].id))
    return headers


@pytest.mark.django_db
class TestSupplierAPI:
    def test_create_supplier(self, api_context):
        ctx = api_context
        resp = ctx['client'].post(
            '/api/v1/suppliers/',
            {
                'name': 'Novo Fornecedor',
                'cnpj': '11.111.111/0001-11',
                'phone': '11999999999',
                'email': 'novo@fornecedor.com',
            },
            content_type='application/json',
            **_h({}, ctx),
        )
        assert resp.status_code == 201
        assert resp.json()['name'] == 'Novo Fornecedor'

    def test_list_suppliers(self, api_context):
        ctx = api_context
        resp = ctx['client'].get('/api/v1/suppliers/', **_h({}, ctx))
        assert resp.status_code == 200
        assert len(resp.json()['results']) == 1
        assert resp.json()['results'][0]['name'] == 'Fornecedor Ltda'

    def test_retrieve_supplier(self, api_context):
        ctx = api_context
        resp = ctx['client'].get(f'/api/v1/suppliers/{ctx["supplier"].id}/', **_h({}, ctx))
        assert resp.status_code == 200
        assert resp.json()['cnpj'] == '00.000.000/0001-00'

    def test_update_supplier(self, api_context):
        ctx = api_context
        resp = ctx['client'].patch(
            f'/api/v1/suppliers/{ctx["supplier"].id}/',
            {'name': 'Fornecedor Atualizado'},
            content_type='application/json',
            **_h({}, ctx),
        )
        assert resp.status_code == 200
        assert resp.json()['name'] == 'Fornecedor Atualizado'

    def test_retrieve_supplier_from_another_tenant_returns_404(self, api_context):
        """Given another tenant's supplier, access through the active tenant returns 404."""
        ctx = api_context
        other_tenant = Tenant.objects.create(name='Other Purchasing API', slug='other-api')
        other_supplier = _run_in_tenant(
            other_tenant,
            lambda: Supplier.all_objects.create(
                tenant=other_tenant,
                name='Fornecedor de Outro Tenant',
            ),
        )

        response = ctx['client'].get(
            f'/api/v1/suppliers/{other_supplier.id}/',
            **_h({}, ctx),
        )

        assert response.status_code == 404


@pytest.mark.django_db
class TestPurchaseOrderAPI:
    def test_create_purchase_order(self, api_context):
        ctx = api_context
        resp = ctx['client'].post(
            '/api/v1/purchasing/orders/',
            {
                'supplier': str(ctx['supplier'].id),
                'branch': str(ctx['branch'].id),
                'notes': 'Pedido inicial',
            },
            content_type='application/json',
            **_h({}, ctx),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data['status'] == 'draft'
        assert data['supplier_name'] == 'Fornecedor Ltda'
        assert data['notes'] == 'Pedido inicial'

    def test_list_purchase_orders(self, api_context):
        ctx = api_context
        PurchaseOrder.all_objects.create(
            tenant=ctx['tenant'],
            supplier=ctx['supplier'],
            branch=ctx['branch'],
        )
        resp = ctx['client'].get('/api/v1/purchasing/orders/', **_h({}, ctx))
        assert resp.status_code == 200
        assert len(resp.json()['results']) == 1

    def test_retrieve_purchase_order(self, api_context):
        ctx = api_context
        po = PurchaseOrder.all_objects.create(
            tenant=ctx['tenant'],
            supplier=ctx['supplier'],
            branch=ctx['branch'],
        )
        resp = ctx['client'].get(f'/api/v1/purchasing/orders/{po.id}/', **_h({}, ctx))
        assert resp.status_code == 200
        assert resp.json()['supplier_name'] == 'Fornecedor Ltda'

    def test_approve_purchase_order(self, api_context):
        ctx = api_context
        po = PurchaseOrder.all_objects.create(
            tenant=ctx['tenant'],
            supplier=ctx['supplier'],
            branch=ctx['branch'],
        )
        PurchaseOrderItem.all_objects.create(
            tenant=ctx['tenant'],
            purchase_order=po,
            product=ctx['product'],
            unit=ctx['unit'],
            quantity=Decimal('5'),
            unit_cost=Decimal('10'),
            factor=Decimal('1'),
        )
        resp = ctx['client'].post(
            f'/api/v1/purchasing/orders/{po.id}/approve/',
            {},
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY='approve-po-test',
            **_h({}, ctx),
        )
        assert resp.status_code == 200
        po.refresh_from_db()
        assert po.status == 'approved'

    def test_receive_purchase_order(self, api_context):
        ctx = api_context
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
            unit_cost=Decimal('5'),
            factor=Decimal('1'),
        )
        approve_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=po,
            idempotency_key='receive-approve',
        )
        resp = ctx['client'].post(
            f'/api/v1/purchasing/orders/{po.id}/receive/',
            {
                'items': [
                    {
                        'purchase_order_item_id': str(item.id),
                        'quantity_received': '10',
                    }
                ],
            },
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY='receive-po-test',
            **_h({}, ctx),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data['status'] == 'confirmed'
        assert data['supplier_name'] == 'Fornecedor Ltda'

    def test_receive_without_idempotency(self, api_context):
        ctx = api_context
        po = PurchaseOrder.all_objects.create(
            tenant=ctx['tenant'],
            supplier=ctx['supplier'],
            branch=ctx['branch'],
        )
        PurchaseOrderItem.all_objects.create(
            tenant=ctx['tenant'],
            purchase_order=po,
            product=ctx['product'],
            unit=ctx['unit'],
            quantity=Decimal('5'),
            unit_cost=Decimal('10'),
            factor=Decimal('1'),
        )
        approve_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=po,
            idempotency_key='receive-no-key-approve',
        )
        resp = ctx['client'].post(
            f'/api/v1/purchasing/orders/{po.id}/receive/',
            {
                'items': [
                    {
                        'purchase_order_item_id': '00000000-0000-0000-0000-000000000000',
                        'quantity_received': '5',
                    }
                ],
            },
            content_type='application/json',
            **_h({}, ctx),
        )
        assert resp.status_code == 400

    def test_approved_purchase_order_cannot_be_updated(self, api_context):
        """Given an approved order, when patched, then preserve its immutable snapshot."""
        ctx = api_context
        po = PurchaseOrder.all_objects.create(
            tenant=ctx['tenant'],
            supplier=ctx['supplier'],
            branch=ctx['branch'],
        )
        PurchaseOrderItem.all_objects.create(
            tenant=ctx['tenant'],
            purchase_order=po,
            product=ctx['product'],
            unit=ctx['unit'],
            quantity=Decimal('1'),
            unit_cost=Decimal('10'),
            factor=Decimal('1'),
        )
        approve_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=po,
            idempotency_key='immutable-update',
        )

        response = ctx['client'].patch(
            f'/api/v1/purchasing/orders/{po.id}/',
            {'notes': 'mutated'},
            content_type='application/json',
            **_h({}, ctx),
        )

        assert response.status_code == 400
        po.refresh_from_db()
        assert po.notes == ''

    def test_approved_purchase_order_cannot_be_deleted(self, api_context):
        """Given an approved order, when deleted, then preserve its audit history."""
        ctx = api_context
        po = PurchaseOrder.all_objects.create(
            tenant=ctx['tenant'],
            supplier=ctx['supplier'],
            branch=ctx['branch'],
        )
        PurchaseOrderItem.all_objects.create(
            tenant=ctx['tenant'],
            purchase_order=po,
            product=ctx['product'],
            unit=ctx['unit'],
            quantity=Decimal('1'),
            unit_cost=Decimal('10'),
            factor=Decimal('1'),
        )
        approve_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=po,
            idempotency_key='immutable-delete',
        )

        response = ctx['client'].delete(
            f'/api/v1/purchasing/orders/{po.id}/',
            **_h({}, ctx),
        )

        assert response.status_code == 400
        assert PurchaseOrder.all_objects.filter(pk=po.id).exists()

    def test_receive_requires_non_empty_items(self, api_context):
        """Given an approved order, when receipt items are empty, then return Problem Details."""
        ctx = api_context
        po = PurchaseOrder.all_objects.create(
            tenant=ctx['tenant'],
            supplier=ctx['supplier'],
            branch=ctx['branch'],
        )
        PurchaseOrderItem.all_objects.create(
            tenant=ctx['tenant'],
            purchase_order=po,
            product=ctx['product'],
            unit=ctx['unit'],
            quantity=Decimal('1'),
            unit_cost=Decimal('10'),
            factor=Decimal('1'),
        )
        approve_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=po,
            idempotency_key='empty-api-approve',
        )

        response = ctx['client'].post(
            f'/api/v1/purchasing/orders/{po.id}/receive/',
            {'items': []},
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY='empty-api-receive',
            **_h({}, ctx),
        )

        assert response.status_code == 400
        assert response.json()['type'].endswith('/invalid_receipt')
        assert response['Content-Type'].startswith('application/problem+json')

    @pytest.mark.parametrize(
        'item_payload',
        [
            {'quantity_received': 'not-a-number'},
            {'quantity_received': '1', 'unit_cost': '-1'},
        ],
    )
    def test_receive_rejects_invalid_decimals_as_problem_details(
        self,
        api_context,
        item_payload,
    ):
        """Given invalid receipt decimals, when posted, then return 400 instead of 500."""
        ctx = api_context
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
            quantity=Decimal('1'),
            unit_cost=Decimal('10'),
            factor=Decimal('1'),
        )
        approve_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=po,
            idempotency_key=f'invalid-{po.id}',
        )

        response = ctx['client'].post(
            f'/api/v1/purchasing/orders/{po.id}/receive/',
            {'items': [{'purchase_order_item_id': str(item.id), **item_payload}]},
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY=f'invalid-receipt-{po.id}',
            **_h({}, ctx),
        )

        assert response.status_code == 400
        assert response.json()['type'].endswith('/invalid_receipt')
        assert response['Content-Type'].startswith('application/problem+json')


@pytest.mark.django_db
class TestPurchaseOrderItemAPI:
    def test_create_item(self, api_context):
        ctx = api_context
        po = PurchaseOrder.all_objects.create(
            tenant=ctx['tenant'],
            supplier=ctx['supplier'],
            branch=ctx['branch'],
        )
        resp = ctx['client'].post(
            '/api/v1/purchase-order-items/',
            {
                'purchase_order': str(po.id),
                'product': str(ctx['product'].id),
                'unit': str(ctx['unit'].id),
                'quantity': '10',
                'unit_cost': '5.00',
                'factor': '1',
            },
            content_type='application/json',
            **_h({}, ctx),
        )
        assert resp.status_code == 201
        assert resp.json()['product_name'] == 'Produto Compra'

    def test_list_items_by_po(self, api_context):
        ctx = api_context
        po = PurchaseOrder.all_objects.create(
            tenant=ctx['tenant'],
            supplier=ctx['supplier'],
            branch=ctx['branch'],
        )
        PurchaseOrderItem.all_objects.create(
            tenant=ctx['tenant'],
            purchase_order=po,
            product=ctx['product'],
            unit=ctx['unit'],
            quantity=Decimal('10'),
            unit_cost=Decimal('5'),
            factor=Decimal('1'),
        )
        resp = ctx['client'].get(
            f'/api/v1/purchase-order-items/?purchase_order={po.id}',
            **_h({}, ctx),
        )
        assert resp.status_code == 200
        assert len(resp.json()['results']) == 1

    def test_approved_purchase_order_item_cannot_be_deleted(self, api_context):
        """Given an approved order item, when deleted, then preserve the immutable snapshot."""
        ctx = api_context
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
            quantity=Decimal('1'),
            unit_cost=Decimal('10'),
            factor=Decimal('1'),
        )
        approve_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=po,
            idempotency_key='immutable-item-delete',
        )

        response = ctx['client'].delete(
            f'/api/v1/purchase-order-items/{item.id}/',
            **_h({}, ctx),
        )

        assert response.status_code == 400
        assert PurchaseOrderItem.all_objects.filter(pk=item.id).exists()

    def test_approved_purchase_order_item_cannot_be_updated(self, api_context):
        """Given an approved order item, when patched, then preserve its snapshot."""
        ctx = api_context
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
            quantity=Decimal('1'),
            unit_cost=Decimal('10'),
            factor=Decimal('1'),
        )
        approve_purchase_order(
            tenant=ctx['tenant'],
            purchase_order=po,
            idempotency_key='immutable-item-update',
        )

        response = ctx['client'].patch(
            f'/api/v1/purchase-order-items/{item.id}/',
            {'quantity': '2'},
            content_type='application/json',
            **_h({}, ctx),
        )

        assert response.status_code == 400
        item.refresh_from_db()
        assert item.quantity == Decimal('1')


@pytest.mark.django_db
class TestPurchaseReceiptAPI:
    def test_list_receipts(self, api_context):
        ctx = api_context
        po = PurchaseOrder.all_objects.create(
            tenant=ctx['tenant'],
            supplier=ctx['supplier'],
            branch=ctx['branch'],
        )
        from purchasing.models import PurchaseReceipt

        PurchaseReceipt.all_objects.create(
            tenant=ctx['tenant'],
            purchase_order=po,
            status='confirmed',
        )
        resp = ctx['client'].get('/api/v1/purchase-receipts/', **_h({}, ctx))
        assert resp.status_code == 200
        assert len(resp.json()['results']) == 1

    def test_retrieve_receipt(self, api_context):
        ctx = api_context
        po = PurchaseOrder.all_objects.create(
            tenant=ctx['tenant'],
            supplier=ctx['supplier'],
            branch=ctx['branch'],
        )
        from purchasing.models import PurchaseReceipt

        rct = PurchaseReceipt.all_objects.create(
            tenant=ctx['tenant'],
            purchase_order=po,
            status='confirmed',
        )
        resp = ctx['client'].get(f'/api/v1/purchase-receipts/{rct.id}/', **_h({}, ctx))
        assert resp.status_code == 200
        assert resp.json()['supplier_name'] == 'Fornecedor Ltda'
