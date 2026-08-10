"""Sprint R4 — BDD acceptance contract for product pricing and margins."""

from datetime import UTC, datetime
from decimal import Decimal
from threading import Barrier, Thread
from uuid import uuid4

import pytest
from django.contrib.auth import get_user_model
from django.db import close_old_connections, connection

from catalog.models import (
    Product,
    ProductApplyCommand,
    ProductPrice,
    ProductPriceTier,
    Unit,
)
from catalog.services.pricing import SprintR4Command, execute_r4_command
from purchasing.models import (
    PurchaseOrder,
    PurchaseOrderItem,
    PurchaseReceipt,
    PurchaseReceiptItem,
    Supplier,
)
from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Branch, Company, Tenant, TenantMembership

User = get_user_model()
FIXED_PRICING_INSTANT = datetime(2026, 1, 1, 12, tzinfo=UTC)


def _run_in_tenant(tenant, callback):
    token = set_current_tenant_id(tenant.id)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'SELECT set_config(%s, %s, true)',
                ['app.current_tenant_id', str(tenant.id)],
            )
        return callback()
    finally:
        reset_current_tenant_id(token)


@pytest.fixture
def r4_pricing_context(client):
    tenant = Tenant.objects.create(name='R4 Pricing', slug='r4-pricing')
    user = User.objects.create_user(email='r4-pricing@test.local', password='pass123')
    TenantMembership.objects.create(
        user=user,
        tenant=tenant,
        role='admin',
        is_active=True,
    )

    def _create_catalog_data():
        unit = Unit.objects.create(
            tenant=tenant,
            symbol='UN',
            name='Unidade',
        )
        product = Product.objects.create(
            tenant=tenant,
            sku='R4-PRICING',
            name='Produto R4',
            base_unit=unit,
        )
        ProductPrice.objects.create(
            tenant=tenant,
            product=product,
            amount=Decimal('100.00'),
            valid_from=FIXED_PRICING_INSTANT,
        )
        company = Company.objects.create(tenant=tenant, name='R4 Company')
        branch = Branch.objects.create(tenant=tenant, company=company, name='R4 Branch')
        supplier = Supplier.objects.create(tenant=tenant, name='R4 Supplier')
        order = PurchaseOrder.objects.create(tenant=tenant, supplier=supplier, branch=branch)
        order_item = PurchaseOrderItem.objects.create(
            tenant=tenant,
            purchase_order=order,
            product=product,
            unit=unit,
            quantity=Decimal('1'),
            unit_cost=Decimal('75.00'),
            factor=Decimal('1'),
        )
        receipt = PurchaseReceipt.objects.create(
            tenant=tenant, purchase_order=order, status='confirmed',
        )
        PurchaseReceiptItem.objects.create(
            tenant=tenant,
            receipt=receipt,
            purchase_order_item=order_item,
            quantity_received=Decimal('1'),
            unit_cost=Decimal('75.00'),
        )
        return product

    product = _run_in_tenant(tenant, _create_catalog_data)
    client.force_login(user)
    session = client.session
    session['mfa_tenant_id'] = str(tenant.id)
    session['mfa_method'] = 'totp'
    session.save()
    return client, tenant, product


@pytest.mark.django_db
def test_r4_acceptance_contract(r4_pricing_context):
    # Given an authenticated tenant and valid sprint fixture
    api_client, tenant, product = r4_pricing_context

    # When the canonical contract is requested
    response = api_client.get(
        f'/api/v1/catalog/products/{product.id}/prices/',
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    # Then the vertical invariant is observable
    assert response.status_code in {200, 201}
    assert response.json()['retail_margin'] == '25.00'


@pytest.mark.django_db
def test_r4_preserves_legacy_price_list_contract(r4_pricing_context):
    api_client, tenant, product = r4_pricing_context
    response = api_client.get(
        f'/api/v1/products/{product.id}/prices/',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert response.status_code == 200
    assert response.json()['results'][0]['amount'] == '100.0000'


@pytest.mark.django_db
def test_legacy_price_write_does_not_activate_r4_command_flow(r4_pricing_context):
    api_client, tenant, product = r4_pricing_context
    command_id = str(uuid4())
    response = api_client.post(
        f'/api/v1/products/{product.id}/prices/',
        {
            'command_id': command_id,
            'amount': '110.00',
            'valid_from': '2025-01-01T12:00:00Z',
            'valid_to': '2025-12-31T12:00:00Z',
        },
        content_type='application/json',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert response.status_code == 201
    assert not ProductApplyCommand.all_objects.filter(command_id=command_id).exists()


@pytest.mark.django_db
def test_r4_acceptance_contract_isolates_tenant(r4_pricing_context):
    """Given tenant B's product, tenant A cannot retrieve it by identifier."""
    # Given an authenticated tenant A and a product owned by tenant B
    api_client, tenant_a, _ = r4_pricing_context
    tenant_b = Tenant.objects.create(name='R4 Other Pricing', slug='r4-other-pricing')

    def _create_tenant_b_product():
        unit_b = Unit.objects.create(
            tenant=tenant_b,
            symbol='UN',
            name='Unidade B',
        )
        product_b = Product.objects.create(
            tenant=tenant_b,
            sku='R4-PRICING-B',
            name='Produto R4 B',
            base_unit=unit_b,
        )
        ProductPrice.objects.create(
            tenant=tenant_b,
            product=product_b,
            amount=Decimal('80.00'),
            valid_from=FIXED_PRICING_INSTANT,
        )
        return product_b

    product_b = _run_in_tenant(tenant_b, _create_tenant_b_product)

    # When tenant A requests tenant B's prices
    response = api_client.get(
        f'/api/v1/catalog/products/{product_b.id}/prices/',
        HTTP_X_TENANT_ID=str(tenant_a.id),
    )

    # Then tenant isolation does not expose tenant B's price
    assert response.status_code == 200
    payload = response.json()
    results = payload.get('results', payload) if isinstance(payload, dict) else payload
    assert isinstance(results, list)
    assert results == []


@pytest.mark.django_db
def test_r4_acceptance_contract_rejects_invalid(r4_pricing_context):
    api_client, tenant, product = r4_pricing_context
    response = api_client.post(
        f'/api/v1/catalog/products/{product.id}/prices/',
        {'command_id': 'not-a-uuid', 'product_id': str(product.id), 'amount': 'bad'},
        content_type='application/json',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert response.status_code == 400
    assert ProductPrice.all_objects.filter(product=product).count() == 1


@pytest.mark.django_db
def test_r4_acceptance_contract_replays_command_id(r4_pricing_context):
    api_client, tenant, product = r4_pricing_context
    payload = {
        'command_id': '0f7d2a2e-3a77-4ab5-9c2c-6f7763380a31',
        'product_id': str(product.id),
        'amount': '120.00',
        'valid_from': '2027-01-01T12:00:00Z',
        'tiers': [{'min_quantity': '10', 'amount': '100.00'}],
    }
    url = f'/api/v1/catalog/products/{product.id}/prices/'
    first = api_client.post(
        url,
        payload,
        content_type='application/json',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    second = api_client.post(
        url,
        payload,
        content_type='application/json',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert first.status_code == second.status_code == 201
    assert first.json() == second.json()
    assert ProductPrice.all_objects.filter(product=product).count() == 2


@pytest.mark.django_db
def test_r4_command_rejects_product_url_mismatch(r4_pricing_context):
    api_client, tenant, product = r4_pricing_context
    response = api_client.post(
        f'/api/v1/catalog/products/{product.id}/prices/',
        {
            'command_id': str(uuid4()),
            'product_id': str(uuid4()),
            'amount': '120.00',
        },
        content_type='application/json',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert response.status_code == 400
    assert ProductPrice.all_objects.filter(product=product).count() == 1


@pytest.mark.django_db
def test_r4_command_rolls_back_price_and_tiers_on_invalid_tier(r4_pricing_context):
    api_client, tenant, product = r4_pricing_context
    payload = {
        'command_id': str(uuid4()),
        'product_id': str(product.id),
        'amount': '120.00',
        'valid_from': '2027-01-01T12:00:00Z',
        'tiers': [{'min_quantity': '0', 'amount': '100.00'}],
    }
    response = api_client.post(
        f'/api/v1/catalog/products/{product.id}/prices/',
        payload,
        content_type='application/json',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert response.status_code == 400
    assert ProductPrice.all_objects.filter(product=product).count() == 1
    assert not ProductPriceTier.all_objects.filter(product=product).exists()


@pytest.mark.django_db
def test_r4_command_rejects_invalid_tier_decimal(r4_pricing_context):
    api_client, tenant, product = r4_pricing_context
    response = api_client.post(
        f'/api/v1/catalog/products/{product.id}/prices/',
        {
            'command_id': str(uuid4()),
            'product_id': str(product.id),
            'amount': '120.00',
            'tiers': [{'min_quantity': 'not-a-decimal', 'amount': '100.00'}],
        },
        content_type='application/json',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert response.status_code == 400
    assert ProductPrice.all_objects.filter(product=product).count() == 1


@pytest.mark.parametrize('invalid_value', ['NaN', 'Infinity', '-Infinity'])
@pytest.mark.django_db
def test_r4_command_rejects_non_finite_decimal(invalid_value, r4_pricing_context):
    api_client, tenant, product = r4_pricing_context
    response = api_client.post(
        f'/api/v1/catalog/products/{product.id}/prices/',
        {
            'command_id': str(uuid4()),
            'product_id': str(product.id),
            'amount': '120.00',
            'tiers': [{'min_quantity': invalid_value, 'amount': '100.00'}],
        },
        content_type='application/json',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert response.status_code == 400
    assert ProductPrice.all_objects.filter(product=product).count() == 1


@pytest.mark.django_db(transaction=True)
def test_r4_command_concurrent_replay_is_single_write(monkeypatch):
    """Two PostgreSQL transactions racing the same command replay one result."""
    tenant = Tenant.objects.create(name='R4 Concurrent', slug=f'r4-concurrent-{uuid4().hex}')
    token = set_current_tenant_id(tenant.id)
    with connection.cursor() as cursor:
        cursor.execute('SET app.current_tenant_id = %s', [str(tenant.id)])
    unit = Unit.all_objects.create(tenant=tenant, symbol='UN', name='Unidade')
    product = Product.all_objects.create(
        tenant=tenant,
        sku='R4-CONCURRENT',
        name='Produto concorrente',
        base_unit=unit,
    )
    ProductPrice.all_objects.create(
        tenant=tenant,
        product=product,
        amount=Decimal('100.00'),
        valid_from=FIXED_PRICING_INSTANT,
    )
    reset_current_tenant_id(token)
    command_id = uuid4()
    payload = {
        'product_id': str(product.id),
        'amount': '130.00',
        'valid_from': '2028-01-01T12:00:00Z',
        'tiers': [{'min_quantity': '10', 'amount': '110.00'}],
    }
    command = SprintR4Command(tenant.id, command_id, payload)
    original_create = ProductApplyCommand.all_objects.create
    insert_barrier = Barrier(2)

    def coordinated_create(**kwargs):
        if kwargs.get('command_id') == str(command_id):
            insert_barrier.wait(timeout=10)
        return original_create(**kwargs)

    monkeypatch.setattr(ProductApplyCommand.all_objects, 'create', coordinated_create)
    before = ProductPrice.all_objects.filter(product=product).count()
    results = []
    errors = []

    def invoke():
        close_old_connections()
        token = set_current_tenant_id(tenant.id)
        try:
            with connection.cursor() as cursor:
                cursor.execute('SET app.current_tenant_id = %s', [str(tenant.id)])
            results.append(execute_r4_command(command))
        except Exception as exc:  # pragma: no cover - assertion reports the real error
            errors.append(exc)
        finally:
            reset_current_tenant_id(token)
            close_old_connections()

    threads = [Thread(target=invoke), Thread(target=invoke)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=15)

    assert not errors, errors
    assert len(results) == 2
    assert results[0] == results[1]
    assert ProductPrice.all_objects.filter(product=product).count() == before + 1


@pytest.mark.django_db
def test_r4_existing_rls_policies_cover_price_and_command_receipt():
    """R4 relies on existing policies from catalog migrations 0004 and 0015."""
    if connection.vendor != 'postgresql':
        pytest.skip('R4 RLS evidence requires PostgreSQL')
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT tablename, policyname, qual, with_check
            FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename IN ('catalog_productprice', 'catalog_productapplycommand')
            ORDER BY tablename
            """
        )
        policies = cursor.fetchall()

    assert [row[0] for row in policies] == [
        'catalog_productapplycommand',
        'catalog_productprice',
    ]
    for _, _, qual, with_check in policies:
        assert 'current_setting' in qual
        assert 'tenant_id' in qual
        assert 'current_setting' in with_check
        assert 'tenant_id' in with_check
