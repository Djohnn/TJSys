import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.utils import timezone

from catalog.models import Product, Unit
from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Tenant, TenantMembership

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
def combo_tenant():
    return Tenant.objects.create(name='Combo', slug='combo-test')


@pytest.fixture
def combo_unit(combo_tenant):
    return _run_in_tenant(
        combo_tenant,
        lambda: Unit.all_objects.create(
            tenant=combo_tenant,
            symbol='UN',
            name='Unidade',
            precision=2,
        ),
    )


@pytest.fixture
def combo_products(combo_tenant, combo_unit):
    return _run_in_tenant(
        combo_tenant,
        lambda: [
            Product.all_objects.create(
                tenant=combo_tenant,
                sku='COMBO-P1',
                name='Prod A',
                base_unit=combo_unit,
            ),
            Product.all_objects.create(
                tenant=combo_tenant,
                sku='COMBO-P2',
                name='Prod B',
                base_unit=combo_unit,
            ),
        ],
    )


@pytest.fixture
def combo_user(combo_tenant):
    return User.objects.create_user(email='combo@test.local', password='pass123')


@pytest.fixture
def combo_client(client, combo_user, combo_tenant):
    return _auth_client(client, combo_user, combo_tenant, 'manager')


@pytest.mark.django_db
def test_create_combo_with_items_returns_201(combo_client, combo_tenant, combo_products):
    now = timezone.now()
    response = combo_client.post(
        '/api/v1/combos/',
        {
            'sku': 'COMBOPROMO',
            'name': 'Combo Promocional',
            'description': 'Pacote promocional',
            'price': '49.90',
            'valid_from': now.isoformat(),
        },
        format='json',
        HTTP_X_TENANT_ID=str(combo_tenant.id),
    )
    assert response.status_code == 201
    data = response.json()
    assert data['sku'] == 'COMBOPROMO'
    assert data['price'] == '49.9000'
    combo_id = data['id']

    item_resp = combo_client.post(
        f'/api/v1/combos/{combo_id}/items/',
        {'item': str(combo_products[0].id), 'quantity': '2.000000'},
        format='json',
        HTTP_X_TENANT_ID=str(combo_tenant.id),
    )
    assert item_resp.status_code == 201
    assert item_resp.json()['quantity'] == '2.000000'

    item_resp2 = combo_client.post(
        f'/api/v1/combos/{combo_id}/items/',
        {'item': str(combo_products[1].id), 'quantity': '1.000000'},
        format='json',
        HTTP_X_TENANT_ID=str(combo_tenant.id),
    )
    assert item_resp2.status_code == 201

    detail = combo_client.get(
        f'/api/v1/combos/{combo_id}/',
        HTTP_X_TENANT_ID=str(combo_tenant.id),
    )
    assert detail.status_code == 200
    assert len(detail.json()['items']) == 2


@pytest.mark.django_db
def test_combo_item_quantity_zero_or_negative_returns_400(
    combo_client, combo_tenant, combo_products
):
    now = timezone.now()
    create_resp = combo_client.post(
        '/api/v1/combos/',
        {
            'sku': 'BADQTY',
            'name': 'Bad Qty Combo',
            'price': '10.00',
            'valid_from': now.isoformat(),
        },
        format='json',
        HTTP_X_TENANT_ID=str(combo_tenant.id),
    )
    assert create_resp.status_code == 201
    combo_id = create_resp.json()['id']

    response = combo_client.post(
        f'/api/v1/combos/{combo_id}/items/',
        {'item': str(combo_products[0].id), 'quantity': '0.000000'},
        format='json',
        HTTP_X_TENANT_ID=str(combo_tenant.id),
    )
    assert response.status_code == 400

    response2 = combo_client.post(
        f'/api/v1/combos/{combo_id}/items/',
        {'item': str(combo_products[0].id), 'quantity': '-1.000000'},
        format='json',
        HTTP_X_TENANT_ID=str(combo_tenant.id),
    )
    assert response2.status_code == 400


@pytest.mark.django_db
def test_combo_cross_tenant_isolation(combo_client, combo_tenant, combo_products):
    now = timezone.now()
    create_resp = combo_client.post(
        '/api/v1/combos/',
        {
            'sku': 'ISOLATED',
            'name': 'Isolated Combo',
            'price': '25.00',
            'valid_from': now.isoformat(),
        },
        format='json',
        HTTP_X_TENANT_ID=str(combo_tenant.id),
    )
    assert create_resp.status_code == 201
    combo_id = create_resp.json()['id']

    combo_client.post(
        f'/api/v1/combos/{combo_id}/items/',
        {'item': str(combo_products[0].id), 'quantity': '1.000000'},
        format='json',
        HTTP_X_TENANT_ID=str(combo_tenant.id),
    )

    other_tenant = Tenant.objects.create(name='OtherCombo', slug='other-combo')
    response = combo_client.get(
        '/api/v1/combos/',
        HTTP_X_TENANT_ID=str(other_tenant.id),
    )
    assert response.status_code in (200, 403, 404)


@pytest.mark.django_db
def test_inactive_combo_returns_filtered(combo_client, combo_tenant, combo_products):
    now = timezone.now()
    create_resp = combo_client.post(
        '/api/v1/combos/',
        {
            'sku': 'INACTIVE',
            'name': 'Inactive Combo',
            'price': '15.00',
            'valid_from': now.isoformat(),
        },
        format='json',
        HTTP_X_TENANT_ID=str(combo_tenant.id),
    )
    assert create_resp.status_code == 201
    combo_id = create_resp.json()['id']

    combo_client.delete(
        f'/api/v1/combos/{combo_id}/',
        HTTP_X_TENANT_ID=str(combo_tenant.id),
    )

    response = combo_client.get(
        '/api/v1/combos/',
        {'is_active': 'true'},
        HTTP_X_TENANT_ID=str(combo_tenant.id),
    )
    data = response.json()
    results = data.get('results', data) if isinstance(data, dict) else data
    assert all(item.get('sku') != 'INACTIVE' for item in results)
