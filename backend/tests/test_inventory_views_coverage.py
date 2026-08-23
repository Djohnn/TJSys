import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.db import connection

from catalog.models import Product, Unit
from inventory.models import (
    ProductStockPolicy,
    StockLocation,
    StockLot,
)
from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Branch, Company, Tenant, TenantMembership

User = get_user_model()

BASE = '/api/v1/inventory'


def _run_in_tenant(tenant, callback):
    token = set_current_tenant_id(tenant.id)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT set_config('app.current_tenant_id', %s, true)",
                [str(tenant.id)],
            )
        return callback()
    finally:
        reset_current_tenant_id(token)


def _auth_client(client, user, tenant):
    TenantMembership.objects.update_or_create(
        user=user,
        tenant=tenant,
        defaults={'role': 'admin', 'is_active': True},
    )
    client.force_login(user)
    session = client.session
    session['mfa_tenant_id'] = str(tenant.id)
    session['mfa_method'] = 'totp'
    session.save()
    return client


def _create_seed(tenant, user, *, sku='INV-001', requires_lot=False):
    """Create common inventory seed data inside tenant context."""

    def _inner():
        unit = Unit.all_objects.create(
            tenant=tenant,
            symbol='kg',
            name='Quilograma',
            precision=3,
        )
        product = Product.all_objects.create(
            tenant=tenant,
            sku=sku,
            name=f'Produto {sku}',
            base_unit=unit,
            requires_lot=requires_lot,
            requires_expiry=requires_lot,
        )
        company = Company.all_objects.create(tenant=tenant, name='Empresa Teste')
        branch = Branch.all_objects.create(
            tenant=tenant,
            company=company,
            name='Filial Teste',
        )
        location = StockLocation.all_objects.create(
            tenant=tenant,
            branch=branch,
            code='LOC-01',
            name='Local Teste',
            is_primary=True,
        )
        lot = None
        if requires_lot:
            lot = StockLot.all_objects.create(
                tenant=tenant,
                product=product,
                lot_number=f'{sku}-LOT',
                expiry_date=date.today() + timedelta(days=90),
            )
        return {
            'unit': unit,
            'product': product,
            'company': company,
            'branch': branch,
            'location': location,
            'lot': lot,
        }

    return _run_in_tenant(tenant, _inner)


def _do_receipt(
    tenant,
    branch,
    product,
    location,
    quantity,
    unit,
    *,
    factor=Decimal('1'),
    lot=None,
    idempotency_key,
    actor,
):
    from inventory.services import create_receipt

    return create_receipt(
        tenant=tenant,
        branch=branch,
        product=product,
        location=location,
        quantity=quantity,
        unit=unit,
        factor=factor,
        lot=lot,
        idempotency_key=idempotency_key,
        actor=actor,
    )


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def ctx(client):
    """Full test context: tenant, user, client, seed data."""
    tenant = Tenant.objects.create(name='Inv View', slug='inv-view')
    user = User.objects.create_user(email='inv-view@test.local', password='pass123')
    api_client = _auth_client(client, user, tenant)
    seed = _create_seed(tenant, user)
    return {
        'tenant': tenant,
        'user': user,
        'client': api_client,
        **seed,
    }


@pytest.fixture
def ctx_lot(client):
    """Context with a lot-tracked product."""
    tenant = Tenant.objects.create(name='Inv Lot', slug='inv-lot')
    user = User.objects.create_user(email='inv-lot@test.local', password='pass123')
    api_client = _auth_client(client, user, tenant)
    seed = _create_seed(tenant, user, sku='LOT-001', requires_lot=True)
    return {
        'tenant': tenant,
        'user': user,
        'client': api_client,
        **seed,
    }


# ---------------------------------------------------------------------------
# StockLocationViewSet
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_location_list(ctx):
    r = ctx['client'].get(
        f'{BASE}/stock-locations/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert r.status_code == 200
    assert r.json()['count'] == 1


@pytest.mark.django_db
def test_location_create(ctx):
    r = ctx['client'].post(
        f'{BASE}/stock-locations/',
        {
            'branch': str(ctx['branch'].id),
            'code': 'LOC-NEW',
            'name': 'Novo Local',
        },
        format='json',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert r.status_code == 201
    assert r.json()['code'] == 'LOC-NEW'


@pytest.mark.django_db
def test_location_update(ctx):
    import json

    loc = ctx['location']
    r = ctx['client'].put(
        f'{BASE}/stock-locations/{loc.id}/',
        data=json.dumps(
            {
                'branch': str(ctx['branch'].id),
                'code': 'LOC-01',
                'name': 'Local Atualizado',
            }
        ),
        content_type='application/json',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert r.status_code == 200
    assert r.json()['name'] == 'Local Atualizado'


@pytest.mark.django_db
def test_location_partial_update(ctx):
    import json

    loc = ctx['location']
    r = ctx['client'].patch(
        f'{BASE}/stock-locations/{loc.id}/',
        data=json.dumps({'name': 'Local Patch'}),
        content_type='application/json',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert r.status_code == 200
    assert r.json()['name'] == 'Local Patch'


@pytest.mark.django_db
def test_location_delete(ctx):
    from inventory.models import StockLocation as SL

    loc = SL.all_objects.create(
        tenant=ctx['tenant'],
        branch=ctx['branch'],
        code='DEL',
        name='Deletar',
    )
    r = ctx['client'].delete(
        f'{BASE}/stock-locations/{loc.id}/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert r.status_code == 204


@pytest.mark.django_db
def test_location_set_primary(ctx):
    from inventory.models import StockLocation as SL

    loc2 = SL.all_objects.create(
        tenant=ctx['tenant'],
        branch=ctx['branch'],
        code='LOC-02',
        name='Segundo',
    )
    r = ctx['client'].post(
        f'{BASE}/stock-locations/{loc2.id}/set_primary/',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert r.status_code == 200
    assert 'principal' in r.json()['detail']
    loc2.refresh_from_db()
    assert loc2.is_primary is True


# ---------------------------------------------------------------------------
# StockLotViewSet
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_lot_list(ctx_lot):
    r = ctx_lot['client'].get(
        f'{BASE}/lots/',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
    )
    assert r.status_code == 200
    assert r.json()['count'] == 1


@pytest.mark.django_db
def test_lot_create(ctx_lot):
    r = ctx_lot['client'].post(
        f'{BASE}/lots/',
        {
            'product': str(ctx_lot['product'].id),
            'lot_number': 'NEW-LOT',
            'expiry_date': (date.today() + timedelta(days=60)).isoformat(),
        },
        format='json',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
    )
    assert r.status_code == 201
    assert r.json()['lot_number'] == 'NEW-LOT'


@pytest.mark.django_db
def test_lot_deactivate(ctx_lot):
    lot = ctx_lot['lot']
    r = ctx_lot['client'].post(
        f'{BASE}/lots/{lot.id}/deactivate/',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
    )
    assert r.status_code == 200
    lot.refresh_from_db()
    assert lot.is_active is False


@pytest.mark.django_db
def test_lot_expired_action(ctx_lot):
    def _create_expired():
        StockLot.all_objects.create(
            tenant=ctx_lot['tenant'],
            product=ctx_lot['product'],
            lot_number='EXP-LOT',
            expiry_date=date.today() - timedelta(days=5),
        )

    _run_in_tenant(ctx_lot['tenant'], _create_expired)

    r = ctx_lot['client'].get(
        f'{BASE}/lots/expired/',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
    )
    assert r.status_code == 200
    data = r.json()
    assert any(lot['lot_number'] == 'EXP-LOT' for lot in data)


# ---------------------------------------------------------------------------
# StockOperationViewSet — confirm
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_operation_confirm(ctx_lot):
    def _create_op():
        from inventory.models import StockOperation as SO

        return SO.all_objects.create(
            tenant=ctx_lot['tenant'],
            operation_type='receipt',
            branch=ctx_lot['branch'],
            status='draft',
            actor=ctx_lot['user'],
        )

    op = _run_in_tenant(ctx_lot['tenant'], _create_op)

    r = ctx_lot['client'].post(
        f'{BASE}/stock-operations/{op.id}/confirm/',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
    )
    assert r.status_code == 200
    assert 'confirmada' in r.json()['detail']


@pytest.mark.django_db
def test_operation_confirm_rejects_non_draft(ctx_lot):
    def _create_op():
        return _do_receipt(
            ctx_lot['tenant'],
            ctx_lot['branch'],
            ctx_lot['product'],
            ctx_lot['location'],
            Decimal('5'),
            ctx_lot['unit'],
            lot=ctx_lot['lot'],
            idempotency_key=f'confirm-reject-{uuid.uuid4().hex[:8]}',
            actor=ctx_lot['user'],
        )

    op = _run_in_tenant(ctx_lot['tenant'], _create_op)

    r = ctx_lot['client'].post(
        f'{BASE}/stock-operations/{op.id}/confirm/',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
    )
    assert r.status_code == 400
    assert 'rascunho' in r.json()['detail']


# ---------------------------------------------------------------------------
# StockOperationViewSet — receipt / issue / adjustment / transfer / reverse
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_receipt_action(ctx_lot):
    r = ctx_lot['client'].post(
        f'{BASE}/stock-operations/receipt/',
        {
            'branch': str(ctx_lot['branch'].id),
            'product': str(ctx_lot['product'].id),
            'location': str(ctx_lot['location'].id),
            'quantity': '10.000000',
            'unit': str(ctx_lot['unit'].id),
            'factor': '1.000000',
            'lot': str(ctx_lot['lot'].id),
        },
        format='json',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
        HTTP_IDEMPOTENCY_KEY=f'receipt-view-{uuid.uuid4().hex[:8]}',
    )
    assert r.status_code == 200
    assert r.json()['operation_type'] == 'receipt'


@pytest.mark.django_db
def test_issue_action(ctx_lot):
    def _receive():
        _do_receipt(
            ctx_lot['tenant'],
            ctx_lot['branch'],
            ctx_lot['product'],
            ctx_lot['location'],
            Decimal('20'),
            ctx_lot['unit'],
            lot=ctx_lot['lot'],
            idempotency_key=f'issue-seed-{uuid.uuid4().hex[:8]}',
            actor=ctx_lot['user'],
        )

    _run_in_tenant(ctx_lot['tenant'], _receive)

    r = ctx_lot['client'].post(
        f'{BASE}/stock-operations/issue/',
        {
            'branch': str(ctx_lot['branch'].id),
            'product': str(ctx_lot['product'].id),
            'location': str(ctx_lot['location'].id),
            'quantity': '5.000000',
            'unit': str(ctx_lot['unit'].id),
            'factor': '1.000000',
            'lot': str(ctx_lot['lot'].id),
        },
        format='json',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
        HTTP_IDEMPOTENCY_KEY=f'issue-view-{uuid.uuid4().hex[:8]}',
    )
    assert r.status_code == 200
    assert r.json()['operation_type'] == 'issue'


@pytest.mark.django_db
def test_adjustment_action(ctx_lot):
    r = ctx_lot['client'].post(
        f'{BASE}/stock-operations/adjustment/',
        {
            'branch': str(ctx_lot['branch'].id),
            'product': str(ctx_lot['product'].id),
            'location': str(ctx_lot['location'].id),
            'quantity': '3.000000',
            'unit': str(ctx_lot['unit'].id),
            'factor': '1.000000',
            'lot': str(ctx_lot['lot'].id),
        },
        format='json',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
        HTTP_IDEMPOTENCY_KEY=f'adj-view-{uuid.uuid4().hex[:8]}',
    )
    assert r.status_code == 200
    assert r.json()['operation_type'] == 'adjustment'


@pytest.mark.django_db
def test_transfer_action(ctx_lot):
    def _create_loc():
        return StockLocation.all_objects.create(
            tenant=ctx_lot['tenant'],
            branch=ctx_lot['branch'],
            code='LOC-TGT',
            name='Destino',
        )

    loc2 = _run_in_tenant(ctx_lot['tenant'], _create_loc)

    # Seed stock before transfer
    def _seed():
        _do_receipt(
            ctx_lot['tenant'],
            ctx_lot['branch'],
            ctx_lot['product'],
            ctx_lot['location'],
            Decimal('20'),
            ctx_lot['unit'],
            lot=ctx_lot['lot'],
            idempotency_key=f'transfer-seed-{uuid.uuid4().hex[:8]}',
            actor=ctx_lot['user'],
        )

    _run_in_tenant(ctx_lot['tenant'], _seed)

    r = ctx_lot['client'].post(
        f'{BASE}/stock-operations/transfer/',
        {
            'source_branch': str(ctx_lot['branch'].id),
            'target_branch': str(ctx_lot['branch'].id),
            'product': str(ctx_lot['product'].id),
            'source_location': str(ctx_lot['location'].id),
            'target_location': str(loc2.id),
            'quantity': '2.000000',
            'unit': str(ctx_lot['unit'].id),
            'factor': '1.000000',
            'lot': str(ctx_lot['lot'].id),
        },
        format='json',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
        HTTP_IDEMPOTENCY_KEY=f'transfer-view-{uuid.uuid4().hex[:8]}',
    )
    assert r.status_code == 200
    assert r.json()['operation_type'] == 'transfer'


@pytest.mark.django_db
def test_reverse_action(ctx_lot):
    def _create_op():
        return _do_receipt(
            ctx_lot['tenant'],
            ctx_lot['branch'],
            ctx_lot['product'],
            ctx_lot['location'],
            Decimal('5'),
            ctx_lot['unit'],
            lot=ctx_lot['lot'],
            idempotency_key=f'reverse-seed-{uuid.uuid4().hex[:8]}',
            actor=ctx_lot['user'],
        )

    op = _run_in_tenant(ctx_lot['tenant'], _create_op)

    r = ctx_lot['client'].post(
        f'{BASE}/stock-operations/reverse/',
        {
            'operation': str(op.id),
            'reason': 'Erro no recebimento',
        },
        format='json',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
        HTTP_IDEMPOTENCY_KEY=f'reverse-view-{uuid.uuid4().hex[:8]}',
    )
    assert r.status_code == 200
    assert r.json()['operation_type'] == 'reversal'


# ---------------------------------------------------------------------------
# StockOperationViewSet — error handling paths
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_receipt_missing_idempotency_key(ctx_lot):
    r = ctx_lot['client'].post(
        f'{BASE}/stock-operations/receipt/',
        {
            'branch': str(ctx_lot['branch'].id),
            'product': str(ctx_lot['product'].id),
            'location': str(ctx_lot['location'].id),
            'quantity': '1.000000',
            'unit': str(ctx_lot['unit'].id),
            'factor': '1.000000',
        },
        format='json',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
    )
    assert r.status_code == 400
    assert 'Idempotency-Key' in r.json()['detail']


@pytest.mark.django_db
def test_receipt_invalid_lot(ctx_lot):
    r = ctx_lot['client'].post(
        f'{BASE}/stock-operations/receipt/',
        {
            'branch': str(ctx_lot['branch'].id),
            'product': str(ctx_lot['product'].id),
            'location': str(ctx_lot['location'].id),
            'quantity': '1.000000',
            'unit': str(ctx_lot['unit'].id),
            'factor': '1.000000',
            'lot': str(uuid.uuid4()),
        },
        format='json',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
        HTTP_IDEMPOTENCY_KEY=f'invalid-lot-{uuid.uuid4().hex[:8]}',
    )
    assert r.status_code in (400, 404)


@pytest.mark.django_db
def test_issue_insufficient_stock(ctx_lot):
    r = ctx_lot['client'].post(
        f'{BASE}/stock-operations/issue/',
        {
            'branch': str(ctx_lot['branch'].id),
            'product': str(ctx_lot['product'].id),
            'location': str(ctx_lot['location'].id),
            'quantity': '999.000000',
            'unit': str(ctx_lot['unit'].id),
            'factor': '1.000000',
            'lot': str(ctx_lot['lot'].id),
        },
        format='json',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
        HTTP_IDEMPOTENCY_KEY=f'insuf-{uuid.uuid4().hex[:8]}',
    )
    assert r.status_code == 409
    assert 'insufficient_stock' in r.json()['type']


@pytest.mark.django_db
def test_receipt_invalid_resource(ctx_lot):
    r = ctx_lot['client'].post(
        f'{BASE}/stock-operations/receipt/',
        {
            'branch': str(uuid.uuid4()),
            'product': str(ctx_lot['product'].id),
            'location': str(ctx_lot['location'].id),
            'quantity': '1.000000',
            'unit': str(ctx_lot['unit'].id),
            'factor': '1.000000',
        },
        format='json',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
        HTTP_IDEMPOTENCY_KEY=f'notfound-{uuid.uuid4().hex[:8]}',
    )
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# StockMovementViewSet
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_movement_list(ctx_lot):
    def _seed():
        _do_receipt(
            ctx_lot['tenant'],
            ctx_lot['branch'],
            ctx_lot['product'],
            ctx_lot['location'],
            Decimal('10'),
            ctx_lot['unit'],
            lot=ctx_lot['lot'],
            idempotency_key=f'mov-seed-{uuid.uuid4().hex[:8]}',
            actor=ctx_lot['user'],
        )

    _run_in_tenant(ctx_lot['tenant'], _seed)

    r = ctx_lot['client'].get(
        f'{BASE}/movements/',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
    )
    assert r.status_code == 200
    assert r.json()['count'] >= 1


@pytest.mark.django_db
def test_movement_list_date_filters(ctx_lot):
    def _seed():
        _do_receipt(
            ctx_lot['tenant'],
            ctx_lot['branch'],
            ctx_lot['product'],
            ctx_lot['location'],
            Decimal('10'),
            ctx_lot['unit'],
            lot=ctx_lot['lot'],
            idempotency_key=f'mov-date-{uuid.uuid4().hex[:8]}',
            actor=ctx_lot['user'],
        )

    _run_in_tenant(ctx_lot['tenant'], _seed)

    today = date.today().isoformat()
    r = ctx_lot['client'].get(
        f'{BASE}/movements/?date_from={today}&date_to={today}',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
    )
    assert r.status_code == 200


@pytest.mark.django_db
def test_movement_list_type_filter(ctx_lot):
    def _seed():
        _do_receipt(
            ctx_lot['tenant'],
            ctx_lot['branch'],
            ctx_lot['product'],
            ctx_lot['location'],
            Decimal('10'),
            ctx_lot['unit'],
            lot=ctx_lot['lot'],
            idempotency_key=f'mov-type-{uuid.uuid4().hex[:8]}',
            actor=ctx_lot['user'],
        )

    _run_in_tenant(ctx_lot['tenant'], _seed)

    r = ctx_lot['client'].get(
        f'{BASE}/movements/?type=in',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
    )
    assert r.status_code == 200
    for item in r.json()['results']:
        assert item['direction'] == 'in'


# ---------------------------------------------------------------------------
# StockBalanceViewSet
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_balance_list(ctx_lot):
    def _seed():
        _do_receipt(
            ctx_lot['tenant'],
            ctx_lot['branch'],
            ctx_lot['product'],
            ctx_lot['location'],
            Decimal('15'),
            ctx_lot['unit'],
            lot=ctx_lot['lot'],
            idempotency_key=f'bal-seed-{uuid.uuid4().hex[:8]}',
            actor=ctx_lot['user'],
        )

    _run_in_tenant(ctx_lot['tenant'], _seed)

    r = ctx_lot['client'].get(
        f'{BASE}/balances/',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
    )
    assert r.status_code == 200
    assert r.json()['count'] == 1


@pytest.mark.django_db
def test_balance_list_filter_product(ctx_lot):
    def _seed():
        _do_receipt(
            ctx_lot['tenant'],
            ctx_lot['branch'],
            ctx_lot['product'],
            ctx_lot['location'],
            Decimal('5'),
            ctx_lot['unit'],
            lot=ctx_lot['lot'],
            idempotency_key=f'bal-prod-{uuid.uuid4().hex[:8]}',
            actor=ctx_lot['user'],
        )

    _run_in_tenant(ctx_lot['tenant'], _seed)

    r = ctx_lot['client'].get(
        f'{BASE}/balances/?product={ctx_lot["product"].id}',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
    )
    assert r.status_code == 200
    assert r.json()['count'] == 1


@pytest.mark.django_db
def test_balance_list_filter_branch(ctx_lot):
    def _seed():
        _do_receipt(
            ctx_lot['tenant'],
            ctx_lot['branch'],
            ctx_lot['product'],
            ctx_lot['location'],
            Decimal('5'),
            ctx_lot['unit'],
            lot=ctx_lot['lot'],
            idempotency_key=f'bal-branch-{uuid.uuid4().hex[:8]}',
            actor=ctx_lot['user'],
        )

    _run_in_tenant(ctx_lot['tenant'], _seed)

    r = ctx_lot['client'].get(
        f'{BASE}/balances/?branch={ctx_lot["branch"].id}',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
    )
    assert r.status_code == 200


@pytest.mark.django_db
def test_balance_list_filter_location(ctx_lot):
    def _seed():
        _do_receipt(
            ctx_lot['tenant'],
            ctx_lot['branch'],
            ctx_lot['product'],
            ctx_lot['location'],
            Decimal('5'),
            ctx_lot['unit'],
            lot=ctx_lot['lot'],
            idempotency_key=f'bal-loc-{uuid.uuid4().hex[:8]}',
            actor=ctx_lot['user'],
        )

    _run_in_tenant(ctx_lot['tenant'], _seed)

    r = ctx_lot['client'].get(
        f'{BASE}/balances/?location={ctx_lot["location"].id}',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
    )
    assert r.status_code == 200


@pytest.mark.django_db
def test_balance_list_filter_lot(ctx_lot):
    def _seed():
        _do_receipt(
            ctx_lot['tenant'],
            ctx_lot['branch'],
            ctx_lot['product'],
            ctx_lot['location'],
            Decimal('5'),
            ctx_lot['unit'],
            lot=ctx_lot['lot'],
            idempotency_key=f'bal-lot-{uuid.uuid4().hex[:8]}',
            actor=ctx_lot['user'],
        )

    _run_in_tenant(ctx_lot['tenant'], _seed)

    r = ctx_lot['client'].get(
        f'{BASE}/balances/?lot={ctx_lot["lot"].id}',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
    )
    assert r.status_code == 200


@pytest.mark.django_db
def test_balance_summary(ctx_lot):
    def _seed():
        _do_receipt(
            ctx_lot['tenant'],
            ctx_lot['branch'],
            ctx_lot['product'],
            ctx_lot['location'],
            Decimal('20'),
            ctx_lot['unit'],
            lot=ctx_lot['lot'],
            idempotency_key=f'bal-sum-{uuid.uuid4().hex[:8]}',
            actor=ctx_lot['user'],
        )

    _run_in_tenant(ctx_lot['tenant'], _seed)

    r = ctx_lot['client'].get(
        f'{BASE}/balances/summary/',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
    )
    assert r.status_code == 200
    body = r.json()
    assert body['total_items'] >= 1
    assert Decimal(str(body['total_quantity'])) > 0


@pytest.mark.django_db
def test_balance_reconcile(ctx_lot):
    def _seed():
        _do_receipt(
            ctx_lot['tenant'],
            ctx_lot['branch'],
            ctx_lot['product'],
            ctx_lot['location'],
            Decimal('10'),
            ctx_lot['unit'],
            lot=ctx_lot['lot'],
            idempotency_key=f'bal-rec-{uuid.uuid4().hex[:8]}',
            actor=ctx_lot['user'],
        )

    _run_in_tenant(ctx_lot['tenant'], _seed)

    r = ctx_lot['client'].get(
        f'{BASE}/balances/reconcile/',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
    )
    assert r.status_code == 200


# ---------------------------------------------------------------------------
# ProductStockPolicyViewSet
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_policy_list(ctx_lot):
    def _create_policy():
        ProductStockPolicy.all_objects.create(
            tenant=ctx_lot['tenant'],
            product=ctx_lot['product'],
            branch=ctx_lot['branch'],
            location=ctx_lot['location'],
        )

    _run_in_tenant(ctx_lot['tenant'], _create_policy)

    r = ctx_lot['client'].get(
        f'{BASE}/product-policies/',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
    )
    assert r.status_code == 200
    assert r.json()['count'] == 1


@pytest.mark.django_db
def test_policy_list_filter_product(ctx_lot):
    def _create_policy():
        ProductStockPolicy.all_objects.create(
            tenant=ctx_lot['tenant'],
            product=ctx_lot['product'],
            branch=ctx_lot['branch'],
            location=ctx_lot['location'],
        )

    _run_in_tenant(ctx_lot['tenant'], _create_policy)

    r = ctx_lot['client'].get(
        f'{BASE}/product-policies/?product={ctx_lot["product"].id}',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
    )
    assert r.status_code == 200


@pytest.mark.django_db
def test_policy_list_filter_branch(ctx_lot):
    def _create_policy():
        ProductStockPolicy.all_objects.create(
            tenant=ctx_lot['tenant'],
            product=ctx_lot['product'],
            branch=ctx_lot['branch'],
            location=ctx_lot['location'],
        )

    _run_in_tenant(ctx_lot['tenant'], _create_policy)

    r = ctx_lot['client'].get(
        f'{BASE}/product-policies/?branch={ctx_lot["branch"].id}',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
    )
    assert r.status_code == 200


@pytest.mark.django_db
def test_policy_list_filter_location(ctx_lot):
    def _create_policy():
        ProductStockPolicy.all_objects.create(
            tenant=ctx_lot['tenant'],
            product=ctx_lot['product'],
            branch=ctx_lot['branch'],
            location=ctx_lot['location'],
        )

    _run_in_tenant(ctx_lot['tenant'], _create_policy)

    r = ctx_lot['client'].get(
        f'{BASE}/product-policies/?location={ctx_lot["location"].id}',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
    )
    assert r.status_code == 200


@pytest.mark.django_db
def test_policy_patch_etag_match(ctx_lot):
    import json

    def _create_policy():
        return ProductStockPolicy.all_objects.create(
            tenant=ctx_lot['tenant'],
            product=ctx_lot['product'],
            branch=ctx_lot['branch'],
            location=ctx_lot['location'],
            minimum_quantity=Decimal('5'),
        )

    policy = _run_in_tenant(ctx_lot['tenant'], _create_policy)

    r = ctx_lot['client'].patch(
        f'{BASE}/product-policies/{policy.id}/',
        data=json.dumps({'minimum_quantity': '10.000000'}),
        content_type='application/json',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
        HTTP_IF_MATCH=str(policy.version),
    )
    assert r.status_code == 200
    assert r.json()['minimum_quantity'] == '10.000000'


@pytest.mark.django_db
def test_policy_patch_etag_mismatch(ctx_lot):
    import json

    def _create_policy():
        return ProductStockPolicy.all_objects.create(
            tenant=ctx_lot['tenant'],
            product=ctx_lot['product'],
            branch=ctx_lot['branch'],
            location=ctx_lot['location'],
        )

    policy = _run_in_tenant(ctx_lot['tenant'], _create_policy)

    r = ctx_lot['client'].patch(
        f'{BASE}/product-policies/{policy.id}/',
        data=json.dumps({'minimum_quantity': '10.000000'}),
        content_type='application/json',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
        HTTP_IF_MATCH='999',
    )
    assert r.status_code == 409


# ---------------------------------------------------------------------------
# ProductStockSummaryView
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_product_summary_no_filters(ctx_lot):
    def _create_policy():
        ProductStockPolicy.all_objects.create(
            tenant=ctx_lot['tenant'],
            product=ctx_lot['product'],
            branch=ctx_lot['branch'],
            location=ctx_lot['location'],
        )

    _run_in_tenant(ctx_lot['tenant'], _create_policy)

    r = ctx_lot['client'].get(
        f'{BASE}/product-summary/{ctx_lot["product"].id}/',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
    )
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 1


@pytest.mark.django_db
def test_product_summary_with_branch_filter(ctx_lot):
    def _create_policy():
        ProductStockPolicy.all_objects.create(
            tenant=ctx_lot['tenant'],
            product=ctx_lot['product'],
            branch=ctx_lot['branch'],
            location=ctx_lot['location'],
        )

    _run_in_tenant(ctx_lot['tenant'], _create_policy)

    r = ctx_lot['client'].get(
        f'{BASE}/product-summary/{ctx_lot["product"].id}/?branch={ctx_lot["branch"].id}',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
    )
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, dict)


@pytest.mark.django_db
def test_product_summary_no_policy_returns_null(ctx_lot):
    r = ctx_lot['client'].get(
        f'{BASE}/product-summary/{ctx_lot["product"].id}/?branch={uuid.uuid4()}',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
    )
    assert r.status_code == 200
    assert r.json() is None


# ---------------------------------------------------------------------------
# ProductStockControlDeactivateView
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_deactivate_stock_control(ctx_lot):
    def _create_policy():
        ProductStockPolicy.all_objects.create(
            tenant=ctx_lot['tenant'],
            product=ctx_lot['product'],
            branch=ctx_lot['branch'],
            location=ctx_lot['location'],
        )

    _run_in_tenant(ctx_lot['tenant'], _create_policy)

    cmd_id = str(uuid.uuid4())
    r = ctx_lot['client'].post(
        f'{BASE}/products/{ctx_lot["product"].id}/stock-control/deactivate/',
        {'command_id': cmd_id},
        format='json',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
    )
    assert r.status_code == 201
    body = r.json()
    assert body['action'] == 'deactivate'
    assert body['policy_updated'] >= 1


@pytest.mark.django_db
def test_deactivate_stock_control_replay(ctx_lot):
    def _create_policy():
        ProductStockPolicy.all_objects.create(
            tenant=ctx_lot['tenant'],
            product=ctx_lot['product'],
            branch=ctx_lot['branch'],
            location=ctx_lot['location'],
        )

    _run_in_tenant(ctx_lot['tenant'], _create_policy)

    cmd_id = str(uuid.uuid4())
    ctx_lot['client'].post(
        f'{BASE}/products/{ctx_lot["product"].id}/stock-control/deactivate/',
        {'command_id': cmd_id},
        format='json',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
    )
    r = ctx_lot['client'].post(
        f'{BASE}/products/{ctx_lot["product"].id}/stock-control/deactivate/',
        {'command_id': cmd_id},
        format='json',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
    )
    assert r.status_code == 201


@pytest.mark.django_db
def test_deactivate_stock_control_has_balance_error(ctx_lot):
    def _seed():
        ProductStockPolicy.all_objects.create(
            tenant=ctx_lot['tenant'],
            product=ctx_lot['product'],
            branch=ctx_lot['branch'],
            location=ctx_lot['location'],
        )
        _do_receipt(
            ctx_lot['tenant'],
            ctx_lot['branch'],
            ctx_lot['product'],
            ctx_lot['location'],
            Decimal('10'),
            ctx_lot['unit'],
            lot=ctx_lot['lot'],
            idempotency_key=f'deact-balance-{uuid.uuid4().hex[:8]}',
            actor=ctx_lot['user'],
        )

    _run_in_tenant(ctx_lot['tenant'], _seed)

    r = ctx_lot['client'].post(
        f'{BASE}/products/{ctx_lot["product"].id}/stock-control/deactivate/',
        {'command_id': str(uuid.uuid4())},
        format='json',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
    )
    assert r.status_code == 409
    assert 'STOCK_CONTROL_HAS_NONZERO_BALANCE' in r.json()['code']


@pytest.mark.django_db
def test_deactivate_stock_control_correlation_id(ctx_lot):
    def _create_policy():
        ProductStockPolicy.all_objects.create(
            tenant=ctx_lot['tenant'],
            product=ctx_lot['product'],
            branch=ctx_lot['branch'],
            location=ctx_lot['location'],
        )

    _run_in_tenant(ctx_lot['tenant'], _create_policy)

    corr = str(uuid.uuid4())
    r = ctx_lot['client'].post(
        f'{BASE}/products/{ctx_lot["product"].id}/stock-control/deactivate/',
        {'command_id': str(uuid.uuid4()), 'correlation_id': corr},
        format='json',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
    )
    assert r.status_code == 201
    assert r.json()['correlation_id'] == corr


# ---------------------------------------------------------------------------
# ProductStockControlReactivateView
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_reactivate_stock_control(ctx_lot):
    def _deactivate():
        ProductStockPolicy.all_objects.create(
            tenant=ctx_lot['tenant'],
            product=ctx_lot['product'],
            branch=ctx_lot['branch'],
            location=ctx_lot['location'],
            is_active=False,
        )

    _run_in_tenant(ctx_lot['tenant'], _deactivate)

    cmd_id = str(uuid.uuid4())
    r = ctx_lot['client'].post(
        f'{BASE}/products/{ctx_lot["product"].id}/stock-control/reactivate/',
        {'command_id': cmd_id},
        format='json',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
    )
    assert r.status_code == 201
    body = r.json()
    assert body['action'] == 'reactivate'
    assert body['policy_updated'] >= 1


@pytest.mark.django_db
def test_reactivate_stock_control_replay(ctx_lot):
    def _deactivate():
        ProductStockPolicy.all_objects.create(
            tenant=ctx_lot['tenant'],
            product=ctx_lot['product'],
            branch=ctx_lot['branch'],
            location=ctx_lot['location'],
            is_active=False,
        )

    _run_in_tenant(ctx_lot['tenant'], _deactivate)

    cmd_id = str(uuid.uuid4())
    ctx_lot['client'].post(
        f'{BASE}/products/{ctx_lot["product"].id}/stock-control/reactivate/',
        {'command_id': cmd_id},
        format='json',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
    )
    r = ctx_lot['client'].post(
        f'{BASE}/products/{ctx_lot["product"].id}/stock-control/reactivate/',
        {'command_id': cmd_id},
        format='json',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
    )
    assert r.status_code == 201


@pytest.mark.django_db
def test_reactivate_no_policies_error(ctx_lot):
    r = ctx_lot['client'].post(
        f'{BASE}/products/{ctx_lot["product"].id}/stock-control/reactivate/',
        {'command_id': str(uuid.uuid4())},
        format='json',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
    )
    assert r.status_code == 400
    assert 'STOCK_CONTROL_REACTIVATION_NOT_ALLOWED' in r.json()['code']


@pytest.mark.django_db
def test_reactivate_with_initial_stocks(ctx):
    def _deactivate():
        ProductStockPolicy.all_objects.create(
            tenant=ctx['tenant'],
            product=ctx['product'],
            branch=ctx['branch'],
            location=ctx['location'],
            is_active=False,
        )

    _run_in_tenant(ctx['tenant'], _deactivate)

    import json as _json

    cmd_id = str(uuid.uuid4())
    r = ctx['client'].post(
        f'{BASE}/products/{ctx["product"].id}/stock-control/reactivate/',
        data=_json.dumps(
            {
                'command_id': cmd_id,
                'initial_stocks': [
                    {
                        'location_id': str(ctx['location'].id),
                        'quantity': '10.000000',
                    },
                ],
            }
        ),
        content_type='application/json',
        HTTP_X_TENANT_ID=str(ctx['tenant'].id),
    )
    assert r.status_code in (200, 201)


@pytest.mark.django_db
def test_reactivate_correlation_id(ctx_lot):
    def _deactivate():
        ProductStockPolicy.all_objects.create(
            tenant=ctx_lot['tenant'],
            product=ctx_lot['product'],
            branch=ctx_lot['branch'],
            location=ctx_lot['location'],
            is_active=False,
        )

    _run_in_tenant(ctx_lot['tenant'], _deactivate)

    corr = str(uuid.uuid4())
    r = ctx_lot['client'].post(
        f'{BASE}/products/{ctx_lot["product"].id}/stock-control/reactivate/',
        {'command_id': str(uuid.uuid4()), 'correlation_id': corr},
        format='json',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
    )
    assert r.status_code in (200, 201)
    assert r.json()['correlation_id'] == corr


@pytest.mark.django_db
def test_reactivate_invalid_initial_stock_entry(ctx_lot):
    def _deactivate():
        ProductStockPolicy.all_objects.create(
            tenant=ctx_lot['tenant'],
            product=ctx_lot['product'],
            branch=ctx_lot['branch'],
            location=ctx_lot['location'],
            is_active=False,
        )

    _run_in_tenant(ctx_lot['tenant'], _deactivate)

    r = ctx_lot['client'].post(
        f'{BASE}/products/{ctx_lot["product"].id}/stock-control/reactivate/',
        {
            'command_id': str(uuid.uuid4()),
            'initial_stocks': ['not-a-dict'],
        },
        format='json',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
    )
    assert r.status_code == 400


@pytest.mark.django_db
def test_reactivate_invalid_location_in_initial_stock(ctx_lot):
    def _deactivate():
        ProductStockPolicy.all_objects.create(
            tenant=ctx_lot['tenant'],
            product=ctx_lot['product'],
            branch=ctx_lot['branch'],
            location=ctx_lot['location'],
            is_active=False,
        )

    _run_in_tenant(ctx_lot['tenant'], _deactivate)

    r = ctx_lot['client'].post(
        f'{BASE}/products/{ctx_lot["product"].id}/stock-control/reactivate/',
        {
            'command_id': str(uuid.uuid4()),
            'initial_stocks': [
                {'location_id': 'not-a-uuid', 'quantity': '5.000000'},
            ],
        },
        format='json',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
    )
    assert r.status_code == 400


@pytest.mark.django_db
def test_reactivate_invalid_quantity_in_initial_stock(ctx_lot):
    def _deactivate():
        ProductStockPolicy.all_objects.create(
            tenant=ctx_lot['tenant'],
            product=ctx_lot['product'],
            branch=ctx_lot['branch'],
            location=ctx_lot['location'],
            is_active=False,
        )

    _run_in_tenant(ctx_lot['tenant'], _deactivate)

    r = ctx_lot['client'].post(
        f'{BASE}/products/{ctx_lot["product"].id}/stock-control/reactivate/',
        {
            'command_id': str(uuid.uuid4()),
            'initial_stocks': [
                {'location_id': str(ctx_lot['location'].id), 'quantity': 'abc'},
            ],
        },
        format='json',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
    )
    assert r.status_code == 400


@pytest.mark.django_db
def test_reactivate_zero_quantity_in_initial_stock(ctx_lot):
    def _deactivate():
        ProductStockPolicy.all_objects.create(
            tenant=ctx_lot['tenant'],
            product=ctx_lot['product'],
            branch=ctx_lot['branch'],
            location=ctx_lot['location'],
            is_active=False,
        )

    _run_in_tenant(ctx_lot['tenant'], _deactivate)

    r = ctx_lot['client'].post(
        f'{BASE}/products/{ctx_lot["product"].id}/stock-control/reactivate/',
        {
            'command_id': str(uuid.uuid4()),
            'initial_stocks': [
                {'location_id': str(ctx_lot['location'].id), 'quantity': '0'},
            ],
        },
        format='json',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
    )
    assert r.status_code == 400


@pytest.mark.django_db
def test_reactivate_location_not_in_policies(ctx_lot):
    def _deactivate():
        ProductStockPolicy.all_objects.create(
            tenant=ctx_lot['tenant'],
            product=ctx_lot['product'],
            branch=ctx_lot['branch'],
            location=ctx_lot['location'],
            is_active=False,
        )

    _run_in_tenant(ctx_lot['tenant'], _deactivate)

    r = ctx_lot['client'].post(
        f'{BASE}/products/{ctx_lot["product"].id}/stock-control/reactivate/',
        {
            'command_id': str(uuid.uuid4()),
            'initial_stocks': [
                {'location_id': str(uuid.uuid4()), 'quantity': '5.000000'},
            ],
        },
        format='json',
        HTTP_X_TENANT_ID=str(ctx_lot['tenant'].id),
    )
    assert r.status_code == 400
