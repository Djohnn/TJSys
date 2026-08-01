"""Sprint 23 — BDD tests for ProductComposition API."""

from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.db import connection

from catalog.models import Product, ProductComposition, Unit
from catalog.services.product_extensions import resolve_composition
from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Tenant, TenantMembership

User = get_user_model()


def _run_in_tenant(tenant, callback):
    token = set_current_tenant_id(tenant.id)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SET app.current_tenant_id = %s', [str(tenant.id)])
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


@pytest.fixture
def auth_client_fixture(client):
    """Fixture: authenticated client with tenant, unit, kit, and component."""
    tenant = Tenant.objects.create(name='S23 API', slug='s23-api-comp')
    user = User.objects.create_user(email='s23comp@test.local', password='pass123')
    api_client = _auth_client(client, user, tenant, role='admin')

    def _create():
        unit = Unit.all_objects.create(tenant=tenant, symbol='UN', name='Unidade')
        kit = Product.all_objects.create(
            tenant=tenant,
            sku='S23-KIT',
            name='Kit Principal',
            base_unit=unit,
            product_kind='kit',
        )
        component = Product.all_objects.create(
            tenant=tenant,
            sku='S23-COMP',
            name='Componente A',
            base_unit=unit,
        )
        return {
            'tenant': tenant,
            'client': api_client,
            'unit': unit,
            'kit': kit,
            'component': component,
        }

    return _run_in_tenant(tenant, _create)


# ---------------------------------------------------------------------------
# Scenario 1 — List composition (empty → 200)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_composition_api_list(auth_client_fixture):
    """Given a kit with no components, when GET composition, then 200 and empty list."""
    ctx = auth_client_fixture
    response = ctx['client'].get(
        f'/api/v1/products/{ctx["kit"].id}/composition/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 200
    data = response.json()
    results = data.get('results', data)
    assert isinstance(results, list)
    assert len(results) == 0


# ---------------------------------------------------------------------------
# Scenario 2 — Create composition
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_composition_api_create(auth_client_fixture):
    """Given a kit and a component, when POST composition, then 201."""
    ctx = auth_client_fixture
    payload = {
        'kit': str(ctx['kit'].id),
        'component': str(ctx['component'].id),
        'quantity': '5',
    }
    response = ctx['client'].post(
        f'/api/v1/products/{ctx["kit"].id}/composition/',
        payload,
        format='json',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 201, response.json()
    data = response.json()
    assert data['quantity'] == '5.000000'
    assert data['kit'] == str(ctx['kit'].id)
    assert data['component'] == str(ctx['component'].id)

    count = _run_in_tenant(
        ctx['tenant'],
        lambda: ProductComposition.all_objects.filter(kit=ctx['kit']).count(),
    )
    assert count == 1


# ---------------------------------------------------------------------------
# Scenario 3 — Self-reference (cycle) blocked
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_composition_api_cycle_blocked(auth_client_fixture):
    """Given a kit, when POST self-referencing composition, then 400."""
    ctx = auth_client_fixture
    payload = {
        'kit': str(ctx['kit'].id),
        'component': str(ctx['kit'].id),
        'quantity': '1',
    }
    response = ctx['client'].post(
        f'/api/v1/products/{ctx["kit"].id}/composition/',
        payload,
        format='json',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert response.status_code == 400, response.json()


# ---------------------------------------------------------------------------
# Scenario 4 — resolve_composition service contract
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_resolve_composition_contract(auth_client_fixture):
    """Given active composition records, when resolve_composition, then returns
    list of (component_id, component_sku, quantity) tuples."""
    ctx = auth_client_fixture

    _run_in_tenant(
        ctx['tenant'],
        lambda: ProductComposition.all_objects.create(
            tenant=ctx['tenant'],
            kit=ctx['kit'],
            component=ctx['component'],
            quantity=Decimal('3'),
        ),
    )

    result = resolve_composition(tenant=ctx['tenant'], kit_product_id=ctx['kit'].id)
    assert isinstance(result, list)
    assert len(result) == 1
    comp_id, comp_sku, qty = result[0]
    assert comp_id == ctx['component'].id
    assert comp_sku == 'S23-COMP'
    assert qty == Decimal('3')
