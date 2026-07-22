from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.utils import timezone

from catalog.models import Category, Product, Unit
from inventory.models import StockBalance, StockLocation, StockMovement, StockOperation
from purchasing.models import PurchaseOrder, PurchaseOrderItem, PurchaseReceipt, Supplier
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


def _auth_client(client, user, tenant, role='admin'):
    TenantMembership.objects.update_or_create(
        user=user,
        tenant=tenant,
        defaults={'role': role, 'is_active': True},
    )
    client.force_login(user)
    session = client.session
    session['mfa_tenant_id'] = str(tenant.id)
    session['mfa_method'] = 'totp'
    session.save()
    return client


@pytest.fixture(autouse=True)
def _reset_pg_tenant_ctx():
    with connection.cursor() as cursor:
        cursor.execute('RESET app.current_tenant_id')
    yield
    with connection.cursor() as cursor:
        cursor.execute('RESET app.current_tenant_id')


@pytest.fixture
def ops_tenant():
    return Tenant.objects.create(name='Ops Web', slug='ops-web')


@pytest.fixture
def ops_other_tenant():
    return Tenant.objects.create(name='Other Ops', slug='other-ops')


@pytest.fixture
def ops_user(ops_tenant):
    return User.objects.create_user(email='ops-admin@test.local', password='pass123')


@pytest.fixture
def ops_operator(ops_tenant):
    return User.objects.create_user(email='ops-opr@test.local', password='pass123')


@pytest.fixture
def admin_client(client, ops_user, ops_tenant):
    return _auth_client(client, ops_user, ops_tenant, 'admin')


@pytest.fixture
def operator_client(client, ops_operator, ops_tenant):
    return _auth_client(client, ops_operator, ops_tenant, 'operator')


@pytest.fixture
def ops_branch(ops_tenant):
    return _run_in_tenant(
        ops_tenant,
        lambda: Branch.all_objects.create(
            tenant=ops_tenant,
            company=Company.all_objects.create(tenant=ops_tenant, name='Ops Co'),
            name='Ops Branch',
        ),
    )


@pytest.fixture
def ops_unit(ops_tenant):
    return _run_in_tenant(
        ops_tenant,
        lambda: Unit.all_objects.create(
            tenant=ops_tenant, symbol='UN', name='Unidade',
        ),
    )


@pytest.fixture
def ops_category(ops_tenant):
    return _run_in_tenant(
        ops_tenant,
        lambda: Category.all_objects.create(
            tenant=ops_tenant, name='Categoria Teste',
        ),
    )


@pytest.fixture
def ops_product(ops_tenant, ops_unit, ops_category):
    return _run_in_tenant(
        ops_tenant,
        lambda: Product.all_objects.create(
            tenant=ops_tenant, sku='PROD-001', name='Produto Teste',
            base_unit=ops_unit, category=ops_category,
        ),
    )


@pytest.fixture
def ops_supplier(ops_tenant):
    return _run_in_tenant(
        ops_tenant,
        lambda: Supplier.all_objects.create(
            tenant=ops_tenant, name='Fornecedor Teste',
        ),
    )


@pytest.fixture
def ops_location(ops_tenant, ops_branch):
    return _run_in_tenant(
        ops_tenant,
        lambda: StockLocation.all_objects.create(
            tenant=ops_tenant, branch=ops_branch,
            code='PRINCIPAL', name='Principal',
        ),
    )


# ==================== CATALOG TESTS ====================


@pytest.mark.django_db
class TestCatalogFilters:
    def test_product_search_by_q_name(self, admin_client, ops_tenant, ops_unit):
        _run_in_tenant(ops_tenant, lambda: [
            Product.all_objects.create(tenant=ops_tenant, sku='A-001', name='Produto Alimenticio', base_unit=ops_unit),
            Product.all_objects.create(tenant=ops_tenant, sku='B-002', name='Produto Higiene', base_unit=ops_unit),
            Product.all_objects.create(tenant=ops_tenant, sku='C-003', name='Brinquedo', base_unit=ops_unit),
        ])
        resp = admin_client.get(
            '/api/v1/products/?q=produto',
            HTTP_X_TENANT_ID=str(ops_tenant.id),
        )
        assert resp.status_code == 200
        body = resp.json()
        results = body.get('results', body)
        assert len(results) == 2

    def test_product_search_by_q_sku(self, admin_client, ops_tenant, ops_unit):
        _run_in_tenant(ops_tenant, lambda: [
            Product.all_objects.create(tenant=ops_tenant, sku='XPTO-123', name='Alvo', base_unit=ops_unit),
            Product.all_objects.create(tenant=ops_tenant, sku='OUTRO-456', name='Outro', base_unit=ops_unit),
        ])
        resp = admin_client.get(
            '/api/v1/products/?q=XPTO',
            HTTP_X_TENANT_ID=str(ops_tenant.id),
        )
        assert resp.status_code == 200
        body = resp.json()
        results = body.get('results', body)
        assert len(results) == 1
        assert results[0]['sku'] == 'XPTO-123'

    def test_product_filter_by_category(self, admin_client, ops_tenant, ops_unit, ops_category):
        _run_in_tenant(ops_tenant, lambda: [
            Product.all_objects.create(tenant=ops_tenant, sku='CAT-A', name='Na Categoria', base_unit=ops_unit, category=ops_category),
            Product.all_objects.create(tenant=ops_tenant, sku='CAT-B', name='Sem Categoria', base_unit=ops_unit),
        ])
        resp = admin_client.get(
            f'/api/v1/products/?category={ops_category.id}',
            HTTP_X_TENANT_ID=str(ops_tenant.id),
        )
        assert resp.status_code == 200
        body = resp.json()
        results = body.get('results', body)
        assert len(results) == 1
        assert results[0]['sku'] == 'CAT-A'

    def test_product_filter_by_active(self, admin_client, ops_tenant, ops_unit):
        _run_in_tenant(ops_tenant, lambda: [
            Product.all_objects.create(tenant=ops_tenant, sku='ACT-A', name='Ativo', base_unit=ops_unit, is_active=True),
            Product.all_objects.create(tenant=ops_tenant, sku='ACT-B', name='Inativo', base_unit=ops_unit, is_active=False),
        ])
        resp = admin_client.get(
            '/api/v1/products/?is_active=true',
            HTTP_X_TENANT_ID=str(ops_tenant.id),
        )
        assert resp.status_code == 200
        body = resp.json()
        results = body.get('results', body)
        assert len(results) == 1
        assert results[0]['sku'] == 'ACT-A'

    def test_category_search_by_q(self, admin_client, ops_tenant):
        _run_in_tenant(ops_tenant, lambda: [
            Category.all_objects.create(tenant=ops_tenant, name='Racoes'),
            Category.all_objects.create(tenant=ops_tenant, name='Medicamentos'),
            Category.all_objects.create(tenant=ops_tenant, name='Higiene'),
        ])
        resp = admin_client.get(
            '/api/v1/categories/?q=rac',
            HTTP_X_TENANT_ID=str(ops_tenant.id),
        )
        assert resp.status_code == 200
        body = resp.json()
        results = body.get('results', body)
        assert len(results) == 1

    def test_units_paginated_response(self, admin_client, ops_tenant, ops_unit):
        _run_in_tenant(ops_tenant, lambda: Unit.all_objects.create(tenant=ops_tenant, symbol='KG', name='Quilograma'))
        resp = admin_client.get(
            '/api/v1/units/',
            HTTP_X_TENANT_ID=str(ops_tenant.id),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert 'next' in body
        assert 'previous' in body
        assert 'results' in body
        assert len(body['results']) >= 1

    def test_operator_cannot_create_product(self, operator_client, ops_tenant, ops_unit):
        resp = operator_client.post(
            '/api/v1/products/',
            {'sku': 'OP-BLOCK', 'name': 'Blocked', 'base_unit': str(ops_unit.id)},
            format='json',
            HTTP_X_TENANT_ID=str(ops_tenant.id),
        )
        assert resp.status_code == 403

    def test_operator_can_list_products(self, operator_client, ops_tenant, ops_unit, ops_product):
        resp = operator_client.get(
            '/api/v1/products/',
            HTTP_X_TENANT_ID=str(ops_tenant.id),
        )
        assert resp.status_code == 200

    def test_tenant_isolation_products(self, admin_client, ops_tenant, ops_other_tenant, ops_unit):
        _run_in_tenant(
            ops_other_tenant,
            lambda: Product.all_objects.create(
                tenant=ops_other_tenant, sku='OTHER', name='Other', base_unit=ops_unit,
            ),
        )
        resp = admin_client.get(
            '/api/v1/products/',
            HTTP_X_TENANT_ID=str(ops_tenant.id),
        )
        assert resp.status_code == 200
        body = resp.json()
        results = body.get('results', body)
        assert all(p['sku'] != 'OTHER' for p in results)

    def test_version_conflict_returns_409(self, admin_client, ops_tenant, ops_unit):
        create_resp = admin_client.post(
            '/api/v1/products/',
            {'sku': 'VER-CONF', 'name': 'Version Conflict', 'base_unit': str(ops_unit.id)},
            format='json',
            HTTP_X_TENANT_ID=str(ops_tenant.id),
        )
        assert create_resp.status_code == 201
        product_id = create_resp.json()['id']
        resp = admin_client.put(
            f'/api/v1/products/{product_id}/',
            {'sku': 'VER-CONF', 'name': 'Updated', 'base_unit': str(ops_unit.id)},
            format='json',
            HTTP_X_TENANT_ID=str(ops_tenant.id),
            HTTP_IF_MATCH='0',
        )
        assert resp.status_code == 409
        body = resp.json()
        assert body['code'] == 'CONFLICT_VERSION_MISMATCH'


# ==================== INVENTORY TESTS ====================


@pytest.mark.django_db
class TestInventoryFilters:
    def test_balance_filter_by_branch(self, admin_client, ops_tenant, ops_branch, ops_product, ops_location):
        _run_in_tenant(ops_tenant, lambda:
            StockBalance.all_objects.create(
                tenant=ops_tenant, product=ops_product, location=ops_location,
                quantity=Decimal('10'),
            )
        )
        other_loc = _run_in_tenant(
            ops_tenant,
            lambda: StockLocation.all_objects.create(
                tenant=ops_tenant, branch=ops_branch, code='OUTRO', name='Outro',
            ),
        )
        other_branch = _run_in_tenant(
            ops_tenant,
            lambda: Branch.all_objects.create(
                tenant=ops_tenant,
                company=Company.all_objects.create(tenant=ops_tenant, name='Outra Co'),
                name='Outra Branch',
            ),
        )
        other_loc2 = _run_in_tenant(
            ops_tenant,
            lambda: StockLocation.all_objects.create(
                tenant=ops_tenant, branch=other_branch, code='OUTRO2', name='Outro 2',
            ),
        )
        _run_in_tenant(ops_tenant, lambda:
            StockBalance.all_objects.create(
                tenant=ops_tenant, product=ops_product, location=other_loc,
                quantity=Decimal('5'),
            )
        )
        _run_in_tenant(ops_tenant, lambda:
            StockBalance.all_objects.create(
                tenant=ops_tenant, product=ops_product, location=other_loc2,
                quantity=Decimal('3'),
            )
        )
        resp = admin_client.get(
            f'/api/v1/stock-balances/?branch={ops_branch.id}',
            HTTP_X_TENANT_ID=str(ops_tenant.id),
        )
        assert resp.status_code == 200
        body = resp.json()
        results = body.get('results', body)
        assert len(results) == 2

    def test_balance_filter_by_location(self, admin_client, ops_tenant, ops_product, ops_branch, ops_location):
        _run_in_tenant(ops_tenant, lambda:
            StockBalance.all_objects.create(
                tenant=ops_tenant, product=ops_product, location=ops_location,
                quantity=Decimal('10'),
            )
        )
        other_loc = _run_in_tenant(
            ops_tenant,
            lambda: StockLocation.all_objects.create(
                tenant=ops_tenant, branch=ops_branch, code='OUTRO', name='Outro',
            ),
        )
        _run_in_tenant(ops_tenant, lambda:
            StockBalance.all_objects.create(
                tenant=ops_tenant, product=ops_product, location=other_loc,
                quantity=Decimal('5'),
            )
        )
        resp = admin_client.get(
            f'/api/v1/stock-balances/?location={ops_location.id}',
            HTTP_X_TENANT_ID=str(ops_tenant.id),
        )
        assert resp.status_code == 200
        body = resp.json()
        results = body.get('results', body)
        assert len(results) == 1

    def test_balance_filter_by_product(self, admin_client, ops_tenant, ops_unit, ops_branch, ops_location, ops_product):
        other_product = _run_in_tenant(
            ops_tenant,
            lambda: Product.all_objects.create(
                tenant=ops_tenant, sku='OUTRO-PROD', name='Outro Produto', base_unit=ops_unit,
            ),
        )
        _run_in_tenant(ops_tenant, lambda:
            StockBalance.all_objects.create(
                tenant=ops_tenant, product=ops_product, location=ops_location,
                quantity=Decimal('10'),
            )
        )
        _run_in_tenant(ops_tenant, lambda:
            StockBalance.all_objects.create(
                tenant=ops_tenant, product=other_product, location=ops_location,
                quantity=Decimal('5'),
            )
        )
        resp = admin_client.get(
            f'/api/v1/stock-balances/?product={ops_product.id}',
            HTTP_X_TENANT_ID=str(ops_tenant.id),
        )
        assert resp.status_code == 200
        body = resp.json()
        results = body.get('results', body)
        assert len(results) == 1

    def test_movement_filter_by_date_from(self, admin_client, ops_tenant, ops_product, ops_location, ops_unit):
        operation = _run_in_tenant(ops_tenant, lambda:
            StockOperation.all_objects.create(
                tenant=ops_tenant, operation_type='receipt', status='confirmed',
                branch=Branch.all_objects.first(),
                actor=User.objects.first(),
            )
        )
        _run_in_tenant(ops_tenant, lambda:
            StockMovement.all_objects.create(
                tenant=ops_tenant, operation=operation, product=ops_product,
                location=ops_location, direction='in',
                quantity=Decimal('10'), unit=ops_unit,
                created_at=timezone.now(),
            )
        )
        resp = admin_client.get(
            '/api/v1/stock-movements/?date_from=2020-01-01',
            HTTP_X_TENANT_ID=str(ops_tenant.id),
        )
        assert resp.status_code == 200

    def test_movement_filter_by_date_to(self, admin_client, ops_tenant, ops_product, ops_location, ops_unit):
        operation = _run_in_tenant(ops_tenant, lambda:
            StockOperation.all_objects.create(
                tenant=ops_tenant, operation_type='receipt', status='confirmed',
            )
        )
        _run_in_tenant(ops_tenant, lambda:
            StockMovement.all_objects.create(
                tenant=ops_tenant, operation=operation, product=ops_product,
                location=ops_location, direction='in',
                quantity=Decimal('10'), unit=ops_unit,
                created_at=timezone.now(),
            )
        )
        resp = admin_client.get(
            '/api/v1/stock-movements/?date_to=2030-12-31',
            HTTP_X_TENANT_ID=str(ops_tenant.id),
        )
        assert resp.status_code == 200

    def test_movement_filter_by_type(self, admin_client, ops_tenant, ops_product, ops_location, ops_unit):
        operation = _run_in_tenant(ops_tenant, lambda:
            StockOperation.all_objects.create(
                tenant=ops_tenant, operation_type='receipt', status='confirmed',
            )
        )
        _run_in_tenant(ops_tenant, lambda:
            StockMovement.all_objects.create(
                tenant=ops_tenant, operation=operation, product=ops_product,
                location=ops_location, direction='in',
                quantity=Decimal('10'), unit=ops_unit,
            )
        )
        _run_in_tenant(ops_tenant, lambda:
            StockMovement.all_objects.create(
                tenant=ops_tenant, operation=operation, product=ops_product,
                location=ops_location, direction='out',
                quantity=Decimal('5'), unit=ops_unit,
            )
        )
        resp = admin_client.get(
            '/api/v1/stock-movements/?type=in',
            HTTP_X_TENANT_ID=str(ops_tenant.id),
        )
        assert resp.status_code == 200
        body = resp.json()
        results = body.get('results', body)
        assert len(results) == 1

    def test_movement_filter_by_type_out(self, admin_client, ops_tenant, ops_product, ops_location, ops_unit):
        operation = _run_in_tenant(ops_tenant, lambda:
            StockOperation.all_objects.create(
                tenant=ops_tenant, operation_type='issue', status='confirmed',
            )
        )
        _run_in_tenant(ops_tenant, lambda:
            StockMovement.all_objects.create(
                tenant=ops_tenant, operation=operation, product=ops_product,
                location=ops_location, direction='in',
                quantity=Decimal('10'), unit=ops_unit,
            )
        )
        _run_in_tenant(ops_tenant, lambda:
            StockMovement.all_objects.create(
                tenant=ops_tenant, operation=operation, product=ops_product,
                location=ops_location, direction='out',
                quantity=Decimal('5'), unit=ops_unit,
            )
        )
        resp = admin_client.get(
            '/api/v1/stock-movements/?type=out',
            HTTP_X_TENANT_ID=str(ops_tenant.id),
        )
        assert resp.status_code == 200
        body = resp.json()
        results = body.get('results', body)
        assert len(results) == 1


# ==================== PURCHASING TESTS ====================


@pytest.mark.django_db
class TestPurchasingFilters:
    def test_po_filter_by_status(self, admin_client, ops_tenant, ops_supplier, ops_branch):
        _run_in_tenant(ops_tenant, lambda: [
            PurchaseOrder.all_objects.create(tenant=ops_tenant, supplier=ops_supplier, branch=ops_branch, status='draft'),
            PurchaseOrder.all_objects.create(tenant=ops_tenant, supplier=ops_supplier, branch=ops_branch, status='approved'),
            PurchaseOrder.all_objects.create(tenant=ops_tenant, supplier=ops_supplier, branch=ops_branch, status='draft'),
        ])
        resp = admin_client.get(
            '/api/v1/purchase-orders/?status=approved',
            HTTP_X_TENANT_ID=str(ops_tenant.id),
        )
        assert resp.status_code == 200
        body = resp.json()
        results = body.get('results', body)
        assert len(results) == 1
        assert results[0]['status'] == 'approved'

    def test_po_filter_by_supplier(self, admin_client, ops_tenant, ops_supplier, ops_branch):
        other_supplier = _run_in_tenant(
            ops_tenant,
            lambda: Supplier.all_objects.create(tenant=ops_tenant, name='Outro Fornecedor'),
        )
        _run_in_tenant(ops_tenant, lambda:
            PurchaseOrder.all_objects.create(tenant=ops_tenant, supplier=ops_supplier, branch=ops_branch),
        )
        _run_in_tenant(ops_tenant, lambda:
            PurchaseOrder.all_objects.create(tenant=ops_tenant, supplier=other_supplier, branch=ops_branch),
        )
        resp = admin_client.get(
            f'/api/v1/purchase-orders/?supplier={ops_supplier.id}',
            HTTP_X_TENANT_ID=str(ops_tenant.id),
        )
        assert resp.status_code == 200
        body = resp.json()
        results = body.get('results', body)
        assert len(results) == 1

    def test_po_filter_by_branch(self, admin_client, ops_tenant, ops_supplier, ops_branch):
        other_branch = _run_in_tenant(
            ops_tenant,
            lambda: Branch.all_objects.create(
                tenant=ops_tenant,
                company=Company.all_objects.create(tenant=ops_tenant, name='Outra Co 2'),
                name='Outra Branch',
            ),
        )
        _run_in_tenant(ops_tenant, lambda:
            PurchaseOrder.all_objects.create(tenant=ops_tenant, supplier=ops_supplier, branch=ops_branch),
        )
        _run_in_tenant(ops_tenant, lambda:
            PurchaseOrder.all_objects.create(tenant=ops_tenant, supplier=ops_supplier, branch=other_branch),
        )
        resp = admin_client.get(
            f'/api/v1/purchase-orders/?branch={ops_branch.id}',
            HTTP_X_TENANT_ID=str(ops_tenant.id),
        )
        assert resp.status_code == 200
        body = resp.json()
        results = body.get('results', body)
        assert len(results) == 1

    def test_receipt_filter_by_status(self, admin_client, ops_tenant, ops_supplier, ops_branch):
        po = _run_in_tenant(ops_tenant, lambda:
            PurchaseOrder.all_objects.create(tenant=ops_tenant, supplier=ops_supplier, branch=ops_branch),
        )
        _run_in_tenant(ops_tenant, lambda: [
            PurchaseReceipt.all_objects.create(tenant=ops_tenant, purchase_order=po, status='draft'),
            PurchaseReceipt.all_objects.create(tenant=ops_tenant, purchase_order=po, status='confirmed'),
        ])
        resp = admin_client.get(
            '/api/v1/purchase-receipts/?status=draft',
            HTTP_X_TENANT_ID=str(ops_tenant.id),
        )
        assert resp.status_code == 200
        body = resp.json()
        results = body.get('results', body)
        assert len(results) == 1
        assert results[0]['status'] == 'draft'

    def test_receipt_filter_by_order(self, admin_client, ops_tenant, ops_supplier, ops_branch):
        po_a = _run_in_tenant(ops_tenant, lambda:
            PurchaseOrder.all_objects.create(tenant=ops_tenant, supplier=ops_supplier, branch=ops_branch),
        )
        po_b = _run_in_tenant(ops_tenant, lambda:
            PurchaseOrder.all_objects.create(tenant=ops_tenant, supplier=ops_supplier, branch=ops_branch),
        )
        _run_in_tenant(ops_tenant, lambda:
            PurchaseReceipt.all_objects.create(tenant=ops_tenant, purchase_order=po_a),
        )
        _run_in_tenant(ops_tenant, lambda:
            PurchaseReceipt.all_objects.create(tenant=ops_tenant, purchase_order=po_b),
        )
        resp = admin_client.get(
            f'/api/v1/purchase-receipts/?order={po_a.id}',
            HTTP_X_TENANT_ID=str(ops_tenant.id),
        )
        assert resp.status_code == 200
        body = resp.json()
        results = body.get('results', body)
        assert len(results) == 1


# ==================== IDEMPOTENCY TESTS ====================


@pytest.mark.django_db
class TestIdempotencyConflict:
    def test_idempotency_key_conflict_returns_409(self, admin_client, ops_tenant, ops_product, ops_location, ops_unit, ops_branch):
        from inventory.services import create_receipt
        _run_in_tenant(ops_tenant, lambda:
            create_receipt(
                ops_tenant, ops_branch, ops_product, ops_location,
                Decimal('10'), ops_unit, Decimal('1'),
                idempotency_key='dup-key-test',
                actor=User.objects.first(),
            )
        )
        resp = admin_client.post(
            '/api/v1/stock-operations/receipt/',
            {
                'branch': str(ops_branch.id),
                'product': str(ops_product.id),
                'location': str(ops_location.id),
                'quantity': '5',
                'unit': str(ops_unit.id),
            },
            content_type='application/json',
            HTTP_IDEMPOTENCY_KEY='dup-key-test',
            HTTP_X_TENANT_ID=str(ops_tenant.id),
        )
        assert resp.status_code == 409
        body = resp.json()
        assert 'type' in body
        assert 'idempotency_conflict' in body['type']
