"""Sprint 24 — BDD tests for Brand CRUD and ProductImage nested routes."""

import pytest
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile

from catalog.models import Brand, Product, ProductImage, Unit
from tenancy.models import Tenant


@pytest.fixture
def brand_context(client):
    from django.contrib.auth import get_user_model

    from tenancy.models import TenantMembership

    User = get_user_model()
    tenant = Tenant.objects.create(name='S24 Brand', slug='s24-brand')
    user = User.objects.create_user(email='s24brand@test.local', password='pass')
    TenantMembership.objects.create(user=user, tenant=tenant, role='admin', is_active=True)
    client.force_login(user)
    session = client.session
    session['mfa_tenant_id'] = str(tenant.id)
    session['mfa_method'] = 'totp'
    session.save()
    return {'client': client, 'tenant': tenant}


HEADERS_TEMPLATE = 'HTTP_X_TENANT_ID'


@pytest.mark.django_db
def test_brand_create(brand_context):
    ctx = brand_context
    response = ctx['client'].post(
        '/api/v1/catalog/brands/',
        {'name': 'Marca QA'},
        content_type='application/json',
        **{HEADERS_TEMPLATE: str(ctx['tenant'].id)},
    )
    assert response.status_code == 201
    assert response.json()['name'] == 'Marca QA'


@pytest.mark.django_db
def test_brand_list(brand_context):
    ctx = brand_context
    Brand.objects.create(tenant=ctx['tenant'], name='Listed Brand')
    response = ctx['client'].get(
        '/api/v1/catalog/brands/', **{HEADERS_TEMPLATE: str(ctx['tenant'].id)}
    )
    assert response.status_code == 200
    assert len(response.json()['results']) >= 1


@pytest.mark.django_db
def test_brand_cross_tenant_isolation(brand_context):
    ctx = brand_context
    other_tenant = Tenant.objects.create(name='Other', slug='other')
    Brand.objects.create(tenant=other_tenant, name='Secret')
    response = ctx['client'].get(
        '/api/v1/catalog/brands/', **{HEADERS_TEMPLATE: str(ctx['tenant'].id)}
    )
    assert response.status_code == 200
    assert len(response.json()['results']) == 0


def _make_unit(tenant):
    from django.db import connection

    from tenancy.context import reset_current_tenant_id, set_current_tenant_id

    token = set_current_tenant_id(tenant.id)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'SELECT set_config(%s, %s, true)', ['app.current_tenant_id', str(tenant.id)]
            )
        return Unit.all_objects.create(tenant=tenant, symbol='UN', name='Un')
    finally:
        reset_current_tenant_id(token)


def _make_product(tenant, base_unit):
    from django.db import connection

    from tenancy.context import reset_current_tenant_id, set_current_tenant_id

    token = set_current_tenant_id(tenant.id)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                'SELECT set_config(%s, %s, true)', ['app.current_tenant_id', str(tenant.id)]
            )
        return Product.all_objects.create(
            tenant=tenant, sku='IMG-TEST', name='Image Test', base_unit=base_unit
        )
    finally:
        reset_current_tenant_id(token)


@pytest.mark.django_db
def test_product_image_create(brand_context):
    ctx = brand_context
    unit = _make_unit(ctx['tenant'])
    product = _make_product(ctx['tenant'], unit)
    response = ctx['client'].post(
        f'/api/v1/catalog/products/{product.id}/images/',
        {'object_key': 'products/test.webp', 'is_primary': True, 'position': 0},
        content_type='application/json',
        **{HEADERS_TEMPLATE: str(ctx['tenant'].id)},
    )
    assert response.status_code == 201


@pytest.mark.django_db
def test_product_image_accepts_valid_upload_and_rejects_invalid_type(brand_context):
    """Given an existing product, image upload shall validate and persist the file."""
    ctx = brand_context
    unit = _make_unit(ctx['tenant'])
    product = _make_product(ctx['tenant'], unit)
    valid_file = SimpleUploadedFile('produto.png', b'fake-png', content_type='image/png')
    valid = ctx['client'].post(
        f'/api/v1/catalog/products/{product.id}/images/',
        {'file': valid_file, 'alt_text': 'Produto em destaque', 'is_primary': True},
        **{HEADERS_TEMPLATE: str(ctx['tenant'].id)},
    )
    assert valid.status_code == 201
    assert valid.json()['file']

    invalid_file = SimpleUploadedFile('produto.txt', b'not-an-image', content_type='text/plain')
    invalid = ctx['client'].post(
        f'/api/v1/catalog/products/{product.id}/images/',
        {'file': invalid_file},
        **{HEADERS_TEMPLATE: str(ctx['tenant'].id)},
    )
    assert invalid.status_code == 400


@pytest.mark.django_db
def test_product_image_delete_removes_uploaded_file(brand_context):
    """Given an uploaded product image, deleting it shall remove DB and storage state."""
    ctx = brand_context
    unit = _make_unit(ctx['tenant'])
    product = _make_product(ctx['tenant'], unit)
    upload = SimpleUploadedFile('cleanup.png', b'fake-png', content_type='image/png')

    # Given an existing uploaded image
    created = ctx['client'].post(
        f'/api/v1/catalog/products/{product.id}/images/',
        {'file': upload, 'alt_text': 'Cleanup'},
        **{HEADERS_TEMPLATE: str(ctx['tenant'].id)},
    )
    assert created.status_code == 201
    image = ProductImage.all_objects.get(id=created.json()['id'])
    stored_name = image.file.name
    assert default_storage.exists(stored_name)

    # When the owner deletes the image
    deleted = ctx['client'].delete(
        f'/api/v1/catalog/products/{product.id}/images/{image.id}/',
        **{HEADERS_TEMPLATE: str(ctx['tenant'].id)},
    )

    # Then both persistent representations are gone
    assert deleted.status_code == 204
    assert not ProductImage.all_objects.filter(id=image.id).exists()
    assert not default_storage.exists(stored_name)
