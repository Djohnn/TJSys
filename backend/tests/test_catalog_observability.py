import pytest
from django.contrib.auth import get_user_model
from django.db import connection

from catalog.models import Unit
from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import TenantMembership

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


@pytest.fixture
def obs_tenant():
    from tenancy.models import Tenant

    return Tenant.objects.create(name='Obs', slug='obs-catalog')


@pytest.fixture
def obs_unit(obs_tenant):
    return _run_in_tenant(
        obs_tenant,
        lambda: Unit.all_objects.create(
            tenant=obs_tenant,
            symbol='kg',
            name='Kg',
            precision=3,
        ),
    )


@pytest.fixture
def manager_user(obs_tenant):
    return User.objects.create_user(email='obs-mgr@test.local', password='pass123')


@pytest.fixture
def manager_client(client, manager_user, obs_tenant):
    TenantMembership.objects.update_or_create(
        user=manager_user,
        tenant=obs_tenant,
        defaults={'role': 'manager', 'is_active': True},
    )
    client.force_login(manager_user)
    session = client.session
    session['mfa_tenant_id'] = str(obs_tenant.id)
    session['mfa_method'] = 'totp'
    session.save()
    return client


@pytest.mark.django_db
def test_product_creation_persists_audit_and_outbox(
    manager_client,
    obs_tenant,
    obs_unit,
):
    from audit.models import AuditRecord
    from outbox.models import OutboxMessage

    response = manager_client.post(
        '/api/v1/products/',
        {
            'sku': 'OBS-01',
            'name': 'Observável',
            'base_unit': str(obs_unit.id),
        },
        format='json',
        HTTP_X_TENANT_ID=str(obs_tenant.id),
    )
    assert response.status_code == 201
    product_id = response.json()['id']

    assert AuditRecord.objects.filter(
        action='catalog.product.created',
        resource_id=product_id,
    ).exists()
    assert OutboxMessage.objects.filter(
        event_type='catalog.product.created',
        aggregate_id=product_id,
    ).exists()


@pytest.mark.django_db
def test_product_update_persists_audit_and_outbox(
    manager_client,
    obs_tenant,
    obs_unit,
):
    from audit.models import AuditRecord
    from outbox.models import OutboxMessage

    create_resp = manager_client.post(
        '/api/v1/products/',
        {
            'sku': 'OBS-02',
            'name': 'Original',
            'base_unit': str(obs_unit.id),
        },
        format='json',
        HTTP_X_TENANT_ID=str(obs_tenant.id),
    )
    product_id = create_resp.json()['id']

    update_resp = manager_client.patch(
        f'/api/v1/products/{product_id}/',
        {'name': 'Atualizado'},
        format='json',
        content_type='application/json',
        HTTP_X_TENANT_ID=str(obs_tenant.id),
    )
    assert update_resp.status_code == 200

    assert AuditRecord.objects.filter(
        action='catalog.product.updated',
        resource_id=product_id,
    ).exists()
    assert OutboxMessage.objects.filter(
        event_type='catalog.product.updated',
        aggregate_id=product_id,
    ).exists()


@pytest.mark.django_db
def test_product_deactivation_persists_audit_and_outbox(
    manager_client,
    obs_tenant,
    obs_unit,
):
    from audit.models import AuditRecord
    from outbox.models import OutboxMessage

    create_resp = manager_client.post(
        '/api/v1/products/',
        {
            'sku': 'OBS-03',
            'name': 'Desativar',
            'base_unit': str(obs_unit.id),
        },
        format='json',
        HTTP_X_TENANT_ID=str(obs_tenant.id),
    )
    product_id = create_resp.json()['id']

    manager_client.delete(
        f'/api/v1/products/{product_id}/',
        HTTP_X_TENANT_ID=str(obs_tenant.id),
    )

    assert AuditRecord.objects.filter(
        action='catalog.product.deactivated',
        resource_id=product_id,
    ).exists()
    assert OutboxMessage.objects.filter(
        event_type='catalog.product.deactivated',
        aggregate_id=product_id,
    ).exists()


@pytest.mark.django_db
def test_outbox_event_has_no_sensitive_payload(
    manager_client,
    obs_tenant,
    obs_unit,
):
    from outbox.models import OutboxMessage

    manager_client.post(
        '/api/v1/products/',
        {
            'sku': 'OBS-04',
            'name': 'Sem Segredos',
            'base_unit': str(obs_unit.id),
        },
        format='json',
        HTTP_X_TENANT_ID=str(obs_tenant.id),
    )

    msg = OutboxMessage.objects.filter(
        event_type='catalog.product.created',
    ).first()
    assert msg is not None
    payload_str = str(msg.payload)
    assert 'password' not in payload_str.lower()
    assert 'token' not in payload_str.lower()
    assert 'secret' not in payload_str.lower()
