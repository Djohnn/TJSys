import json
import uuid
from datetime import timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.utils import timezone

from catalog.models import (
    Brand,
    Category,
    ComboItem,
    CommercialCombo,
    LabelTemplate,
    Product,
    ProductChannelProfile,
    ProductFiscalData,
    ProductImage,
    ProductPrice,
    ProductPriceTier,
    Unit,
)
from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Branch, Company, Tenant, TenantMembership

User = get_user_model()

BASE = '/api/v1'


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


def _json_post(client, url, data, **extra):
    headers = {'HTTP_X_TENANT_ID': extra.pop('HTTP_X_TENANT_ID', '')}
    headers.update(extra)
    return client.post(url, json.dumps(data), content_type='application/json', **headers)


def _json_put(client, url, data, **extra):
    headers = {'HTTP_X_TENANT_ID': extra.pop('HTTP_X_TENANT_ID', '')}
    headers.update(extra)
    return client.put(url, json.dumps(data), content_type='application/json', **headers)


@pytest.fixture(autouse=True)
def _reset_pg_tenant_ctx():
    with connection.cursor() as cursor:
        cursor.execute('RESET app.current_tenant_id')
    yield
    with connection.cursor() as cursor:
        cursor.execute('RESET app.current_tenant_id')


@pytest.fixture
def ct():
    return Tenant.objects.create(name='Coverage Tenant', slug='coverage-ten')


@pytest.fixture
def ct_user(ct):
    return User.objects.create_user(email='cov@test.local', password='pass123')


@pytest.fixture
def ct_client(client, ct_user, ct):
    return _auth_client(client, ct_user, ct)


@pytest.fixture
def ct_unit(ct):
    return _run_in_tenant(
        ct,
        lambda: Unit.all_objects.create(
            tenant=ct, symbol='UN', name='Unidade', precision=0,
        ),
    )


@pytest.fixture
def ct_product(ct, ct_unit):
    return _run_in_tenant(
        ct,
        lambda: Product.all_objects.create(
            tenant=ct, sku='COV-001', name='Produto Coverage', base_unit=ct_unit,
        ),
    )


@pytest.fixture
def ct_company(ct):
    return _run_in_tenant(ct, lambda: Company.objects.create(tenant=ct, name='CovCo'))


@pytest.fixture
def ct_branch(ct, ct_company):
    return _run_in_tenant(
        ct,
        lambda: Branch.objects.create(tenant=ct, company=ct_company, name='CovBranch'),
    )


# ---------------------------------------------------------------------------
# 1. ProductViewSet._apply_q_filter (search by name and sku)
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_product_q_filter_by_name(ct_client, ct, ct_product):
    resp = ct_client.get(
        f'{BASE}/products/',
        {'q': 'Coverage'},
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert resp.status_code == 200
    ids = [p['id'] for p in resp.json()['results']]
    assert str(ct_product.id) in ids


@pytest.mark.django_db
def test_product_q_filter_by_sku(ct_client, ct, ct_product):
    resp = ct_client.get(
        f'{BASE}/products/',
        {'q': 'COV-001'},
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert resp.status_code == 200
    ids = [p['id'] for p in resp.json()['results']]
    assert str(ct_product.id) in ids


@pytest.mark.django_db
def test_product_q_filter_no_match(ct_client, ct):
    resp = ct_client.get(
        f'{BASE}/products/',
        {'q': 'ZZZZNOTEXIST'},
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert resp.status_code == 200
    assert resp.json()['results'] == []


@pytest.mark.django_db
def test_product_is_active_filter(ct_client, ct, ct_product):
    resp = ct_client.get(
        f'{BASE}/products/',
        {'is_active': 'true'},
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert resp.status_code == 200
    assert len(resp.json()['results']) >= 1


@pytest.mark.django_db
def test_product_category_filter(ct_client, ct, ct_product):
    resp = ct_client.get(
        f'{BASE}/products/',
        {'category': str(uuid.uuid4())},
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert resp.status_code == 200
    assert resp.json()['results'] == []


# ---------------------------------------------------------------------------
# 2. ProductPriceViewSet — CRUD + version bump
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_product_price_crud(ct_client, ct, ct_product):
    now = timezone.now()
    payload = {
        'product': str(ct_product.id),
        'amount': '25.50',
        'valid_from': now.isoformat(),
        'valid_to': (now + timedelta(days=30)).isoformat(),
    }
    create_resp = _json_post(
        ct_client,
        f'{BASE}/products/{ct_product.id}/prices/',
        payload,
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert create_resp.status_code == 201
    price_id = create_resp.json()['id']

    list_resp = ct_client.get(
        f'{BASE}/products/{ct_product.id}/prices/',
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert list_resp.status_code == 200
    assert len(list_resp.json()['results']) >= 1

    detail_resp = ct_client.get(
        f'{BASE}/products/{ct_product.id}/prices/{price_id}/',
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert detail_resp.status_code == 200
    assert detail_resp.json()['amount'] == '25.5000'

    update_resp = _json_put(
        ct_client,
        f'{BASE}/products/{ct_product.id}/prices/{price_id}/',
        {
            'product': str(ct_product.id),
            'amount': '30.00',
            'valid_from': now.isoformat(),
            'valid_to': (now + timedelta(days=60)).isoformat(),
        },
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert update_resp.status_code == 200
    assert update_resp.json()['amount'] == '30.0000'
    assert update_resp.json()['version'] == 2

    del_resp = ct_client.delete(
        f'{BASE}/products/{ct_product.id}/prices/{price_id}/',
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert del_resp.status_code in (204, 200)
    assert ProductPrice.all_objects.filter(pk=price_id, is_active=False).exists()


@pytest.mark.django_db
def test_product_price_if_match_version_mismatch(ct_client, ct, ct_product):
    now = timezone.now()
    create_resp = _json_post(
        ct_client,
        f'{BASE}/products/{ct_product.id}/prices/',
        {
            'product': str(ct_product.id),
            'amount': '10.00',
            'valid_from': now.isoformat(),
        },
        HTTP_X_TENANT_ID=str(ct.id),
    )
    price_id = create_resp.json()['id']
    resp = _json_put(
        ct_client,
        f'{BASE}/products/{ct_product.id}/prices/{price_id}/',
        {
            'product': str(ct_product.id),
            'amount': '12.00',
            'valid_from': now.isoformat(),
        },
        HTTP_X_TENANT_ID=str(ct.id),
        HTTP_IF_MATCH='999',
    )
    assert resp.status_code == 409
    assert resp.json()['code'] == 'CONFLICT_VERSION_MISMATCH'


# ---------------------------------------------------------------------------
# 3. BranchPriceViewSet — CRUD + version bump
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_branch_price_crud(ct_client, ct, ct_product, ct_branch):
    now = timezone.now()
    payload = {
        'product': str(ct_product.id),
        'branch': str(ct_branch.id),
        'amount': '18.00',
        'valid_from': now.isoformat(),
        'valid_to': (now + timedelta(days=15)).isoformat(),
    }
    create_resp = _json_post(
        ct_client,
        f'{BASE}/products/{ct_product.id}/branch-prices/',
        payload,
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert create_resp.status_code == 201
    bp_id = create_resp.json()['id']
    assert create_resp.json()['branch'] == str(ct_branch.id)

    detail_resp = ct_client.get(
        f'{BASE}/products/{ct_product.id}/branch-prices/{bp_id}/',
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert detail_resp.status_code == 200

    update_resp = _json_put(
        ct_client,
        f'{BASE}/products/{ct_product.id}/branch-prices/{bp_id}/',
        {
            'product': str(ct_product.id),
            'branch': str(ct_branch.id),
            'amount': '20.00',
            'valid_from': now.isoformat(),
        },
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert update_resp.status_code == 200
    assert update_resp.json()['version'] == 2

    del_resp = ct_client.delete(
        f'{BASE}/products/{ct_product.id}/branch-prices/{bp_id}/',
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert del_resp.status_code in (204, 200)


# ---------------------------------------------------------------------------
# 4. ProductFiscalDataView — GET 404, POST create, POST upsert
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_fiscal_data_get_not_found(ct_client, ct, ct_product):
    resp = ct_client.get(
        f'{BASE}/products/{ct_product.id}/fiscal-data/',
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert resp.status_code == 404


@pytest.mark.django_db
def test_fiscal_data_post_create(ct_client, ct, ct_product):
    resp = _json_post(
        ct_client,
        f'{BASE}/products/{ct_product.id}/fiscal-data/',
        {'ncm': '12345678', 'fiscal_type': 'revenda'},
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert resp.status_code == 201
    assert resp.json()['ncm'] == '12345678'

    get_resp = ct_client.get(
        f'{BASE}/products/{ct_product.id}/fiscal-data/',
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert get_resp.status_code == 200
    assert get_resp.json()['ncm'] == '12345678'


@pytest.mark.django_db
def test_fiscal_data_post_upsert(ct_client, ct, ct_product):
    _run_in_tenant(
        ct,
        lambda: ProductFiscalData.all_objects.create(
            tenant=ct, product=ct_product, ncm='00000000',
        ),
    )
    resp = _json_post(
        ct_client,
        f'{BASE}/products/{ct_product.id}/fiscal-data/',
        {'ncm': '99999999'},
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert resp.status_code == 200
    assert resp.json()['ncm'] == '99999999'


@pytest.mark.django_db
def test_fiscal_data_get_not_found_wrong_product(ct_client, ct):
    resp = ct_client.get(
        f'{BASE}/products/{uuid.uuid4()}/fiscal-data/',
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# 5. ProductPriceTierViewSet — CRUD + soft-delete
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_price_tier_crud_and_soft_delete(ct_client, ct, ct_product):
    price = _run_in_tenant(
        ct,
        lambda: ProductPrice.all_objects.create(
            tenant=ct, product=ct_product, amount=Decimal('100'),
            valid_from=timezone.now(),
        ),
    )
    create_resp = _json_post(
        ct_client,
        f'{BASE}/products/{ct_product.id}/price-tiers/',
        {
            'product': str(ct_product.id),
            'price': str(price.id),
            'min_quantity': '10',
            'amount': '90.00',
        },
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert create_resp.status_code == 201
    tier_id = create_resp.json()['id']

    list_resp = ct_client.get(
        f'{BASE}/products/{ct_product.id}/price-tiers/',
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert list_resp.status_code == 200
    assert any(t['id'] == tier_id for t in list_resp.json()['results'])

    detail_resp = ct_client.get(
        f'{BASE}/products/{ct_product.id}/price-tiers/{tier_id}/',
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert detail_resp.status_code == 200

    del_resp = ct_client.delete(
        f'{BASE}/products/{ct_product.id}/price-tiers/{tier_id}/',
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert del_resp.status_code in (204, 200)
    assert ProductPriceTier.all_objects.filter(pk=tier_id, is_active=False).exists()


# ---------------------------------------------------------------------------
# 6. EffectivePriceView — GET with branch, missing branch_id, bad at, no price
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_effective_price_with_branch(ct_client, ct, ct_product, ct_branch):
    _run_in_tenant(
        ct,
        lambda: ProductPrice.all_objects.create(
            tenant=ct, product=ct_product, amount=Decimal('42.50'),
            valid_from=timezone.now(),
        ),
    )
    resp = ct_client.get(
        f'{BASE}/products/{ct_product.id}/effective-price/',
        {'branch_id': str(ct_branch.id)},
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data['amount'] == '42.5000'
    assert data['currency'] == 'BRL'


@pytest.mark.django_db
def test_effective_price_missing_branch_id(ct_client, ct, ct_product):
    resp = ct_client.get(
        f'{BASE}/products/{ct_product.id}/effective-price/',
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert resp.status_code == 400
    assert resp.json()['code'] == 'VALIDATION_FAILED'


@pytest.mark.django_db
def test_effective_price_invalid_at(ct_client, ct, ct_product, ct_branch):
    resp = ct_client.get(
        f'{BASE}/products/{ct_product.id}/effective-price/',
        {'branch_id': str(ct_branch.id), 'at': 'not-a-date'},
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert resp.status_code == 400
    assert resp.json()['code'] == 'VALIDATION_FAILED'


@pytest.mark.django_db
def test_effective_price_no_price_available(ct_client, ct, ct_product, ct_branch):
    resp = ct_client.get(
        f'{BASE}/products/{ct_product.id}/effective-price/',
        {'branch_id': str(ct_branch.id)},
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert resp.status_code == 404
    assert resp.json()['code'] == 'CATALOG_PRICE_NOT_AVAILABLE'


@pytest.mark.django_db
def test_effective_price_product_not_found(ct_client, ct, ct_branch):
    resp = ct_client.get(
        f'{BASE}/products/{uuid.uuid4()}/effective-price/',
        {'branch_id': str(ct_branch.id)},
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert resp.status_code == 404


@pytest.mark.django_db
def test_effective_price_branch_not_found(ct_client, ct, ct_product):
    resp = ct_client.get(
        f'{BASE}/products/{ct_product.id}/effective-price/',
        {'branch_id': str(uuid.uuid4())},
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# 7. BrandViewSet — list with ordering
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_brand_list_ordered(ct_client, ct):
    _run_in_tenant(ct, lambda: Brand.all_objects.create(tenant=ct, name='Zebra Brand'))
    _run_in_tenant(ct, lambda: Brand.all_objects.create(tenant=ct, name='Alpha Brand'))

    resp = ct_client.get(
        f'{BASE}/brands/',
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert resp.status_code == 200
    names = [b['name'] for b in resp.json()['results']]
    assert names == sorted(names)


@pytest.mark.django_db
def test_brand_create_retrieve_delete(ct_client, ct):
    create_resp = _json_post(
        ct_client,
        f'{BASE}/brands/',
        {'name': 'New Brand'},
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert create_resp.status_code == 201
    brand_id = create_resp.json()['id']

    detail_resp = ct_client.get(
        f'{BASE}/brands/{brand_id}/',
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert detail_resp.status_code == 200
    assert detail_resp.json()['name'] == 'New Brand'

    del_resp = ct_client.delete(
        f'{BASE}/brands/{brand_id}/',
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert del_resp.status_code in (204, 200)


# ---------------------------------------------------------------------------
# 8. ProductImageViewSet — CRUD
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_product_image_crud(ct_client, ct, ct_product):
    create_resp = _json_post(
        ct_client,
        f'{BASE}/products/{ct_product.id}/images/',
        {'object_key': 'img-001', 'alt_text': 'Front', 'position': 1},
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert create_resp.status_code == 201
    img_id = create_resp.json()['id']

    list_resp = ct_client.get(
        f'{BASE}/products/{ct_product.id}/images/',
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert list_resp.status_code == 200
    assert any(i['id'] == img_id for i in list_resp.json()['results'])

    detail_resp = ct_client.get(
        f'{BASE}/products/{ct_product.id}/images/{img_id}/',
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert detail_resp.status_code == 200

    del_resp = ct_client.delete(
        f'{BASE}/products/{ct_product.id}/images/{img_id}/',
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert del_resp.status_code in (204, 200)
    assert not ProductImage.all_objects.filter(pk=img_id).exists()


# ---------------------------------------------------------------------------
# 9. ProductCompositionViewSet — CRUD for kit composition
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_product_composition_crud(ct_client, ct, ct_unit):
    kit = _run_in_tenant(
        ct,
        lambda: Product.all_objects.create(
            tenant=ct, sku='KIT-001', name='Kit Test', base_unit=ct_unit,
            product_kind='kit',
        ),
    )
    component = _run_in_tenant(
        ct,
        lambda: Product.all_objects.create(
            tenant=ct, sku='COMP-001', name='Component', base_unit=ct_unit,
        ),
    )

    create_resp = _json_post(
        ct_client,
        f'{BASE}/products/{kit.id}/composition/',
        {'kit': str(kit.id), 'component': str(component.id), 'quantity': '3'},
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert create_resp.status_code == 201
    comp_id = create_resp.json()['id']

    list_resp = ct_client.get(
        f'{BASE}/products/{kit.id}/composition/',
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert list_resp.status_code == 200
    results = list_resp.json()['results']
    assert any(c['id'] == comp_id for c in results)

    detail_resp = ct_client.get(
        f'{BASE}/products/{kit.id}/composition/{comp_id}/',
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert detail_resp.status_code == 200

    del_resp = ct_client.delete(
        f'{BASE}/products/{kit.id}/composition/{comp_id}/',
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert del_resp.status_code in (204, 200)


# ---------------------------------------------------------------------------
# 10. ProductChannelProfileViewSet — CRUD with channel_slug lookup
# ---------------------------------------------------------------------------

@pytest.mark.django_db
@pytest.mark.django_db
def test_channel_profile_crud(ct_client, ct, ct_product):
    create_resp = _json_post(
        ct_client,
        f'{BASE}/products/{ct_product.id}/channel-profiles/',
        {'channel_slug': 'marketplace', 'title': 'My Product'},
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert create_resp.status_code == 201
    assert create_resp.json()['channel_slug'] == 'marketplace'

    list_resp = ct_client.get(
        f'{BASE}/products/{ct_product.id}/channel-profiles/',
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert list_resp.status_code == 200
    profiles = list_resp.json()
    assert any(p['channel_slug'] == 'marketplace' for p in profiles)

    detail_resp = ct_client.get(
        f'{BASE}/products/{ct_product.id}/channel-profiles/marketplace/',
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert detail_resp.status_code == 200
    assert detail_resp.json()['title'] == 'My Product'

    update_resp = _json_put(
        ct_client,
        f'{BASE}/products/{ct_product.id}/channel-profiles/marketplace/',
        {
            'channel_slug': 'marketplace',
            'title': 'Updated Product',
        },
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert update_resp.status_code == 200
    assert update_resp.json()['title'] == 'Updated Product'
    assert update_resp.json()['version'] == 2

    del_resp = ct_client.delete(
        f'{BASE}/products/{ct_product.id}/channel-profiles/marketplace/',
        HTTP_X_TENANT_ID=str(ct.id),
    )


# ---------------------------------------------------------------------------
# 11. ChannelProfilePublishView — POST with idempotency
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_channel_profile_publish(ct_client, ct, ct_product):
    _run_in_tenant(
        ct,
        lambda: ProductChannelProfile.all_objects.create(
            tenant=ct, product=ct_product, channel_slug='webstore', title='W',
        ),
    )
    resp = ct_client.post(
        f'{BASE}/products/{ct_product.id}/channel-profiles/webstore/publish/',
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert resp.status_code == 200
    assert resp.json()['status'] == 'ready'


@pytest.mark.django_db
def test_channel_profile_publish_idempotency(ct_client, ct, ct_product):
    _run_in_tenant(
        ct,
        lambda: ProductChannelProfile.all_objects.create(
            tenant=ct, product=ct_product, channel_slug='webstore2', title='W2',
        ),
    )
    key = str(uuid.uuid4())
    resp1 = ct_client.post(
        f'{BASE}/products/{ct_product.id}/channel-profiles/webstore2/publish/',
        HTTP_X_TENANT_ID=str(ct.id),
        HTTP_IDEMPOTENCY_KEY=key,
    )
    assert resp1.status_code == 200

    resp2 = ct_client.post(
        f'{BASE}/products/{ct_product.id}/channel-profiles/webstore2/publish/',
        HTTP_X_TENANT_ID=str(ct.id),
        HTTP_IDEMPOTENCY_KEY=key,
    )
    assert resp2.status_code == 200


@pytest.mark.django_db
def test_channel_profile_publish_not_found(ct_client, ct, ct_product):
    resp = ct_client.post(
        f'{BASE}/products/{ct_product.id}/channel-profiles/nonexistent/publish/',
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# 12. CommercialComboViewSet — add_item, remove_item
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_combo_crud(ct_client, ct, ct_product):
    now = timezone.now()
    create_resp = _json_post(
        ct_client,
        f'{BASE}/combos/',
        {
            'sku': 'COMBO-001',
            'name': 'Combo Teste',
            'price': '50.00',
            'valid_from': now.isoformat(),
        },
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert create_resp.status_code == 201
    combo_id = create_resp.json()['id']

    list_resp = ct_client.get(
        f'{BASE}/combos/',
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert list_resp.status_code == 200

    detail_resp = ct_client.get(
        f'{BASE}/combos/{combo_id}/',
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert detail_resp.status_code == 200


@pytest.mark.django_db
def test_combo_add_item_and_remove_item(ct_client, ct, ct_product):
    combo = _run_in_tenant(
        ct,
        lambda: CommercialCombo.all_objects.create(
            tenant=ct, sku='CI-001', name='Combo',
            price=Decimal('50'), valid_from=timezone.now(),
        ),
    )

    add_resp = _json_post(
        ct_client,
        f'{BASE}/combos/{combo.id}/items/',
        {'item': str(ct_product.id), 'quantity': '2'},
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert add_resp.status_code == 201
    item_id = add_resp.json()['id']

    del_resp = ct_client.delete(
        f'{BASE}/combos/{combo.id}/items/{item_id}/',
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert del_resp.status_code == 204
    assert ComboItem.all_objects.filter(pk=item_id, is_active=False).exists()


@pytest.mark.django_db
def test_combo_q_filter(ct_client, ct):
    _run_in_tenant(
        ct,
        lambda: CommercialCombo.all_objects.create(
            tenant=ct, sku='QF-001', name='QFilter Combo',
            price=Decimal('10'), valid_from=timezone.now(),
        ),
    )
    resp = ct_client.get(
        f'{BASE}/combos/',
        {'q': 'QFilter'},
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert resp.status_code == 200
    assert any(c['sku'] == 'QF-001' for c in resp.json()['results'])


# ---------------------------------------------------------------------------
# 13. LabelGenerateView — POST generating PDF
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_label_generate(ct_client, ct, ct_product):
    template = _run_in_tenant(
        ct,
        lambda: LabelTemplate.all_objects.create(
            tenant=ct, name='Etiqueta P',
            width_mm=Decimal('50'), height_mm=Decimal('30'),
        ),
    )
    resp = _json_post(
        ct_client,
        f'{BASE}/labels/generate/',
        {
            'template_id': str(template.id),
            'items': [{'product_id': str(ct_product.id), 'quantity': 2}],
        },
        HTTP_X_TENANT_ID=str(ct.id),
    )


@pytest.mark.django_db
def test_label_generate_product_not_in_tenant(ct_client, ct):
    template = _run_in_tenant(
        ct,
        lambda: LabelTemplate.all_objects.create(
            tenant=ct, name='Etiqueta X',
            width_mm=Decimal('50'), height_mm=Decimal('30'),
        ),
    )
    resp = _json_post(
        ct_client,
        f'{BASE}/labels/generate/',
        {
            'template_id': str(template.id),
            'items': [{'product_id': str(uuid.uuid4()), 'quantity': 1}],
        },
        HTTP_X_TENANT_ID=str(ct.id),
    )


@pytest.mark.django_db
def test_label_generate_template_not_found(ct_client, ct):
    resp = _json_post(
        ct_client,
        f'{BASE}/labels/generate/',
        {
            'template_id': str(uuid.uuid4()),
            'items': [{'product_id': str(uuid.uuid4()), 'quantity': 1}],
        },
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# 14. ProductApplyView — POST with command pattern
# ---------------------------------------------------------------------------

@pytest.mark.django_db
def test_product_apply_creates_product(ct_client, ct, ct_unit):
    cmd_id = f'cmd-{uuid.uuid4()}'
    payload = {
        'command_id': cmd_id,
        'product': {
            'name': 'Produto Apply',
            'base_unit': str(ct_unit.id),
        },
    }
    resp = _json_post(
        ct_client,
        f'{BASE}/products/apply/',
        payload,
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data['product']['name'] == 'Produto Apply'
    assert data['stock_policy'] is None

    created = Product.all_objects.filter(tenant=ct, sku='PRODUTO-APPLY').first()
    assert created is not None


@pytest.mark.django_db
def test_product_apply_idempotent_same_payload(ct_client, ct, ct_unit):
    cmd_id = f'cmd-{uuid.uuid4()}'
    payload = {
        'command_id': cmd_id,
        'product': {'name': 'Idempotent', 'base_unit': str(ct_unit.id)},
    }
    resp1 = _json_post(
        ct_client,
        f'{BASE}/products/apply/',
        payload,
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert resp1.status_code == 201

    resp2 = _json_post(
        ct_client,
        f'{BASE}/products/apply/',
        payload,
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert resp2.status_code == 201
    assert resp2.json()['product']['id'] == resp1.json()['product']['id']


@pytest.mark.django_db
def test_product_apply_conflict_different_payload(ct_client, ct, ct_unit):
    cmd_id = f'cmd-{uuid.uuid4()}'
    payload1 = {
        'command_id': cmd_id,
        'product': {'name': 'First', 'base_unit': str(ct_unit.id)},
    }
    resp1 = _json_post(
        ct_client,
        f'{BASE}/products/apply/',
        payload1,
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert resp1.status_code == 201

    payload2 = {
        'command_id': cmd_id,
        'product': {'name': 'Second', 'base_unit': str(ct_unit.id)},
    }
    resp2 = _json_post(
        ct_client,
        f'{BASE}/products/apply/',
        payload2,
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert resp2.status_code == 409
    assert resp2.json()['code'] == 'COMMAND_PAYLOAD_MISMATCH'


@pytest.mark.django_db
def test_product_apply_auto_generates_sku(ct_client, ct, ct_unit):
    cmd_id = f'cmd-{uuid.uuid4()}'
    resp = _json_post(
        ct_client,
        f'{BASE}/products/apply/',
        {
            'command_id': cmd_id,
            'product': {
                'name': 'Auto SKU Product Name',
                'base_unit': str(ct_unit.id),
            },
        },
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert resp.status_code == 201
    assert resp.json()['product']['sku'] == 'AUTO-SKU-PRODUCT-NAME'


@pytest.mark.django_db
def test_product_apply_with_category(ct_client, ct, ct_unit):
    cat = _run_in_tenant(
        ct,
        lambda: Category.all_objects.create(tenant=ct, name='Cat Apply', code='CAP'),
    )
    cmd_id = f'cmd-{uuid.uuid4()}'
    resp = _json_post(
        ct_client,
        f'{BASE}/products/apply/',
        {
            'command_id': cmd_id,
            'product': {
                'name': 'With Category',
                'base_unit': str(ct_unit.id),
                'category': str(cat.id),
            },
        },
        HTTP_X_TENANT_ID=str(ct.id),
    )
    assert resp.status_code == 201
    prod = Product.all_objects.get(tenant=ct, sku='WITH-CATEGORY')
    assert prod.category_id == cat.id
