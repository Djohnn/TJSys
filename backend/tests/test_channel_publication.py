"""Sprint 29 — BDD tests for channel publication endpoint."""

import pytest
from django.contrib.auth import get_user_model
from django.db import connection

from catalog.models import Product, ProductChannelProfile, Unit
from outbox.models import OutboxMessage
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
def pub_ctx(client):
    tenant = Tenant.objects.create(name='S29 Pub', slug='s29-pub')
    user = User.objects.create_user(email='s29pub@test.local', password='pass123')
    api_client = _auth_client(client, user, tenant, role='admin')

    def _create():
        unit = Unit.all_objects.create(tenant=tenant, symbol='UN', name='Unidade')
        product = Product.all_objects.create(
            tenant=tenant,
            sku='S29-PUB',
            name='Produto Publicavel',
            base_unit=unit,
        )
        profile = ProductChannelProfile.all_objects.create(
            tenant=tenant,
            product=product,
            channel_slug='mercadolivre',
            title='ML Pub',
            status='draft',
        )
        return {
            'tenant': tenant,
            'client': api_client,
            'product': product,
            'profile': profile,
        }

    return _run_in_tenant(tenant, _create)


# ---------------------------------------------------------------------------
# Scenario 1 — Publish a channel profile
#   Given a product with a draft channel profile
#   When POST /api/v1/catalog/products/{id}/channel-profiles/{slug}/publish/
#   Then 200, status becomes 'ready', outbox event created
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_publish_channel_profile_creates_outbox_event(pub_ctx):
    tenant = pub_ctx['tenant']
    client = pub_ctx['client']
    product = pub_ctx['product']
    profile = pub_ctx['profile']

    response = client.post(
        f'/api/v1/catalog/products/{product.id}/channel-profiles/{profile.channel_slug}/publish/',
        format='json',
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 200
    data = response.json()
    assert data['status'] == 'ready'

    outbox = OutboxMessage.objects.filter(
        event_type='catalog.channel.publication_requested',
        tenant_id=str(tenant.id),
        aggregate_id=str(profile.id),
    ).first()

    assert outbox is not None
    assert outbox.event_type == 'catalog.channel.publication_requested'


# ---------------------------------------------------------------------------
# Scenario 2 — Publish with idempotency key (idempotent)
#   Given a draft profile
#   When POST with Idempotency-Key twice
#   Then first creates event, second returns 200 but no duplicate event
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_publish_channel_idempotent(pub_ctx):
    tenant = pub_ctx['tenant']
    client = pub_ctx['client']
    product = pub_ctx['product']
    profile = pub_ctx['profile']

    idem_key = 'pub-abc-123'

    r1 = client.post(
        f'/api/v1/catalog/products/{product.id}/channel-profiles/{profile.channel_slug}/publish/',
        format='json',
        HTTP_X_TENANT_ID=str(tenant.id),
        HTTP_IDEMPOTENCY_KEY=idem_key,
    )
    assert r1.status_code == 200

    r2 = client.post(
        f'/api/v1/catalog/products/{product.id}/channel-profiles/{profile.channel_slug}/publish/',
        format='json',
        HTTP_X_TENANT_ID=str(tenant.id),
        HTTP_IDEMPOTENCY_KEY=idem_key,
    )
    assert r2.status_code == 200
    data = r2.json()
    assert data['status'] in ('ready', 'published')

    count = OutboxMessage.objects.filter(
        event_type='catalog.channel.publication_requested',
        tenant_id=str(tenant.id),
        aggregate_id=str(profile.id),
    ).count()
    assert count == 1


# ---------------------------------------------------------------------------
# Scenario 3 — Publish non-existent profile returns 404
#   Given a product without the profile
#   When POST publish for unknown slug
#   Then 404
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_publish_channel_missing_profile_returns_404(pub_ctx):
    tenant = pub_ctx['tenant']
    client = pub_ctx['client']
    product = pub_ctx['product']

    response = client.post(
        f'/api/v1/catalog/products/{product.id}/channel-profiles/inexistente/publish/',
        format='json',
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Scenario 4 — Publish cross-tenant fails
#   Given profile belongs to tenant_alpha
#   When tenant_beta tries to publish
#   Then 404 (tenant isolation)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_publish_channel_cross_tenant_returns_404(pub_ctx, client):
    product = pub_ctx['product']
    profile = pub_ctx['profile']

    tenant_beta = Tenant.objects.create(name='S29 Pub Beta', slug='s29-pub-beta')
    user_beta = User.objects.create_user(email='s29pubbeta@test.local', password='pass123')
    beta_client = _auth_client(client, user_beta, tenant_beta, role='admin')

    response = beta_client.post(
        f'/api/v1/catalog/products/{product.id}/channel-profiles/{profile.channel_slug}/publish/',
        format='json',
        HTTP_X_TENANT_ID=str(tenant_beta.id),
    )

    assert response.status_code == 404
