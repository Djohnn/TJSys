"""Sprint 26 — BDD tests for service invariants."""

import pytest
from django.contrib.auth import get_user_model

from catalog.models import Unit
from tenancy.models import Tenant


@pytest.fixture
def service_context(client):
    User = get_user_model()
    tenant = Tenant.objects.create(name='S26 Serv', slug='s26-serv')
    user = User.objects.create_user(email='s26serv@test.local', password='pass')
    from tenancy.models import TenantMembership

    TenantMembership.objects.create(user=user, tenant=tenant, role='admin', is_active=True)
    client.force_login(user)
    session = client.session
    session['mfa_tenant_id'] = str(tenant.id)
    session['mfa_method'] = 'totp'
    session.save()
    from django.db import connection

    from tenancy.context import reset_current_tenant_id, set_current_tenant_id

    token = set_current_tenant_id(tenant.id)
    with connection.cursor() as c:
        c.execute('SET app.current_tenant_id = %s', [str(tenant.id)])
    unit = Unit.objects.create(tenant=tenant, symbol='UN', name='Un')
    reset_current_tenant_id(token)
    return {'client': client, 'tenant': tenant, 'unit': unit}


H = 'HTTP_X_TENANT_ID'


@pytest.mark.django_db
def test_service_rejects_tracks_inventory(service_context):
    ctx = service_context
    resp = ctx['client'].post(
        '/api/v1/catalog/products/',
        {
            'sku': 'SERV-001',
            'name': 'Banho',
            'base_unit': str(ctx['unit'].id),
            'product_kind': 'servico',
            'tracks_inventory': True,
        },
        content_type='application/json',
        **{H: str(ctx['tenant'].id)},
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_service_rejects_lot(service_context):
    ctx = service_context
    resp = ctx['client'].post(
        '/api/v1/catalog/products/',
        {
            'sku': 'SERV-002',
            'name': 'Tosa',
            'base_unit': str(ctx['unit'].id),
            'product_kind': 'servico',
            'requires_lot': True,
        },
        content_type='application/json',
        **{H: str(ctx['tenant'].id)},
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_service_rejects_expiry(service_context):
    ctx = service_context
    resp = ctx['client'].post(
        '/api/v1/catalog/products/',
        {
            'sku': 'SERV-003',
            'name': 'Consulta',
            'base_unit': str(ctx['unit'].id),
            'product_kind': 'servico',
            'requires_expiry': True,
        },
        content_type='application/json',
        **{H: str(ctx['tenant'].id)},
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_service_creates_successfully(service_context):
    ctx = service_context
    resp = ctx['client'].post(
        '/api/v1/catalog/products/',
        {
            'sku': 'SERV-OK',
            'name': 'Servico Valido',
            'base_unit': str(ctx['unit'].id),
            'product_kind': 'servico',
            'duration_minutes': 30,
            'billing_unit': 'hora',
        },
        content_type='application/json',
        **{H: str(ctx['tenant'].id)},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data['product_kind'] == 'servico'
    assert data['tracks_inventory'] is False
