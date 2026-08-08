import pytest
from django.contrib.auth import get_user_model
from django.db import connection

from catalog.models import Product, Unit
from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Branch, Company, TenantMembership

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


@pytest.fixture(autouse=True)
def _reset_pg_tenant_ctx():
    with connection.cursor() as cursor:
        cursor.execute('RESET app.current_tenant_id')
    yield
    with connection.cursor() as cursor:
        cursor.execute('RESET app.current_tenant_id')


@pytest.fixture
def catalog_tenant():
    from tenancy.models import Tenant

    return Tenant.objects.create(name='API', slug='api-catalog')


@pytest.fixture
def catalog_unit(catalog_tenant):
    return _run_in_tenant(
        catalog_tenant,
        lambda: Unit.all_objects.create(
            tenant=catalog_tenant,
            symbol='kg',
            name='Kg',
            precision=3,
        ),
    )


@pytest.fixture
def manager_user(catalog_tenant):
    return User.objects.create_user(email='mgr@test.local', password='pass123')


@pytest.fixture
def operator_user(catalog_tenant):
    return User.objects.create_user(email='opr@test.local', password='pass123')


@pytest.fixture
def manager_client(client, manager_user, catalog_tenant):
    return _auth_client(client, manager_user, catalog_tenant, 'manager')


@pytest.fixture
def operator_client(client, operator_user, catalog_tenant):
    return _auth_client(client, operator_user, catalog_tenant, 'operator')


@pytest.mark.django_db
def test_manager_creates_product(manager_client, catalog_tenant, catalog_unit):
    response = manager_client.post(
        '/api/v1/products/',
        {
            'sku': 'RACAO-20KG',
            'name': 'Ração 20 kg',
            'base_unit': str(catalog_unit.id),
        },
        format='json',
        HTTP_X_TENANT_ID=str(catalog_tenant.id),
    )
    assert response.status_code == 201
    assert response.json()['sku'] == 'RACAO-20KG'
    assert response.json()['base_unit'] == str(catalog_unit.id)
    assert response.json()['unit'] == str(catalog_unit.id)
    assert response.json()['unit_name'] == 'Kg'
    assert response.json()['category_name'] == ''
    assert response.json()['barcode'] == ''


@pytest.mark.django_db
def test_operator_cannot_manage_catalog(operator_client, catalog_tenant, catalog_unit):
    response = operator_client.post(
        '/api/v1/products/',
        {
            'sku': 'BLOCKED',
            'name': 'Blocked',
            'base_unit': str(catalog_unit.id),
        },
        format='json',
        HTTP_X_TENANT_ID=str(catalog_tenant.id),
    )
    assert response.status_code == 403


@pytest.mark.django_db
def test_operator_can_list_products(operator_client, catalog_tenant, catalog_unit):
    _run_in_tenant(
        catalog_tenant,
        lambda: Product.all_objects.create(
            tenant=catalog_tenant,
            sku='LIST',
            name='List',
            base_unit=catalog_unit,
        ),
    )
    response = operator_client.get(
        '/api/v1/products/',
        HTTP_X_TENANT_ID=str(catalog_tenant.id),
    )
    assert response.status_code == 200


@pytest.mark.django_db
def test_product_delete_inactivates(manager_client, catalog_tenant, catalog_unit):
    create_resp = manager_client.post(
        '/api/v1/products/',
        {
            'sku': 'DEL-PROD',
            'name': 'Del Product',
            'base_unit': str(catalog_unit.id),
        },
        format='json',
        HTTP_X_TENANT_ID=str(catalog_tenant.id),
    )
    assert create_resp.status_code == 201
    product_id = create_resp.json()['id']

    response = manager_client.delete(
        f'/api/v1/products/{product_id}/',
        HTTP_X_TENANT_ID=str(catalog_tenant.id),
    )
    assert response.status_code in (204, 200)
    assert Product.all_objects.filter(pk=product_id, is_active=False).exists()


@pytest.mark.django_db
def test_no_tenant_header_returns_403(manager_client):
    response = manager_client.get('/api/v1/products/')
    assert response.status_code == 403


@pytest.mark.django_db
def test_product_from_other_tenant_not_visible(manager_client, catalog_tenant, catalog_unit):
    from tenancy.models import Tenant

    other_tenant = Tenant.objects.create(name='Other', slug='other-api')
    _run_in_tenant(
        other_tenant,
        lambda: Product.all_objects.create(
            tenant=other_tenant,
            sku='OTHER',
            name='Other',
            base_unit=catalog_unit,
        ),
    )
    response = manager_client.get(
        '/api/v1/products/',
        HTTP_X_TENANT_ID=str(catalog_tenant.id),
    )
    data = response.json()
    results = data.get('results', data) if isinstance(data, dict) else data
    assert all(p['sku'] != 'OTHER' for p in results)


@pytest.mark.django_db
def test_unit_crud(manager_client, catalog_tenant):
    create_resp = manager_client.post(
        '/api/v1/units/',
        {'symbol': 'SC', 'name': 'Saco', 'precision': 0},
        format='json',
        HTTP_X_TENANT_ID=str(catalog_tenant.id),
    )
    assert create_resp.status_code == 201
    unit_id = create_resp.json()['id']

    list_resp = manager_client.get(
        '/api/v1/units/',
        HTTP_X_TENANT_ID=str(catalog_tenant.id),
    )
    assert list_resp.status_code == 200

    detail_resp = manager_client.get(
        f'/api/v1/units/{unit_id}/',
        HTTP_X_TENANT_ID=str(catalog_tenant.id),
    )
    assert detail_resp.status_code == 200
    assert detail_resp.json()['symbol'] == 'SC'


@pytest.mark.django_db
def test_category_crud(manager_client, catalog_tenant):
    create_resp = manager_client.post(
        '/api/v1/categories/',
        {'name': 'Rações', 'code': 'RAC'},
        format='json',
        HTTP_X_TENANT_ID=str(catalog_tenant.id),
    )
    assert create_resp.status_code == 201

    list_resp = manager_client.get(
        '/api/v1/categories/',
        HTTP_X_TENANT_ID=str(catalog_tenant.id),
    )
    assert list_resp.status_code == 200


@pytest.mark.django_db
def test_effective_price_endpoint(manager_client, catalog_tenant, catalog_unit):
    from decimal import Decimal

    from django.utils import timezone

    from catalog.models import ProductPrice

    product = _run_in_tenant(
        catalog_tenant,
        lambda: Product.all_objects.create(
            tenant=catalog_tenant,
            sku='EP',
            name='EP',
            base_unit=catalog_unit,
        ),
    )
    _run_in_tenant(
        catalog_tenant,
        lambda: ProductPrice.all_objects.create(
            tenant=catalog_tenant,
            product=product,
            amount=Decimal('15.90'),
            valid_from=timezone.now(),
        ),
    )
    company = _run_in_tenant(
        catalog_tenant,
        lambda: Company.objects.create(tenant=catalog_tenant, name='Co'),
    )
    branch = _run_in_tenant(
        catalog_tenant,
        lambda: Branch.objects.create(
            company=company,
            tenant=catalog_tenant,
            name='Br',
        ),
    )
    response = manager_client.get(
        f'/api/v1/products/{product.id}/effective-price/',
        {'branch_id': str(branch.id)},
        HTTP_X_TENANT_ID=str(catalog_tenant.id),
    )
    assert response.status_code == 200
    assert response.json()['amount'] == '15.9000'
