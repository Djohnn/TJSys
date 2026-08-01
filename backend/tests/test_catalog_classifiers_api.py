"""Sprint 25 — BDD tests for classifier APIs with invariants."""

import pytest
from django.contrib.auth import get_user_model
from django.db import connection

from catalog.models import Brand, Category, Unit
from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Tenant, TenantMembership


def _run_in_tenant(tenant, callback):
    token = set_current_tenant_id(tenant.id)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SET app.current_tenant_id = %s', [str(tenant.id)])
        return callback()
    finally:
        reset_current_tenant_id(token)


@pytest.fixture
def classifier_context(client):
    User = get_user_model()
    tenant = Tenant.objects.create(name='S25 Class', slug='s25-class')
    user = User.objects.create_user(email='s25class@test.local', password='pass')
    TenantMembership.objects.create(user=user, tenant=tenant, role='admin', is_active=True)
    client.force_login(user)
    session = client.session
    session['mfa_tenant_id'] = str(tenant.id)
    session['mfa_method'] = 'totp'
    session.save()
    return {'client': client, 'tenant': tenant}


H = 'HTTP_X_TENANT_ID'


@pytest.mark.django_db
def test_category_rejects_self_parent(classifier_context):
    ctx = classifier_context
    cat = _run_in_tenant(
        ctx['tenant'], lambda: Category.objects.create(tenant=ctx['tenant'], name='Root')
    )
    resp = ctx['client'].patch(
        f'/api/v1/catalog/categories/{cat.id}/',
        {'parent': str(cat.id)},
        content_type='application/json',
        **{H: str(ctx['tenant'].id)},
    )
    assert resp.status_code in (400, 422)


@pytest.mark.django_db
def test_category_parent_same_tenant(classifier_context):
    ctx = classifier_context
    other = Tenant.objects.create(name='Other', slug='other')
    other_cat = _run_in_tenant(
        other, lambda: Category.objects.create(tenant=other, name='OtherCat')
    )
    cat = _run_in_tenant(
        ctx['tenant'], lambda: Category.objects.create(tenant=ctx['tenant'], name='MyCat')
    )
    resp = ctx['client'].patch(
        f'/api/v1/catalog/categories/{cat.id}/',
        {'parent': str(other_cat.id)},
        content_type='application/json',
        **{H: str(ctx['tenant'].id)},
    )
    assert resp.status_code in (400, 404, 422)


@pytest.mark.django_db
def test_brand_unique_name_per_tenant(classifier_context):
    ctx = classifier_context
    _run_in_tenant(
        ctx['tenant'], lambda: Brand.objects.create(tenant=ctx['tenant'], name='Marca Unica')
    )
    resp = ctx['client'].post(
        '/api/v1/catalog/brands/',
        {'name': 'Marca Unica'},
        content_type='application/json',
        **{H: str(ctx['tenant'].id)},
    )
    assert resp.status_code in (400, 422)


@pytest.mark.django_db
def test_brand_different_tenants_same_name_ok(classifier_context):
    ctx = classifier_context
    other = Tenant.objects.create(name='Other2', slug='other2')
    _run_in_tenant(ctx['tenant'], lambda: Brand.objects.create(tenant=ctx['tenant'], name='Shared'))
    _run_in_tenant(other, lambda: Brand.objects.create(tenant=other, name='Shared'))
    resp = ctx['client'].get('/api/v1/catalog/brands/', **{H: str(ctx['tenant'].id)})
    assert len(resp.json()['results']) >= 1


@pytest.mark.django_db
def test_unit_unique_symbol_per_tenant(classifier_context):
    ctx = classifier_context
    _run_in_tenant(
        ctx['tenant'], lambda: Unit.objects.create(tenant=ctx['tenant'], symbol='KG', name='Quilo')
    )
    resp = ctx['client'].post(
        '/api/v1/catalog/units/',
        {'symbol': 'KG', 'name': 'Quilograma'},
        content_type='application/json',
        **{H: str(ctx['tenant'].id)},
    )
    assert resp.status_code in (400, 422)


@pytest.mark.django_db
def test_category_inactivation(classifier_context):
    ctx = classifier_context
    cat = _run_in_tenant(
        ctx['tenant'], lambda: Category.objects.create(tenant=ctx['tenant'], name='To Deactivate')
    )
    resp = ctx['client'].patch(
        f'/api/v1/catalog/categories/{cat.id}/',
        {'is_active': False},
        content_type='application/json',
        **{H: str(ctx['tenant'].id)},
    )
    assert resp.status_code == 200
    assert resp.json()['is_active'] is False
