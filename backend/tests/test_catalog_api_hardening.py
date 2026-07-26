from datetime import timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.utils import timezone

from catalog.models import Product, ProductPrice, Unit
from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Branch, Company, Tenant, TenantMembership

User = get_user_model()


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


def _auth_client(client, user, tenant, role='manager'):
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
def hardening_tenant():
    return Tenant.objects.create(name='Catalog Hardening', slug='catalog-hardening')


@pytest.fixture
def hardening_user(hardening_tenant):
    return User.objects.create_user(email='hardening@test.local', password='pass123')


@pytest.fixture
def hardening_client(client, hardening_user, hardening_tenant):
    return _auth_client(client, hardening_user, hardening_tenant)


@pytest.fixture
def hardening_unit(hardening_tenant):
    return _run_in_tenant(
        hardening_tenant,
        lambda: Unit.all_objects.create(
            tenant=hardening_tenant,
            symbol='kg',
            name='Quilograma',
            precision=3,
        ),
    )


@pytest.fixture
def hardening_product(hardening_tenant, hardening_unit):
    return _run_in_tenant(
        hardening_tenant,
        lambda: Product.all_objects.create(
            tenant=hardening_tenant,
            sku='HARD-001',
            name='Produto Hardening',
            base_unit=hardening_unit,
        ),
    )


@pytest.mark.django_db
def test_catalog_search_does_not_crash(
    hardening_client,
    hardening_tenant,
    hardening_product,
):
    response = hardening_client.get(
        '/api/v1/products/',
        {'search': 'Hardening'},
        HTTP_X_TENANT_ID=str(hardening_tenant.id),
    )

    assert response.status_code == 200
    payload = response.json()
    results = payload.get('results', payload)
    assert any(item['id'] == str(hardening_product.id) for item in results)


@pytest.mark.django_db
def test_product_api_rejects_base_unit_from_other_tenant(
    hardening_client,
    hardening_tenant,
):
    other_tenant = Tenant.objects.create(name='Other', slug='other-hardening')
    other_unit = _run_in_tenant(
        other_tenant,
        lambda: Unit.all_objects.create(
            tenant=other_tenant,
            symbol='un',
            name='Unidade',
            precision=0,
        ),
    )

    response = hardening_client.post(
        '/api/v1/products/',
        {
            'sku': 'CROSS-UNIT',
            'name': 'Produto com unidade externa',
            'base_unit': str(other_unit.id),
        },
        format='json',
        HTTP_X_TENANT_ID=str(hardening_tenant.id),
    )

    assert response.status_code == 400
    assert not Product.all_objects.filter(
        tenant=hardening_tenant,
        sku='CROSS-UNIT',
    ).exists()


@pytest.mark.django_db
def test_nested_product_code_uses_product_from_url(
    hardening_client,
    hardening_tenant,
    hardening_unit,
    hardening_product,
):
    other_product = _run_in_tenant(
        hardening_tenant,
        lambda: Product.all_objects.create(
            tenant=hardening_tenant,
            sku='HARD-002',
            name='Outro Produto',
            base_unit=hardening_unit,
        ),
    )

    response = hardening_client.post(
        f'/api/v1/products/{hardening_product.id}/codes/',
        {
            'product': str(other_product.id),
            'code_type': 'internal',
            'value': 'COD-HARD-001',
        },
        format='json',
        HTTP_X_TENANT_ID=str(hardening_tenant.id),
    )

    assert response.status_code == 201
    assert response.json()['product'] == str(hardening_product.id)


@pytest.mark.django_db
def test_product_price_api_rejects_overlapping_period(
    hardening_client,
    hardening_tenant,
    hardening_product,
):
    now = timezone.now()
    _run_in_tenant(
        hardening_tenant,
        lambda: ProductPrice.all_objects.create(
            tenant=hardening_tenant,
            product=hardening_product,
            amount=Decimal('10.00'),
            valid_from=now,
            valid_to=now + timedelta(days=10),
        ),
    )

    response = hardening_client.post(
        f'/api/v1/products/{hardening_product.id}/prices/',
        {
            'product': str(hardening_product.id),
            'amount': '12.00',
            'valid_from': (now + timedelta(days=5)).isoformat(),
            'valid_to': (now + timedelta(days=15)).isoformat(),
        },
        format='json',
        HTTP_X_TENANT_ID=str(hardening_tenant.id),
    )

    assert response.status_code == 400


@pytest.mark.django_db
def test_branch_price_api_rejects_branch_from_other_tenant(
    hardening_client,
    hardening_tenant,
    hardening_product,
):
    other_tenant = Tenant.objects.create(name='Branch Other', slug='branch-other-hardening')
    company = _run_in_tenant(
        other_tenant,
        lambda: Company.objects.create(tenant=other_tenant, name='Other Co'),
    )
    other_branch = _run_in_tenant(
        other_tenant,
        lambda: Branch.objects.create(
            tenant=other_tenant,
            company=company,
            name='Other Branch',
        ),
    )

    response = hardening_client.post(
        f'/api/v1/products/{hardening_product.id}/branch-prices/',
        {
            'product': str(hardening_product.id),
            'branch': str(other_branch.id),
            'amount': '11.00',
            'valid_from': timezone.now().isoformat(),
        },
        format='json',
        HTTP_X_TENANT_ID=str(hardening_tenant.id),
    )

    assert response.status_code == 400
