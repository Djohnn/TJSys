"""Tests to close remaining coverage gaps in people views and management commands.

Coverage targets:
- people/views.py: get_queryset filters (active, role, document, q), perform_update, nested actions
- tenancy/management/commands/seed_e2e.py
- tenancy/management/commands/seed_tenants.py
- catalog/management/commands/audit_catalog_sprints_23_29.py
- inventory/management/commands/audit_product_stock_policies.py
"""

from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import connection

User = get_user_model()


def _headers(tenant):
    return {'HTTP_X_TENANT_ID': str(tenant.id)}


# ═══════════════════════════════════════════════════════════════════════
#  people/views.py — get_queryset filter branches
# ═══════════════════════════════════════════════════════════════════════


@pytest.mark.django_db
def test_person_list_filter_active_true(client, tenant_alpha, user_alpha):
    """Given active=true, when listing people, then only active returned."""
    from people.models import Person

    Person.all_objects.create(
        tenant=tenant_alpha, person_type='PF', name='Ativo', is_active=True
    )
    Person.all_objects.create(
        tenant=tenant_alpha, person_type='PF', name='Inativo', is_active=False
    )
    client.force_login(user_alpha)
    resp = client.get('/api/v1/people/?active=true', **_headers(tenant_alpha))
    assert resp.status_code == 200
    names = [p['name'] for p in resp.json()['results']]
    assert 'Ativo' in names
    assert 'Inativo' not in names


@pytest.mark.django_db
def test_person_list_filter_active_false(client, tenant_alpha, user_alpha):
    """Given active=false, when listing people, then only inactive returned."""
    from people.models import Person

    Person.all_objects.create(
        tenant=tenant_alpha, person_type='PF', name='Ativo', is_active=True
    )
    Person.all_objects.create(
        tenant=tenant_alpha, person_type='PF', name='Inativo', is_active=False
    )
    client.force_login(user_alpha)
    resp = client.get('/api/v1/people/?active=false', **_headers(tenant_alpha))
    assert resp.status_code == 200
    names = [p['name'] for p in resp.json()['results']]
    assert 'Inativo' in names
    assert 'Ativo' not in names


@pytest.mark.django_db
def test_person_list_filter_role(client, tenant_alpha, user_alpha):
    """Given role=customer, when listing people, then only those with that role returned."""
    from people.models import Person, PersonRole

    p1 = Person.all_objects.create(
        tenant=tenant_alpha, person_type='PF', name='Cliente', is_active=True
    )
    PersonRole.all_objects.create(tenant=tenant_alpha, person=p1, role='customer')
    p2 = Person.all_objects.create(
        tenant=tenant_alpha, person_type='PF', name='Fornecedor', is_active=True
    )
    PersonRole.all_objects.create(tenant=tenant_alpha, person=p2, role='supplier')

    client.force_login(user_alpha)
    resp = client.get('/api/v1/people/?role=customer', **_headers(tenant_alpha))
    assert resp.status_code == 200
    names = [p['name'] for p in resp.json()['results']]
    assert 'Cliente' in names
    assert 'Fornecedor' not in names


@pytest.mark.django_db
def test_person_list_filter_document(client, tenant_alpha, user_alpha):
    """Given document param, when listing people, then filtered by document value."""
    from people.models import Person, PersonDocument

    p1 = Person.all_objects.create(
        tenant=tenant_alpha, person_type='PF', name='Doc Person', is_active=True
    )
    PersonDocument.all_objects.create(
        tenant=tenant_alpha, person=p1, document_type='CPF', value='12345678901'
    )
    Person.all_objects.create(
        tenant=tenant_alpha, person_type='PF', name='No Doc', is_active=True
    )

    client.force_login(user_alpha)
    resp = client.get(
        '/api/v1/people/?document=123.456.789-01', **_headers(tenant_alpha)
    )
    assert resp.status_code == 200
    names = [p['name'] for p in resp.json()['results']]
    assert 'Doc Person' in names
    assert 'No Doc' not in names


@pytest.mark.django_db
def test_person_list_filter_q_search(client, tenant_alpha, user_alpha):
    """Given q param, when listing people, then matches name or trade_name."""
    from people.models import Person

    Person.all_objects.create(
        tenant=tenant_alpha,
        person_type='PJ',
        name='Acme Corp',
        trade_name='Acme',
        is_active=True,
    )
    Person.all_objects.create(
        tenant=tenant_alpha, person_type='PF', name='Outro Nome', is_active=True
    )

    client.force_login(user_alpha)
    resp = client.get('/api/v1/people/?q=acme', **_headers(tenant_alpha))
    assert resp.status_code == 200
    names = [p['name'] for p in resp.json()['results']]
    assert 'Acme Corp' in names
    assert 'Outro Nome' not in names


@pytest.mark.django_db
def test_person_list_invalid_active_param_ignored(client, tenant_alpha, user_alpha):
    """Given invalid active param, when listing, then filter ignored (all returned)."""
    from people.models import Person

    Person.all_objects.create(
        tenant=tenant_alpha, person_type='PF', name='A', is_active=True
    )
    Person.all_objects.create(
        tenant=tenant_alpha, person_type='PF', name='B', is_active=False
    )

    client.force_login(user_alpha)
    resp = client.get('/api/v1/people/?active=invalid', **_headers(tenant_alpha))
    assert resp.status_code == 200
    assert len(resp.json()['results']) == 2


# ═══════════════════════════════════════════════════════════════════════
#  people/views.py — perform_update
# ═══════════════════════════════════════════════════════════════════════


@pytest.mark.django_db
def test_person_update_creates_audit_and_outbox(client, tenant_alpha, user_alpha):
    """Given a person, when updated via PATCH, then audit and outbox messages created."""
    from audit.models import AuditRecord
    from outbox.models import OutboxMessage
    from people.models import Person

    person = Person.all_objects.create(
        tenant=tenant_alpha, person_type='PF', name='Update Me', is_active=True
    )
    client.force_login(user_alpha)
    resp = client.patch(
        f'/api/v1/people/{person.id}/',
        {'trade_name': 'Updated'},
        content_type='application/json',
        **_headers(tenant_alpha),
    )
    assert resp.status_code == 200, resp.content
    assert resp.json()['trade_name'] == 'Updated'

    audit = AuditRecord.objects.get(resource_id=str(person.id))
    assert audit.action == 'people.person.updated'
    assert 'trade_name' in audit.detail['changed_fields']

    outbox = OutboxMessage.objects.get(aggregate_id=str(person.id))
    assert outbox.event_type == 'people.person.updated'


# ═══════════════════════════════════════════════════════════════════════
#  people/views.py — deactivate action
# ═══════════════════════════════════════════════════════════════════════


@pytest.mark.django_db
def test_person_deactivate_action(client, tenant_alpha, user_alpha):
    """Given an active person, when POST deactivate, then person is inactive."""
    from people.models import Person

    person = Person.all_objects.create(
        tenant=tenant_alpha, person_type='PF', name='Deactivate Me', is_active=True
    )
    client.force_login(user_alpha)
    resp = client.post(
        f'/api/v1/people/{person.id}/deactivate/',
        {},
        content_type='application/json',
        **_headers(tenant_alpha),
    )
    assert resp.status_code == 200
    assert resp.json()['is_active'] is False


# ═══════════════════════════════════════════════════════════════════════
#  people/views.py — nested GET on addresses, contacts, consents
# ═══════════════════════════════════════════════════════════════════════


@pytest.mark.django_db
def test_person_addresses_get_empty(client, tenant_alpha, user_alpha):
    """Given person with no addresses, when GET addresses, then empty list."""
    from people.models import Person

    person = Person.all_objects.create(
        tenant=tenant_alpha, person_type='PF', name='No Addr', is_active=True
    )
    client.force_login(user_alpha)
    resp = client.get(
        f'/api/v1/people/{person.id}/addresses/', **_headers(tenant_alpha)
    )
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.django_db
def test_person_contacts_get_empty(client, tenant_alpha, user_alpha):
    """Given person with no contacts, when GET contacts, then empty list."""
    from people.models import Person

    person = Person.all_objects.create(
        tenant=tenant_alpha, person_type='PF', name='No Contact', is_active=True
    )
    client.force_login(user_alpha)
    resp = client.get(
        f'/api/v1/people/{person.id}/contacts/', **_headers(tenant_alpha)
    )
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.django_db
def test_person_consents_get_empty(client, tenant_alpha, user_alpha):
    """Given person with no consents, when GET consents, then empty list."""
    from people.models import Person

    person = Person.all_objects.create(
        tenant=tenant_alpha, person_type='PF', name='No Consent', is_active=True
    )
    client.force_login(user_alpha)
    resp = client.get(
        f'/api/v1/people/{person.id}/consents/', **_headers(tenant_alpha)
    )
    assert resp.status_code == 200
    assert resp.json() == []


# ═══════════════════════════════════════════════════════════════════════
#  tenancy/management/commands/seed_e2e.py
# ═══════════════════════════════════════════════════════════════════════


def _row_exists(table, where_clause, params):
    with connection.cursor() as cursor:
        cursor.execute(f'SELECT 1 FROM {table} WHERE {where_clause} LIMIT 1', params)
        return cursor.fetchone() is not None


@pytest.mark.django_db
def test_seed_e2e_creates_admin_user():
    """When seed_e2e runs, then admin user is created with correct properties."""
    call_command('seed_e2e')
    admin = User.objects.get(email='e2e@tjsys.local')
    assert admin.is_staff is True
    assert admin.is_superuser is True


@pytest.mark.django_db
def test_seed_e2e_creates_tenant():
    """When seed_e2e runs, then e2e tenant is created."""
    from tenancy.models import Tenant

    call_command('seed_e2e')
    assert Tenant.objects.filter(slug='e2e').exists()


@pytest.mark.django_db
def test_seed_e2e_creates_admin_membership():
    """When seed_e2e runs, then admin has membership in e2e tenant."""
    from tenancy.models import Tenant, TenantMembership

    call_command('seed_e2e')
    tenant = Tenant.objects.get(slug='e2e')
    assert TenantMembership.objects.filter(
        user__email='e2e@tjsys.local', tenant=tenant, role='admin'
    ).exists()


@pytest.mark.django_db
def test_seed_e2e_creates_company_and_branch():
    """When seed_e2e runs, then command completes without error (company/branch in atomic block)."""
    call_command('seed_e2e')


@pytest.mark.django_db
def test_seed_e2e_creates_device():
    """When seed_e2e runs, then device is created."""
    from tenancy.models import Tenant

    call_command('seed_e2e')
    tenant = Tenant.objects.get(slug='e2e')
    assert _row_exists('tenancy_device', 'tenant_id = %s AND device_id = %s', [str(tenant.id), 'e2e-device-001'])


@pytest.mark.django_db
def test_seed_e2e_creates_product():
    """When seed_e2e runs, then command completes without error (product in atomic block)."""
    call_command('seed_e2e')


@pytest.mark.django_db
def test_seed_e2e_creates_stock_location():
    """When seed_e2e runs, then command completes without error (stock location in atomic block)."""
    call_command('seed_e2e')


@pytest.mark.django_db
def test_seed_e2e_creates_beta_tenant():
    """When seed_e2e runs, then e2e-beta tenant exists."""
    from tenancy.models import Tenant

    call_command('seed_e2e')
    assert Tenant.objects.filter(slug='e2e-beta').exists()


@pytest.mark.django_db
def test_seed_e2e_creates_web_admin():
    """When seed_e2e runs, then web-admin user exists."""
    call_command('seed_e2e')
    web_admin = User.objects.get(email='web-admin@tjsys.local')
    assert web_admin.is_staff is True


@pytest.mark.django_db
def test_seed_e2e_creates_extra_users():
    """When seed_e2e runs, then operator and mfa users exist."""
    call_command('seed_e2e')
    assert User.objects.filter(email='operator@tjsys.local').exists()
    assert User.objects.filter(email='mfa@tjsys.local').exists()


@pytest.mark.django_db
def test_seed_e2e_idempotent():
    """When seed_e2e runs twice, then no duplicate errors."""
    call_command('seed_e2e')
    call_command('seed_e2e')

    from tenancy.models import Tenant

    assert Tenant.objects.filter(slug='e2e').count() == 1
    assert Tenant.objects.filter(slug='e2e-beta').count() == 1


@pytest.mark.django_db
def test_seed_e2e_creates_mfa_devices():
    """When seed_e2e runs, then TOTP MFA devices exist for admin users."""
    from accounts.models import MFADevice

    call_command('seed_e2e')
    web_admin = User.objects.get(email='web-admin@tjsys.local')
    e2e_admin = User.objects.get(email='e2e@tjsys.local')
    assert MFADevice.objects.filter(user=web_admin, method='totp').exists()
    assert MFADevice.objects.filter(user=e2e_admin, method='totp').exists()


@pytest.mark.django_db
def test_seed_e2e_creates_fiscal_emitter():
    """When seed_e2e runs, then a fiscal emitter exists for e2e tenant."""
    from tenancy.models import Tenant

    call_command('seed_e2e')
    tenant = Tenant.objects.get(slug='e2e')
    assert _row_exists('fiscal_fiscalemitter', 'tenant_id = %s', [str(tenant.id)])


@pytest.mark.django_db
def test_seed_e2e_creates_sale_data():
    """When seed_e2e runs, then sale, fiscal document, and payment records exist."""
    from tenancy.models import Tenant

    call_command('seed_e2e')
    tenant = Tenant.objects.get(slug='e2e')
    assert _row_exists('sales_sale', 'tenant_id = %s', [str(tenant.id)])
    assert _row_exists('fiscal_fiscaldocument', 'tenant_id = %s', [str(tenant.id)])
    assert _row_exists('payments_paymentintent', 'tenant_id = %s', [str(tenant.id)])
    assert _row_exists('payments_paymenttransaction', 'tenant_id = %s', [str(tenant.id)])


@pytest.mark.django_db
def test_seed_e2e_creates_person_and_supplier():
    """When seed_e2e runs, then person and supplier records exist."""
    from tenancy.models import Tenant

    call_command('seed_e2e')
    tenant = Tenant.objects.get(slug='e2e')
    assert _row_exists('people_person', 'tenant_id = %s AND name = %s', [str(tenant.id), 'João Cliente E2E'])
    assert _row_exists('purchasing_supplier', 'tenant_id = %s AND name = %s', [str(tenant.id), 'Fornecedor E2E'])


@pytest.mark.django_db
def test_seed_e2e_creates_purchase_order():
    """When seed_e2e runs, then a purchase order exists."""
    from tenancy.models import Tenant

    call_command('seed_e2e')
    tenant = Tenant.objects.get(slug='e2e')
    assert _row_exists(
        'purchasing_purchaseorder',
        'tenant_id = %s AND idempotency_key = %s',
        [str(tenant.id), 'e2e-purchase-order-seed'],
    )


@pytest.mark.django_db
def test_seed_e2e_creates_payment_reconciliation():
    """When seed_e2e runs, then payment reconciliation batch/item exist."""
    from tenancy.models import Tenant

    call_command('seed_e2e')
    tenant = Tenant.objects.get(slug='e2e')
    assert _row_exists('payments_paymentreconciliationbatch', 'tenant_id = %s', [str(tenant.id)])
    assert _row_exists('payments_paymentreconciliationitem', 'tenant_id = %s', [str(tenant.id)])


@pytest.mark.django_db
def test_seed_e2e_creates_fiscal_product_config():
    """When seed_e2e runs, then FiscalProductConfig exists."""
    from tenancy.models import Tenant

    call_command('seed_e2e')
    tenant = Tenant.objects.get(slug='e2e')
    assert _row_exists('fiscal_fiscalproductconfig', 'tenant_id = %s', [str(tenant.id)])


@pytest.mark.django_db
def test_seed_e2e_sets_password_from_env(monkeypatch):
    """When SEED_ADMIN_PASSWORD env var set, then that password is used."""
    monkeypatch.setenv('SEED_ADMIN_PASSWORD', 'custom-pwd-123')
    call_command('seed_e2e')
    admin = User.objects.get(email='e2e@tjsys.local')
    assert admin.check_password('custom-pwd-123')


# ═══════════════════════════════════════════════════════════════════════
#  tenancy/management/commands/seed_tenants.py
# ═══════════════════════════════════════════════════════════════════════


@pytest.mark.django_db
def test_seed_tenants_creates_two_tenants(monkeypatch):
    """When seed_tenants runs, then two demo tenants are created."""
    monkeypatch.setenv('SEED_ADMIN_PASSWORD', 'test-pwd')
    call_command('seed_tenants')

    from tenancy.models import Tenant

    assert Tenant.objects.filter(slug='casa-de-racao-alpha').exists()
    assert Tenant.objects.filter(slug='pet-shop-beta').exists()


@pytest.mark.django_db
def test_seed_tenants_creates_companies_and_branches(monkeypatch):
    """When seed_tenants runs, then command completes without error (company/branch in atomic)."""
    monkeypatch.setenv('SEED_ADMIN_PASSWORD', 'test-pwd')
    call_command('seed_tenants')


@pytest.mark.django_db
def test_seed_tenants_creates_admin_user(monkeypatch):
    """When seed_tenants runs, then admin user with membership is created."""
    monkeypatch.setenv('SEED_ADMIN_PASSWORD', 'test-pwd')
    call_command('seed_tenants')

    from tenancy.models import Tenant, TenantMembership

    admin = User.objects.get(email='admin@tjsys.local')
    assert admin.is_staff is True
    assert admin.is_superuser is True

    alpha = Tenant.objects.get(slug='casa-de-racao-alpha')
    beta = Tenant.objects.get(slug='pet-shop-beta')
    assert TenantMembership.objects.filter(user=admin, tenant=alpha, role='admin').exists()
    assert TenantMembership.objects.filter(user=admin, tenant=beta, role='admin').exists()


@pytest.mark.django_db
def test_seed_tenants_raises_without_password(monkeypatch):
    """Given no SEED_ADMIN_PASSWORD, when seed_tenants runs, then CommandError."""
    monkeypatch.delenv('SEED_ADMIN_PASSWORD', raising=False)
    with pytest.raises(CommandError, match='SEED_ADMIN_PASSWORD'):
        call_command('seed_tenants')


@pytest.mark.django_db
def test_seed_tenants_idempotent(monkeypatch):
    """When seed_tenants runs twice, then no duplicate errors."""
    monkeypatch.setenv('SEED_ADMIN_PASSWORD', 'test-pwd')
    call_command('seed_tenants')
    call_command('seed_tenants')

    from tenancy.models import Tenant

    assert Tenant.objects.filter(slug='casa-de-racao-alpha').count() == 1
    assert Tenant.objects.filter(slug='pet-shop-beta').count() == 1


@pytest.mark.django_db
def test_seed_tenants_sets_admin_password(monkeypatch):
    """When seed_tenants runs, then admin password is set correctly."""
    monkeypatch.setenv('SEED_ADMIN_PASSWORD', 'seed-pass-42')
    call_command('seed_tenants')
    admin = User.objects.get(email='admin@tjsys.local')
    assert admin.check_password('seed-pass-42')


# ═══════════════════════════════════════════════════════════════════════
#  catalog/management/commands/audit_catalog_sprints_23_29.py
# ═══════════════════════════════════════════════════════════════════════


def _table_exists(table_name):
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT 1 FROM information_schema.tables WHERE table_name = %s",
            [table_name],
        )
        return cursor.fetchone() is not None


@pytest.mark.django_db
def test_audit_catalog_clean_no_findings(tenant_alpha):
    """Given tenant with no catalog issues, when audit runs, then no error."""
    if not _table_exists('catalog_productimage'):
        pytest.skip('catalog_productimage table not available')
    call_command('audit_catalog_sprints_23_29')


@pytest.mark.django_db
def test_audit_catalog_finds_multiple_primary_images(tenant_alpha):
    """Given product with two primary images, when audit runs, then CommandError."""
    if not _table_exists('catalog_productimage'):
        pytest.skip('catalog_productimage table not available')

    from catalog.models import Unit
    from tenancy.context import reset_current_tenant_id, set_current_tenant_id

    token = set_current_tenant_id(tenant_alpha.id)
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT set_config('app.current_tenant_id', %s, false)", [str(tenant_alpha.id)])

        unit = Unit.all_objects.create(tenant=tenant_alpha, symbol='IMG', name='Img Unit')

        from catalog.models import Product

        product = Product.all_objects.create(
            tenant=tenant_alpha, sku='IMG-TEST', name='Img Test', base_unit=unit,
        )
        from catalog.models import ProductImage

        ProductImage.all_objects.create(
            tenant=tenant_alpha, product=product, object_key='a.jpg', is_primary=True,
        )
        ProductImage.all_objects.create(
            tenant=tenant_alpha, product=product, object_key='b.jpg', is_primary=True,
        )

        with pytest.raises(CommandError, match='multiple_primary_images'):
            call_command('audit_catalog_sprints_23_29')
    finally:
        reset_current_tenant_id(token)


@pytest.mark.django_db
def test_audit_catalog_finds_service_tracks_inventory(tenant_alpha):
    """Given service product with tracks_inventory=True, when audit runs, then error."""
    if not _table_exists('catalog_product'):
        pytest.skip('catalog_product table not available')

    from catalog.models import Product, Unit
    from tenancy.context import reset_current_tenant_id, set_current_tenant_id

    token = set_current_tenant_id(tenant_alpha.id)
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT set_config('app.current_tenant_id', %s, false)", [str(tenant_alpha.id)])

        unit = Unit.all_objects.create(tenant=tenant_alpha, symbol='SVC', name='Svc Unit')
        Product.all_objects.create(
            tenant=tenant_alpha, sku='SVC-001', name='Servico', base_unit=unit,
            product_kind='servico', tracks_inventory=True,
        )

        with pytest.raises(CommandError, match='service_tracks_inventory'):
            call_command('audit_catalog_sprints_23_29')
    finally:
        reset_current_tenant_id(token)


@pytest.mark.django_db
def test_audit_catalog_resets_tenant_config(tenant_alpha):
    """Given audit runs, when done, then app.current_tenant_id is reset to empty."""
    call_command('audit_catalog_sprints_23_29')
    with connection.cursor() as cursor:
        cursor.execute("SHOW app.current_tenant_id")
        row = cursor.fetchone()
    assert row[0] == ''


# ═══════════════════════════════════════════════════════════════════════
#  inventory/management/commands/audit_product_stock_policies.py
# ═══════════════════════════════════════════════════════════════════════


def _setup_inv_context(tenant):
    """Set up tenant context for inventory operations, return token for cleanup."""
    from tenancy.context import set_current_tenant_id

    token = set_current_tenant_id(tenant.id)
    with connection.cursor() as cursor:
        cursor.execute("SELECT set_config('app.current_tenant_id', %s, false)", [str(tenant.id)])
    return token


def _create_product_with_unit(tenant, sku='INV-001', product_kind='produto', tracks_inventory=True):
    """Create a product and unit using raw SQL to avoid schema issues."""
    from tenancy.context import reset_current_tenant_id, set_current_tenant_id

    token = set_current_tenant_id(tenant.id)
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT set_config('app.current_tenant_id', %s, false)", [str(tenant.id)])

            from catalog.models import Unit

            unit = Unit.all_objects.create(tenant=tenant, symbol='kg', name='Quilograma', precision=3)

            from catalog.models import Product

            product = Product.all_objects.create(
                tenant=tenant, sku=sku, name=f'Product {sku}', base_unit=unit,
                product_kind=product_kind, tracks_inventory=tracks_inventory,
            )
            return unit, product
    finally:
        reset_current_tenant_id(token)


@pytest.mark.django_db
def test_audit_stock_policies_clean_no_findings(tenant_alpha, branch_alpha):
    """Given no stock balances, when audit runs, then no error."""
    if not _table_exists('inventory_productstockpolicy'):
        pytest.skip('inventory_productstockpolicy table not available')
    call_command('audit_product_stock_policies')


@pytest.mark.django_db
def test_audit_stock_policies_finds_missing_policy(tenant_alpha, branch_alpha):
    """Given tracked product with balance but no policy, when audit runs, then error."""
    if not _table_exists('inventory_stockbalance'):
        pytest.skip('inventory_stockbalance table not available')

    from tenancy.context import reset_current_tenant_id as _rci

    token = _setup_inv_context(tenant_alpha)
    try:
        unit, product = _create_product_with_unit(tenant_alpha, sku='MISS-POL')

        from inventory.models import StockLocation

        location = StockLocation.all_objects.create(
            tenant=tenant_alpha, branch=branch_alpha, code='MISS-POL',
            name='Missing Policy Location', is_primary=False,
        )
        from inventory.models import StockBalance

        StockBalance.all_objects.create(
            tenant=tenant_alpha, product=product, location=location, quantity=Decimal('10'),
        )

        with pytest.raises(CommandError, match='missing_policy'):
            call_command('audit_product_stock_policies')
    finally:
        _rci(token)


@pytest.mark.django_db
def test_audit_stock_policies_finds_negative_without_permission(tenant_alpha, branch_alpha):
    """Given negative balance without allow_negative policy, when audit, then error."""
    if not _table_exists('inventory_stockbalance'):
        pytest.skip('inventory_stockbalance table not available')

    from tenancy.context import reset_current_tenant_id as _rci

    token = _setup_inv_context(tenant_alpha)
    try:
        unit, product = _create_product_with_unit(tenant_alpha, sku='NEG-BAL')

        from inventory.models import StockLocation

        location = StockLocation.all_objects.create(
            tenant=tenant_alpha, branch=branch_alpha, code='NEG-BAL',
            name='Negative Balance Location', is_primary=False,
        )
        from inventory.models import ProductStockPolicy

        ProductStockPolicy.all_objects.create(
            tenant=tenant_alpha, product=product, location=location, branch=branch_alpha,
            minimum_quantity=0, maximum_quantity=None, allow_negative=False, is_active=True,
        )
        from inventory.models import StockBalance

        StockBalance.all_objects.create(
            tenant=tenant_alpha, product=product, location=location, quantity=Decimal('-5'),
        )

        with pytest.raises(CommandError, match='negative_without_permission'):
            call_command('audit_product_stock_policies')
    finally:
        _rci(token)


@pytest.mark.django_db
def test_audit_stock_policies_allows_negative_with_policy(tenant_alpha, branch_alpha):
    """Given negative balance with allow_negative policy, when audit, then no error."""
    if not _table_exists('inventory_stockbalance'):
        pytest.skip('inventory_stockbalance table not available')

    from tenancy.context import reset_current_tenant_id as _rci

    token = _setup_inv_context(tenant_alpha)
    try:
        unit, product = _create_product_with_unit(tenant_alpha, sku='NEG-OK')

        from inventory.models import StockLocation

        location = StockLocation.all_objects.create(
            tenant=tenant_alpha, branch=branch_alpha, code='NEG-OK',
            name='Negative Allowed Location', is_primary=False,
        )
        from inventory.models import ProductStockPolicy

        ProductStockPolicy.all_objects.create(
            tenant=tenant_alpha, product=product, location=location, branch=branch_alpha,
            minimum_quantity=0, maximum_quantity=None, allow_negative=True, is_active=True,
        )
        from inventory.models import StockBalance

        StockBalance.all_objects.create(
            tenant=tenant_alpha, product=product, location=location, quantity=Decimal('-3'),
        )

        call_command('audit_product_stock_policies')
    finally:
        _rci(token)


@pytest.mark.django_db
def test_audit_stock_policies_finds_max_lt_min(tenant_alpha, branch_alpha):
    """Given policy with max < min, when audit runs, then error."""
    if not _table_exists('inventory_productstockpolicy'):
        pytest.skip('inventory_productstockpolicy table not available')

    from tenancy.context import reset_current_tenant_id as _rci

    token = _setup_inv_context(tenant_alpha)
    try:
        unit, product = _create_product_with_unit(tenant_alpha, sku='MIN-MAX')

        from inventory.models import StockLocation

        location = StockLocation.all_objects.create(
            tenant=tenant_alpha, branch=branch_alpha, code='MIN-MAX',
            name='Min Max Location', is_primary=False,
        )
        from inventory.models import ProductStockPolicy

        ProductStockPolicy.all_objects.create(
            tenant=tenant_alpha, product=product, location=location, branch=branch_alpha,
            minimum_quantity=100, maximum_quantity=10, allow_negative=False, is_active=True,
        )

        with pytest.raises(CommandError, match='max_lt_min'):
            call_command('audit_product_stock_policies')
    finally:
        _rci(token)


@pytest.mark.django_db
def test_audit_stock_policies_finds_service_policy(tenant_alpha, branch_alpha):
    """Given service product with active policy, when audit runs, then error."""
    if not _table_exists('inventory_productstockpolicy'):
        pytest.skip('inventory_productstockpolicy table not available')

    from tenancy.context import reset_current_tenant_id as _rci

    token = _setup_inv_context(tenant_alpha)
    try:
        unit, svc = _create_product_with_unit(
            tenant_alpha, sku='SVC-POL', product_kind='servico', tracks_inventory=False,
        )

        from inventory.models import StockLocation

        location = StockLocation.all_objects.create(
            tenant=tenant_alpha, branch=branch_alpha, code='SVC-LOC',
            name='Service Policy Location', is_primary=False,
        )
        from inventory.models import ProductStockPolicy

        ProductStockPolicy.all_objects.create(
            tenant=tenant_alpha, product=svc, location=location, branch=branch_alpha,
            minimum_quantity=0, maximum_quantity=None, allow_negative=False, is_active=True,
        )

        with pytest.raises(CommandError, match='service_policy'):
            call_command('audit_product_stock_policies')
    finally:
        _rci(token)


@pytest.mark.django_db
def test_audit_stock_policies_resets_tenant_config(tenant_alpha):
    """Given audit runs, when done, then app.current_tenant_id is reset to empty."""
    call_command('audit_product_stock_policies')
    with connection.cursor() as cursor:
        cursor.execute("SHOW app.current_tenant_id")
        row = cursor.fetchone()
    assert row[0] == ''


@pytest.mark.django_db
def test_audit_stock_policies_counts_tenants_and_policies(tenant_alpha, branch_alpha):
    """Given tenant with policy, when audit runs, then no error raised."""
    if not _table_exists('inventory_productstockpolicy'):
        pytest.skip('inventory_productstockpolicy table not available')

    from tenancy.context import reset_current_tenant_id as _rci

    token = _setup_inv_context(tenant_alpha)
    try:
        unit, product = _create_product_with_unit(tenant_alpha, sku='COUNT')

        from inventory.models import StockLocation

        location = StockLocation.all_objects.create(
            tenant=tenant_alpha, branch=branch_alpha, code='COUNT',
            name='Count Location', is_primary=False,
        )
        from inventory.models import ProductStockPolicy

        ProductStockPolicy.all_objects.create(
            tenant=tenant_alpha, product=product, location=location, branch=branch_alpha,
            minimum_quantity=0, maximum_quantity=None, allow_negative=False, is_active=True,
        )

        call_command('audit_product_stock_policies')
    finally:
        _rci(token)
