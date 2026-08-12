"""Tests for ProductStockPolicy model constraints and business rules."""

from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError
from django.db import connection

from catalog.models import Category, Product, Unit
from inventory.models import ProductStockPolicy, StockBalance, StockLocation
from inventory.services.operations import _apply_balance_delta
from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Branch, Company, Tenant


def _setup(*, tenant_name='PSP'):
    tenant = Tenant.objects.create(name=tenant_name, slug=tenant_name.lower())
    token = set_current_tenant_id(tenant.id)
    with connection.cursor() as cursor:
        cursor.execute('SET app.current_tenant_id = %s', [str(tenant.id)])
    company = Company.objects.create(tenant=tenant, name='Cia')
    branch = Branch.objects.create(tenant=tenant, company=company, name='Branch')
    location = StockLocation.objects.create(
        tenant=tenant, branch=branch, code='A1', name='Deposito A1'
    )
    unit = Unit.objects.create(tenant=tenant, symbol='UN', name='Unidade')
    category = Category.objects.create(tenant=tenant, name='Cat')
    product = Product.objects.create(
        tenant=tenant, sku='PSP-PROD', name='Test Product',
        base_unit=unit, category=category,
    )
    reset_current_tenant_id(token)
    return tenant, product, branch, location, company


def _in_tenant(tenant, fn):
    token = set_current_tenant_id(tenant.id)
    with connection.cursor() as cursor:
        cursor.execute('SET app.current_tenant_id = %s', [str(tenant.id)])
    result = fn()
    reset_current_tenant_id(token)
    return result


@pytest.mark.django_db
def test_policy_creation_with_valid_fields():
    """Given valid product, branch, location, when creating policy, then persists."""
    tenant, product, branch, location, _ = _setup(tenant_name='PSP01')
    policy = _in_tenant(tenant, lambda: _create_policy(tenant, product, branch, location))
    assert policy.minimum_quantity == Decimal('10')
    assert policy.maximum_quantity == Decimal('100')
    assert policy.is_active is True


def _create_policy(tenant, product, branch, location, **overrides):
    defaults = {
        'tenant': tenant,
        'product': product,
        'branch': branch,
        'location': location,
        'minimum_quantity': Decimal('10'),
        'maximum_quantity': Decimal('100'),
        'reorder_point': Decimal('5'),
        'allow_negative': False,
    }
    defaults.update(overrides)
    policy = ProductStockPolicy(**defaults)
    policy.full_clean()
    policy.save()
    return policy


@pytest.mark.django_db
def test_policy_rejects_service_product():
    """Given a service product, when creating policy, then ValidationError."""
    tenant, _, branch, location, _ = _setup(tenant_name='PSP02')
    service = _in_tenant(tenant, lambda: Product.objects.create(
        tenant=tenant,
        sku='SVC-01',
        name='Service',
        product_kind='servico',
        tracks_inventory=False,
        base_unit=Unit.objects.filter(tenant=tenant).first(),
    ))
    with pytest.raises(ValidationError):
        _in_tenant(tenant, lambda: _create_policy(tenant, service, branch, location))


@pytest.mark.django_db
def test_policy_rejects_location_from_different_branch():
    """Given location of branch A, but policy references branch B, then ValidationError."""
    tenant, product, branch, location, company = _setup(tenant_name='PSP03')
    branch_b = _in_tenant(tenant, lambda: Branch.objects.create(
        tenant=tenant, company=company, name='Branch B'
    ))
    with pytest.raises(ValidationError):
        _in_tenant(tenant, lambda: _create_policy(tenant, product, branch_b, location))


@pytest.mark.django_db
def test_policy_rejects_max_lt_min():
    """Given max < min, when creating policy, then ValidationError."""
    tenant, product, branch, location, _ = _setup(tenant_name='PSP04')
    with pytest.raises(ValidationError):
        _in_tenant(tenant, lambda: _create_policy(
            tenant, product, branch, location,
            minimum_quantity=Decimal('50'),
            maximum_quantity=Decimal('10'),
        ))


@pytest.mark.django_db
def test_policy_allows_null_max():
    """Given null max, when creating policy, then persists without error."""
    tenant, product, branch, location, _ = _setup(tenant_name='PSP05')
    policy = _in_tenant(tenant, lambda: _create_policy(
        tenant, product, branch, location,
        maximum_quantity=None,
    ))
    assert policy.maximum_quantity is None


@pytest.mark.django_db
def test_policy_rejects_negative_thresholds():
    """Given negative minimum_quantity, when creating, then ValidationError."""
    tenant, product, branch, location, _ = _setup(tenant_name='PSP06')
    with pytest.raises(ValidationError):
        _in_tenant(tenant, lambda: _create_policy(
            tenant, product, branch, location,
            minimum_quantity=Decimal('-1'),
            reorder_point=Decimal('0'),
        ))


@pytest.mark.django_db
def test_policy_reports_reorder_point_error_on_negative_value():
    """Given a negative reorder point, validation reports the correct field."""
    tenant, product, branch, location, _ = _setup(tenant_name='PSP06B')
    with pytest.raises(ValidationError) as exc:
        _in_tenant(tenant, lambda: _create_policy(
            tenant, product, branch, location,
            minimum_quantity=Decimal('0'),
            reorder_point=Decimal('-1'),
        ))
    assert 'reorder_point' in exc.value.message_dict


@pytest.mark.django_db
def test_negative_balance_is_allowed_only_by_active_policy():
    """Given an active permissive policy, a stock delta may produce a negative balance."""
    tenant, product, branch, location, _ = _setup(tenant_name='PSP06C')
    _in_tenant(tenant, lambda: _create_policy(
        tenant, product, branch, location,
        allow_negative=True,
    ))

    balance = _in_tenant(
        tenant,
        lambda: _apply_balance_delta(
            tenant, product, location, Decimal('-2'),
        ),
    )

    assert balance.quantity == Decimal('-2')
    assert _in_tenant(
        tenant,
        lambda: StockBalance.objects.get(product=product, location=location),
    ).quantity == Decimal('-2')


@pytest.mark.django_db
def test_policy_unique_per_tenant_product_branch_location():
    """Given existing policy for (product, branch, location), then duplicate raises IntegrityError."""
    tenant, product, branch, location, _ = _setup(tenant_name='PSP07')
    _in_tenant(tenant, lambda: _create_policy(tenant, product, branch, location))
    with pytest.raises(Exception):
        _in_tenant(tenant, lambda: _create_policy(tenant, product, branch, location))


@pytest.mark.django_db(transaction=True)
def test_backfill_migration_creates_zero_limit_policy_per_location():
    """Given a tracked product with balances in two locations before migration 0007,
    when the backfill migration runs, then one default-limit policy per location is
    created without extra movements or balance changes."""
    from django.db.migrations.executor import MigrationExecutor

    executor = MigrationExecutor(connection)
    executor.loader.build_graph()
    executor.migrate([('inventory', '0006_add_product_stock_policy')])
    apps = executor.loader.project_state([('inventory', '0006_add_product_stock_policy')]).apps

    Tenant = apps.get_model('tenancy', 'Tenant')
    Company = apps.get_model('tenancy', 'Company')
    Branch = apps.get_model('tenancy', 'Branch')
    Unit = apps.get_model('catalog', 'Unit')
    Product = apps.get_model('catalog', 'Product')
    StockLocation = apps.get_model('inventory', 'StockLocation')
    StockBalance = apps.get_model('inventory', 'StockBalance')
    StockMovement = apps.get_model('inventory', 'StockMovement')

    tenant = Tenant.objects.create(name='Backfill', slug='backfill')
    token = set_current_tenant_id(tenant.id)
    with connection.cursor() as cursor:
        cursor.execute('SET app.current_tenant_id = %s', [str(tenant.id)])
    company = Company.objects.create(tenant=tenant, name='Backfill Co')
    branch = Branch.objects.create(tenant=tenant, company=company, name='BF')
    location_a = StockLocation.objects.create(
        tenant=tenant, branch=branch, code='A', name='Deposito A'
    )
    location_b = StockLocation.objects.create(
        tenant=tenant, branch=branch, code='B', name='Deposito B'
    )
    unit = Unit.objects.create(tenant=tenant, symbol='UN', name='Unidade')
    product = Product.objects.create(
        tenant=tenant,
        sku='BACKFILL-1',
        name='Backfill Product',
        tracks_inventory=True,
        base_unit=unit,
    )
    StockBalance.objects.create(
        tenant=tenant, product=product, location=location_a, quantity=10, reserved=0
    )
    StockBalance.objects.create(
        tenant=tenant, product=product, location=location_b, quantity=25, reserved=0
    )
    movements_before = StockMovement.objects.count()
    reset_current_tenant_id(token)

    executor.loader.build_graph()
    executor.migrate([('inventory', '0007_backfill_product_stock_policy')])
    apps = executor.loader.project_state([('inventory', '0007_backfill_product_stock_policy')]).apps

    Policy = apps.get_model('inventory', 'ProductStockPolicy')
    Balance = apps.get_model('inventory', 'StockBalance')

    token = set_current_tenant_id(tenant.id)
    with connection.cursor() as cursor:
        cursor.execute('SET app.current_tenant_id = %s', [str(tenant.id)])
    policies = Policy.objects.filter(tenant_id=tenant.id)
    assert policies.count() == 2
    for policy in policies:
        assert policy.branch_id == branch.id
        assert policy.minimum_quantity == 0
        assert policy.maximum_quantity is None
        assert policy.reorder_point == 0
        assert policy.allow_negative is False
        assert policy.is_active is True
    assert set(policies.values_list('location_id', flat=True)) == {location_a.id, location_b.id}
    assert StockMovement.objects.count() == movements_before
    assert Balance.objects.filter(tenant_id=tenant.id).count() == 2
    reset_current_tenant_id(token)


@pytest.mark.django_db(transaction=True)
def test_backfill_migration_skips_products_without_inventory_control():
    """Given a service product with a balance before migration 0007,
    when the backfill migration runs, then no policy is created for it."""
    from django.db.migrations.executor import MigrationExecutor

    executor = MigrationExecutor(connection)
    executor.loader.build_graph()
    executor.migrate([('inventory', '0006_add_product_stock_policy')])
    apps = executor.loader.project_state([('inventory', '0006_add_product_stock_policy')]).apps

    Tenant = apps.get_model('tenancy', 'Tenant')
    Company = apps.get_model('tenancy', 'Company')
    Branch = apps.get_model('tenancy', 'Branch')
    Unit = apps.get_model('catalog', 'Unit')
    Product = apps.get_model('catalog', 'Product')
    StockLocation = apps.get_model('inventory', 'StockLocation')
    StockBalance = apps.get_model('inventory', 'StockBalance')

    tenant = Tenant.objects.create(name='BackfillService', slug='backfill-service')
    token = set_current_tenant_id(tenant.id)
    with connection.cursor() as cursor:
        cursor.execute('SET app.current_tenant_id = %s', [str(tenant.id)])
    company = Company.objects.create(tenant=tenant, name='BF Service Co')
    branch = Branch.objects.create(tenant=tenant, company=company, name='BF')
    location = StockLocation.objects.create(
        tenant=tenant, branch=branch, code='A', name='Deposito A'
    )
    unit = Unit.objects.create(tenant=tenant, symbol='UN', name='Unidade')
    service = Product.objects.create(
        tenant=tenant,
        sku='SVC-BACKFILL',
        name='Service Backfill',
        product_kind='servico',
        tracks_inventory=False,
        base_unit=unit,
    )
    StockBalance.objects.create(
        tenant=tenant, product=service, location=location, quantity=3, reserved=0
    )
    reset_current_tenant_id(token)

    executor.loader.build_graph()
    executor.migrate([('inventory', '0007_backfill_product_stock_policy')])
    apps = executor.loader.project_state([('inventory', '0007_backfill_product_stock_policy')]).apps

    Policy = apps.get_model('inventory', 'ProductStockPolicy')
    assert Policy.objects.filter(tenant_id=tenant.id).count() == 0
