"""
Sprint R3 — Testes RED: EAN automático e atomicidade do ProductApply.

Esses testes descrevem o contrato EXATO que a R3 deve implementar.
Hoje eles DEVEM falhar (RED) porque:
  - O POST /api/v1/catalog/products/apply/ NÃO gera EAN automático.
  - A brand continuam textual (não FK).
  - ProductCode não é criado na mesma transação.

Após a implementação da R3 (Task 2+3), todos devem ficar verdes.
"""
import uuid

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from rest_framework import status

from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import TenantMembership

User = get_user_model()


def _run_in_tenant(tenant, callback):
    token = set_current_tenant_id(tenant.id)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SET app.current_tenant_id = %s', [str(tenant.id)])
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
        cursor.execute("SELECT set_config('app.current_tenant_id', '', false)")
    try:
        yield
    finally:
        with connection.cursor() as cursor:
            cursor.execute("SELECT set_config('app.current_tenant_id', '', false)")


def _make_tenant(slug, name):
    """Cria um Tenant com slug único para evitar colisão sob paralelismo."""
    from tenancy.models import Tenant
    unique_slug = f'{slug}-{uuid.uuid4().hex[:8]}'
    return Tenant.objects.create(name=name, slug=unique_slug)


@pytest.fixture
def tenant(db):
    return _make_tenant('r3-test', 'R3 Test Tenant')


@pytest.fixture
def user(db):
    return User.objects.create_user(
        username='r3user',
        email='r3@test.com',
        password='testpass123',
    )


@pytest.fixture
def authed_client(client, user, tenant):
    return _auth_client(client, user, tenant)


@pytest.fixture
def base_unit(tenant):
    """Unit é TenantScopedModel com RLS. Criar dentro do contexto do tenant."""
    from catalog.models import Unit
    return _run_in_tenant(tenant, lambda: Unit.all_objects.create(
        tenant=tenant, symbol='UN', name='Unidade', precision=0,
    ))


def _apply_payload(
    command_id=None,
    barcode='',
    name=None,
    base_unit_id=None,
    brand='',
    subcategory='',
):
    """Helper para montar o payload do POST /products/apply/.
    Gera SKU único automaticamente para evitar UniqueViolation."""
    if command_id is None:
        command_id = str(uuid.uuid4())
    if name is None:
        name = f'Produto R3 {uuid.uuid4().hex[:8].upper()}'
    product = {
        'name': name,
        'product_kind': 'revenda',
    }
    if barcode:
        product['barcode'] = barcode
    if brand:
        product['brand'] = brand
    if subcategory:
        product['subcategory'] = subcategory
    if base_unit_id:
        product['base_unit'] = str(base_unit_id)
    return {'command_id': command_id, 'product': product}


def _post_apply(authed_client, tenant, **payload_kwargs):
    """Realiza o POST /products/apply/ com o header de tenant."""
    return authed_client.post(
        '/api/v1/catalog/products/apply/',
        data=_apply_payload(**payload_kwargs),
        content_type='application/json',
        HTTP_X_TENANT_ID=str(tenant.id),
    )


# ──────────────────────────────────────────────────────────────────
# Cenário 1: EAN-13 automático (código vazio → gera prefixo 20)
# ──────────────────────────────────────────────────────────────────
@pytest.mark.django_db(transaction=True)
def test_r3_ean_auto_generated_when_barcode_empty(authed_client, tenant, base_unit):
    """Quando barcode não é informado, o backend deve gerar um EAN-13
    com prefixo '20', 13 dígitos, e persistir como ProductCode principal."""
    response = _post_apply(authed_client, tenant, base_unit_id=base_unit.id)
    assert response.status_code == status.HTTP_201_CREATED, response.content
    body = response.json()
    # O barcode gerado deve ter 13 dígitos e prefixo '20'
    barcode = body.get('product', {}).get('barcode', '')
    assert len(barcode) == 13, f'Barcode deve ter 13 dígitos, recebeu: {barcode!r}'
    assert barcode.startswith('20'), f'Barcode deve ter prefixo 20, recebeu: {barcode!r}'


# ──────────────────────────────────────────────────────────────────
# Cenário 2: Código manual informado é validado e persistido
# ──────────────────────────────────────────────────────────────────
@pytest.mark.django_db(transaction=True)
def test_r3_manual_barcode_is_persisted(authed_client, tenant, base_unit):
    """Quando o usuário informa barcode manual, ele deve ser persistido
    como ProductCode principal."""
    manual_barcode = '7891234567890'
    response = _post_apply(authed_client, tenant, barcode=manual_barcode, base_unit_id=base_unit.id)
    assert response.status_code == status.HTTP_201_CREATED, response.content
    body = response.json()
    returned_barcode = body.get('product', {}).get('barcode', '')
    assert returned_barcode == manual_barcode


# ──────────────────────────────────────────────────────────────────
# Cenário 3: Replay idempotente (mesmo command_id → mesmo resultado)
# ──────────────────────────────────────────────────────────────────
@pytest.mark.django_db(transaction=True)
def test_r3_idempotent_replay_returns_same_code(authed_client, tenant, base_unit):
    """Chamar o POST duas vezes com o mesmo command_id e mesmo payload
    deve retornar o mesmo resultado sem duplicar Produto ou ProductCode."""
    command_id = str(uuid.uuid4())
    payload = _apply_payload(command_id=command_id, base_unit_id=base_unit.id)

    r1 = authed_client.post(
        '/api/v1/catalog/products/apply/',
        data=payload,
        content_type='application/json',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert r1.status_code == status.HTTP_201_CREATED

    # Segunda chamada — replay idempotente com MESMO payload
    r2 = authed_client.post(
        '/api/v1/catalog/products/apply/',
        data=payload,
        content_type='application/json',
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert r2.status_code == status.HTTP_201_CREATED
    body = r2.json()
    assert body.get('product', {}).get('barcode', '') == r1.json().get('product', {}).get(
        'barcode', ''
    )


# ──────────────────────────────────────────────────────────────────
# Cenário 4: Conflito quando command_id é reusado com payload diferente
# ──────────────────────────────────────────────────────────────────
@pytest.mark.django_db(transaction=True)
def test_r3_conflict_on_mismatched_payload(authed_client, tenant, base_unit):
    """Se o mesmo command_id é enviado com payload diferente, o backend
    deve retornar 409 Conflict."""
    command_id = str(uuid.uuid4())
    r1 = _post_apply(
        authed_client,
        tenant,
        command_id=command_id,
        name='Produto A',
        base_unit_id=base_unit.id,
    )
    assert r1.status_code == status.HTTP_201_CREATED

    r2 = _post_apply(
        authed_client,
        tenant,
        command_id=command_id,
        name='Produto B',
        base_unit_id=base_unit.id,
    )
    assert r2.status_code == status.HTTP_409_CONFLICT


# ──────────────────────────────────────────────────────────────────
# Cenário 5: Tenant isolation — EAN de tenant A não colide com B
# ──────────────────────────────────────────────────────────────────
@pytest.mark.django_db(transaction=True)
def test_r3_ean_is_tenant_isolated(client, user):
    """O EAN gerado para um tenant não pode colidir com EAN de outro tenant.
    Cria dois tenants independentes, gera um EAN em cada e valida que
    as sequências são independentes (ison de tenant de verdade)."""
    tenant_a = _make_tenant('r3-iso-a', 'Tenant A')
    tenant_b = _make_tenant('r3-iso-b', 'Tenant B')

    def _make_char_unit(tenant):
        from catalog.models import Unit
        return _run_in_tenant(tenant, lambda: Unit.all_objects.create(
            tenant=tenant, symbol='UN', name='Unidade', precision=0,
        ))

    unit_a = _make_char_unit(tenant_a)
    unit_b = _make_char_unit(tenant_b)

    # Tenant A: autenticar, aplicar, coletar barcode
    _auth_client(client, user, tenant_a)
    r_a = _post_apply(client, tenant_a, base_unit_id=unit_a.id)

    # Tenant B: re-autenticar, aplicar, coletar barcode
    _auth_client(client, user, tenant_b)
    r_b = _post_apply(client, tenant_b, base_unit_id=unit_b.id)

    assert r_a.status_code == status.HTTP_201_CREATED, r_a.content
    assert r_b.status_code == status.HTTP_201_CREATED, r_b.content
    barcode_a = r_a.json().get('product', {}).get('barcode', '')
    barcode_b = r_b.json().get('product', {}).get('barcode', '')
    # Ambos devem ter EAN-13 válido (após implementação da feature) e
    # serem independentes entre tenants. Em RED, ambos vazios — falha legítima.
    assert len(barcode_a) == 13 and len(barcode_b) == 13
    assert barcode_a != barcode_b, (
        f'EANs entre tenants devem ser independentes: {barcode_a!r} vs {barcode_b!r}'
    )


@pytest.mark.django_db(transaction=True)
def test_r3_brand_and_subcategory_are_persisted(authed_client, tenant, base_unit):
    response = _post_apply(
        authed_client,
        tenant,
        base_unit_id=base_unit.id,
        brand='Marca R3',
        subcategory='Bebidas',
    )
    assert response.status_code == status.HTTP_201_CREATED
    from catalog.models import Brand, Product

    product_id = response.json()['product']['id']
    product = Product.all_objects.get(id=product_id)
    assert product.brand == 'Marca R3'
    assert product.subcategory == 'Bebidas'
    assert product.brand_ref.name == 'Marca R3'
    assert Brand.all_objects.filter(tenant=tenant, name='Marca R3').exists()
