"""Novos testes BDD para controle de estoque de produtos."""

import json
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.db import connection

from catalog.models import Category, Product, Unit
from inventory.models import ProductStockPolicy, StockBalance, StockLocation
from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Branch, Company, Tenant, TenantMembership

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


def _create_policy(tenant, product, branch, location, **overrides):
    defaults = {
        'tenant': tenant,
        'product': product,
        'branch': branch,
        'location': location,
        'minimum_quantity': Decimal('10'),
        'maximum_quantity': Decimal('100'),
        'reorder_point': Decimal('5'),
        'allow_negative': False,
    }
    defaults.update(overrides)
    policy = ProductStockPolicy(**defaults)
    policy.full_clean()
    policy.save()
    return policy


def _setup_stock(tenant):
    company = Company.objects.create(tenant=tenant, name='Cia')
    branch = Branch.objects.create(tenant=tenant, company=company, name='Branch')
    location = StockLocation.objects.create(
        tenant=tenant, branch=branch, code='A1', name='Deposito A1'
    )
    unit = Unit.objects.create(tenant=tenant, symbol='UN', name='Unidade')
    category = Category.objects.create(tenant=tenant, name='Cat')
    product = Product.objects.create(
        tenant=tenant,
        sku='PSPA-PROD',
        name='Test Product',
        base_unit=unit,
        category=category,
        tracks_inventory=True,
    )
    return product, branch, location


@pytest.mark.django_db
def test_deactivate_idempotent_retry_same_command_id_payload(client):
    """
    Teste 1: Retry idempotente com mesmo payload
    """
    tenant = Tenant.objects.create(name='PSPA10', slug='pspa10')
    user = User.objects.create_user(email='j@test.com', password='pass')
    _auth_client(client, user, tenant)

    product, branch, location = _run_in_tenant(tenant, lambda: _setup_stock(tenant))
    policy = _run_in_tenant(tenant, lambda: _create_policy(tenant, product, branch, location))

    payload = {'command_id': '4349bf4e-b08e-49b8-bdf4-bb85df649eec'}

    first = client.post(
        f'/api/v1/inventory/products/{product.id}/stock-control/deactivate/',
        data=json.dumps(payload),
        content_type='application/json',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert first.status_code == 201
    assert first.json()['action'] == 'deactivate'

    _run_in_tenant(tenant, lambda: policy.refresh_from_db())
    assert not policy.is_active

    replay = client.post(
        f'/api/v1/inventory/products/{product.id}/stock-control/deactivate/',
        data=json.dumps(payload),
        content_type='application/json',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert replay.status_code == 201
    assert replay.json() == first.json()


@pytest.mark.django_db
def test_deactivate_conflicts_on_same_command_id_different_payload(client):
    """
    Teste 2: Mesmo command_id com payload diferente
    """
    tenant = Tenant.objects.create(name='PSPA11', slug='pspa11')
    user = User.objects.create_user(email='k@test.com', password='pass')
    _auth_client(client, user, tenant)

    product, branch, location = _run_in_tenant(tenant, lambda: _setup_stock(tenant))
    _run_in_tenant(tenant, lambda: _create_policy(tenant, product, branch, location))

    first = client.post(
        f'/api/v1/inventory/products/{product.id}/stock-control/deactivate/',
        data=json.dumps({'command_id': '8ef1a7a0-06a0-4357-9d7e-ab2bd635ef24'}),
        content_type='application/json',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert first.status_code == 201

    replay_diff = client.post(
        f'/api/v1/inventory/products/{product.id}/stock-control/reactivate/',
        data=json.dumps(
            {
                'command_id': '8ef1a7a0-06a0-4357-9d7e-ab2bd635ef24',
                'initial_stocks': [],
            }
        ),
        content_type='application/json',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert replay_diff.status_code == 409
    assert replay_diff.json()['code'] == 'COMMAND_PAYLOAD_MISMATCH'


@pytest.mark.django_db
def test_deactivate_rollback_on_failure(client):
    """
    Teste 3: Rollback completo em falha
    """
    tenant = Tenant.objects.create(name='PSPA12', slug='pspa12')
    user = User.objects.create_user(email='l@test.com', password='pass')
    _auth_client(client, user, tenant)

    product, branch, location = _run_in_tenant(tenant, lambda: _setup_stock(tenant))
    policy = _run_in_tenant(tenant, lambda: _create_policy(tenant, product, branch, location))

    _run_in_tenant(
        tenant,
        lambda: StockBalance.objects.create(
            tenant=tenant, product=product, location=location, quantity=Decimal('10')
        ),
    )

    response = client.post(
        f'/api/v1/inventory/products/{product.id}/stock-control/deactivate/',
        data=json.dumps({'command_id': 'b1c7dc45-6c71-46bd-ab81-ed8eadecd8fc'}),
        content_type='application/json',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert response.status_code == 409
    assert response.json()['code'] == 'STOCK_CONTROL_HAS_NONZERO_BALANCE'

    from inventory.models import ProductStockControlCommand

    _run_in_tenant(tenant, lambda: policy.refresh_from_db())
    assert policy.is_active is True
    command_count = _run_in_tenant(
        tenant,
        lambda: ProductStockControlCommand.objects.filter(
            command_id='b1c7dc45-6c71-46bd-ab81-ed8eadecd8fc'
        ).count(),
    )
    assert command_count == 0


@pytest.mark.django_db
def test_stock_control_events_have_same_correlation_id(client):
    """
    Teste 4: Mesmo correlation_id na auditoria e outbox
    """
    tenant = Tenant.objects.create(name='PSPA13', slug='pspa13')
    user = User.objects.create_user(email='m@test.com', password='pass')
    _auth_client(client, user, tenant)

    product, branch, location = _run_in_tenant(tenant, lambda: _setup_stock(tenant))
    _run_in_tenant(tenant, lambda: _create_policy(tenant, product, branch, location))

    response = client.post(
        f'/api/v1/inventory/products/{product.id}/stock-control/deactivate/',
        data=json.dumps(
            {
                'command_id': '86d7cdfd-aeb9-40da-b78f-6b2dc48a609d',
                'correlation_id': '11111111-1111-1111-1111-111111111111',
            }
        ),
        content_type='application/json',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert response.status_code == 201

    from audit.models import AuditRecord
    from outbox.models import OutboxMessage

    audit = _run_in_tenant(
        tenant,
        lambda: AuditRecord.objects.filter(
            correlation_id='11111111-1111-1111-1111-111111111111'
        ).first(),
    )
    outbox = _run_in_tenant(
        tenant,
        lambda: OutboxMessage.objects.filter(
            correlation_id='11111111-1111-1111-1111-111111111111'
        ).first(),
    )

    assert audit is not None
    assert outbox is not None
    assert str(audit.correlation_id) == str(outbox.correlation_id)
    assert audit.action == outbox.event_type == 'inventory.stock_control.deactivated'


@pytest.mark.django_db
def test_deactivate_rejected_with_nonzero_quantity(client):
    """
    Teste 5: Desativação rejeitada com quantidade != 0
    """
    tenant = Tenant.objects.create(name='PSPA14', slug='pspa14')
    user = User.objects.create_user(email='n@test.com', password='pass')
    _auth_client(client, user, tenant)

    product, branch, location = _run_in_tenant(tenant, lambda: _setup_stock(tenant))
    _run_in_tenant(tenant, lambda: _create_policy(tenant, product, branch, location))

    _run_in_tenant(
        tenant,
        lambda: StockBalance.objects.create(
            tenant=tenant, product=product, location=location, quantity=Decimal('5')
        ),
    )

    response = client.post(
        f'/api/v1/inventory/products/{product.id}/stock-control/deactivate/',
        data=json.dumps({'command_id': '6fa8e950-7164-4bf8-a00e-6f81b1626017'}),
        content_type='application/json',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert response.status_code == 409
    assert response.json()['code'] == 'STOCK_CONTROL_HAS_NONZERO_BALANCE'


@pytest.mark.django_db
def test_deactivate_rejected_with_reservation(client):
    """
    Teste 6: Desativação rejeitada com reserva
    """
    tenant = Tenant.objects.create(name='PSPA15', slug='pspa15')
    user = User.objects.create_user(email='o@test.com', password='pass')
    _auth_client(client, user, tenant)

    product, branch, location = _run_in_tenant(tenant, lambda: _setup_stock(tenant))
    _run_in_tenant(tenant, lambda: _create_policy(tenant, product, branch, location))

    _run_in_tenant(
        tenant,
        lambda: StockBalance.objects.create(
            tenant=tenant,
            product=product,
            location=location,
            quantity=Decimal('0'),
            reserved=Decimal('2'),
        ),
    )

    response = client.post(
        f'/api/v1/inventory/products/{product.id}/stock-control/deactivate/',
        data=json.dumps({'command_id': '6896af16-566b-4ac4-9721-5a5dd959bc21'}),
        content_type='application/json',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert response.status_code == 409
    assert response.json()['code'] == 'STOCK_CONTROL_HAS_RESERVATIONS'


@pytest.mark.django_db
def test_deactivate_preserves_history(client):
    """
    Teste 7: Desativação preserva histórico
    """
    tenant = Tenant.objects.create(name='PSPA16', slug='pspa16')
    user = User.objects.create_user(email='p@test.com', password='pass')
    _auth_client(client, user, tenant)

    product, branch, location = _run_in_tenant(tenant, lambda: _setup_stock(tenant))
    _run_in_tenant(tenant, lambda: _create_policy(tenant, product, branch, location))

    _run_in_tenant(
        tenant,
        lambda: StockBalance.objects.create(
            tenant=tenant, product=product, location=location, quantity=Decimal('0')
        ),
    )

    from inventory.models import StockMovement, StockOperation

    def _create_mov():
        op = StockOperation.objects.create(
            tenant=tenant, branch=branch, operation_type='receipt', actor=user
        )
        StockMovement.objects.create(
            tenant=tenant,
            operation=op,
            product=product,
            location=location,
            unit=product.base_unit,
            quantity=Decimal('0'),
            direction='in',
        )

    _run_in_tenant(tenant, _create_mov)

    response = client.post(
        f'/api/v1/inventory/products/{product.id}/stock-control/deactivate/',
        data=json.dumps({'command_id': '454020a5-2965-4235-9856-78b17ab6f022'}),
        content_type='application/json',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert response.status_code == 201

    assert _run_in_tenant(tenant, lambda: StockMovement.objects.count()) == 1


@pytest.mark.django_db
def test_reactivate_rejects_initial_stock_with_history(client):
    """
    Teste 8: Reativação rejeita estoque inicial com histórico
    """
    tenant = Tenant.objects.create(name='PSPA17', slug='pspa17')
    user = User.objects.create_user(email='q@test.com', password='pass')
    _auth_client(client, user, tenant)

    product, branch, location = _run_in_tenant(tenant, lambda: _setup_stock(tenant))
    _run_in_tenant(
        tenant,
        lambda: _create_policy(
            tenant,
            product,
            branch,
            location,
            is_active=False,
        ),
    )

    from inventory.models import StockMovement, StockOperation

    def _create_mov():
        op = StockOperation.objects.create(
            tenant=tenant, branch=branch, operation_type='receipt', actor=user
        )
        StockMovement.objects.create(
            tenant=tenant,
            operation=op,
            product=product,
            location=location,
            unit=product.base_unit,
            quantity=Decimal('5'),
            direction='in',
        )

    _run_in_tenant(tenant, _create_mov)

    response = client.post(
        f'/api/v1/inventory/products/{product.id}/stock-control/reactivate/',
        data=json.dumps(
            {
                'command_id': '6fa7431f-4ee3-43c3-8820-21f4bdc8f8b8',
                'initial_stocks': [{'location_id': str(location.id), 'quantity': '10'}],
            }
        ),
        content_type='application/json',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert response.status_code == 409
    assert response.json()['code'] == 'INITIAL_STOCK_ALREADY_HAS_HISTORY'


@pytest.mark.django_db
def test_stock_summary_ordering_deterministic(client):
    """
    Teste 9: Ordenação do resumo de estoque
    """
    tenant = Tenant.objects.create(name='PSPA18', slug='pspa18')
    user = User.objects.create_user(email='r@test.com', password='pass')
    _auth_client(client, user, tenant)

    product, branch, location = _run_in_tenant(tenant, lambda: _setup_stock(tenant))

    loc2 = _run_in_tenant(
        tenant,
        lambda: StockLocation.objects.create(
            tenant=tenant, branch=branch, code='Z9', name='Deposito Z9'
        ),
    )
    loc3 = _run_in_tenant(
        tenant,
        lambda: StockLocation.objects.create(
            tenant=tenant, branch=branch, code='A0', name='Deposito A0'
        ),
    )

    _run_in_tenant(tenant, lambda: _create_policy(tenant, product, branch, location))
    _run_in_tenant(tenant, lambda: _create_policy(tenant, product, branch, loc3))
    _run_in_tenant(tenant, lambda: _create_policy(tenant, product, branch, loc2))

    response = client.get(
        f'/api/v1/inventory/product-policies/?product={product.id}',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert response.status_code == 200
    results = response.json()

    # ViewSet retorna {'results': [...]}
    assert results['results'][0]['location_name'] == 'Deposito A0'
    assert results['results'][1]['location_name'] == 'Deposito A1'
    assert results['results'][2]['location_name'] == 'Deposito Z9'


@pytest.mark.django_db
def test_stock_control_patch_preconditions_and_problem_json(client):
    """
    Teste 10: PATCH, precondições e Problem+JSON
    """
    tenant = Tenant.objects.create(name='PSPA19', slug='pspa19')
    user = User.objects.create_user(email='s@test.com', password='pass')
    _auth_client(client, user, tenant)

    product, branch, location = _run_in_tenant(tenant, lambda: _setup_stock(tenant))

    res1 = client.post(
        f'/api/v1/inventory/products/{product.id}/stock-control/deactivate/',
        data=json.dumps({}),
        content_type='application/json',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert res1.status_code == 400

    import uuid

    invalid_product_id = uuid.uuid4()
    res2 = client.post(
        f'/api/v1/inventory/products/{invalid_product_id}/stock-control/deactivate/',
        data=json.dumps({'command_id': '86f1e5f8-b390-482a-bc95-ed809b400a40'}),
        content_type='application/json',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert res2.status_code == 404
