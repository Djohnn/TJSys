from pathlib import Path

import pytest
from django.contrib.auth import get_user_model
from django.db import connection

from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Branch, Company, Tenant, TenantMembership

User = get_user_model()


@pytest.fixture(scope='session')
def django_db_setup(django_db_blocker):
    """Use the pre-provisioned PostgreSQL test database.

    The project uses separate runtime and migration owners. Letting
    pytest-django create/drop the database locally goes through Django's
    administrative _nodb connection path and hangs in this Windows/Postgres
    setup. Migrations are applied explicitly with config.settings.migration.
    """
    import psycopg
    from decouple import Config, RepositoryEnv, config
    from django.conf import settings
    from django.core.management import call_command
    from psycopg import sql

    test_name = settings.DATABASES['default'].get('TEST', {}).get('NAME')
    if test_name:
        settings.DATABASES['default']['NAME'] = test_name
    database = settings.DATABASES['default']
    runtime_user = database['USER']
    env_path = Path(__file__).resolve().parents[2] / '.env'
    env_config = Config(RepositoryEnv(str(env_path))) if env_path.exists() else config
    owner_user = env_config('POSTGRES_USER', default='zyrp')
    owner_password = env_config('POSTGRES_PASSWORD', default='zyrp')
    conn = psycopg.connect(
        dbname=database['NAME'],
        user=owner_user,
        password=owner_password,
        host=database['HOST'],
        port=database['PORT'],
        connect_timeout=5,
    )
    if not (database['NAME'].startswith('test_') or database['NAME'].endswith('_test')):
        raise RuntimeError(f'Refusing to reset non-test database schema: {database["NAME"]}')

    with conn.cursor() as cursor:
        cursor.execute('DROP SCHEMA IF EXISTS public CASCADE')
        cursor.execute('CREATE SCHEMA public')
        cursor.execute(
            sql.SQL('GRANT USAGE, CREATE ON SCHEMA public TO {}').format(
                sql.Identifier(runtime_user),
            )
        )
        cursor.execute(
            sql.SQL('GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO {}').format(
                sql.Identifier(runtime_user)
            )
        )
        cursor.execute(
            sql.SQL('GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO {}').format(
                sql.Identifier(runtime_user)
            )
        )
    conn.commit()
    conn.close()
    with django_db_blocker.unblock():
        call_command('migrate', verbosity=0, interactive=False)


def _run_in_tenant(tenant, callback):
    token = set_current_tenant_id(tenant.id)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SET app.current_tenant_id = %s', [str(tenant.id)])
        return callback()
    finally:
        reset_current_tenant_id(token)


@pytest.fixture
def tenant_alpha():
    t, _ = Tenant.objects.get_or_create(
        slug='test-alpha',
        defaults={'name': 'Test Alpha'},
    )
    return t


@pytest.fixture
def tenant_beta():
    t, _ = Tenant.objects.get_or_create(
        slug='test-beta',
        defaults={'name': 'Test Beta'},
    )
    return t


@pytest.fixture
def user_alpha(tenant_alpha):
    u, _ = User.objects.get_or_create(email='user-alpha@test.local')
    u.set_password('pass123')
    u.save()
    TenantMembership.objects.get_or_create(
        user=u,
        tenant=tenant_alpha,
        defaults={'role': 'admin'},
    )
    return u


@pytest.fixture
def user_beta(tenant_beta):
    u, _ = User.objects.get_or_create(email='user-beta@test.local')
    u.set_password('pass123')
    u.save()
    TenantMembership.objects.get_or_create(
        user=u,
        tenant=tenant_beta,
        defaults={'role': 'admin'},
    )
    return u


@pytest.fixture
def company_alpha(tenant_alpha):
    return _run_in_tenant(
        tenant_alpha,
        lambda: Company.objects.get_or_create(
            tenant=tenant_alpha,
            name='Alpha Company',
        )[0],
    )


@pytest.fixture
def company_beta(tenant_beta):
    return _run_in_tenant(
        tenant_beta,
        lambda: Company.objects.get_or_create(
            tenant=tenant_beta,
            name='Beta Company',
        )[0],
    )


@pytest.fixture
def branch_alpha(company_alpha, tenant_alpha):
    return _run_in_tenant(
        tenant_alpha,
        lambda: Branch.objects.get_or_create(
            company=company_alpha,
            tenant=tenant_alpha,
            name='Alpha Branch',
        )[0],
    )


@pytest.fixture
def branch_beta(company_beta, tenant_beta):
    return _run_in_tenant(
        tenant_beta,
        lambda: Branch.objects.get_or_create(
            company=company_beta,
            tenant=tenant_beta,
            name='Beta Branch',
        )[0],
    )


# ==================== INVENTORY FIXTURES ====================


@pytest.fixture
def inv_tenant():
    return Tenant.objects.get_or_create(name='Inv', slug='inv-test')[0]


@pytest.fixture
def inv_unit(inv_tenant):
    from catalog.models import Unit

    return _run_in_tenant(
        inv_tenant,
        lambda: Unit.all_objects.get_or_create(
            tenant=inv_tenant,
            symbol='kg',
            defaults={'name': 'Quilograma', 'precision': 3},
        )[0],
    )


@pytest.fixture
def inv_unit_un(inv_tenant):
    from catalog.models import Unit

    return _run_in_tenant(
        inv_tenant,
        lambda: Unit.all_objects.get_or_create(
            tenant=inv_tenant,
            symbol='un',
            defaults={'name': 'Un', 'precision': 0},
        )[0],
    )


@pytest.fixture
def inv_product(inv_tenant, inv_unit):
    from catalog.models import Product

    return _run_in_tenant(
        inv_tenant,
        lambda: Product.all_objects.get_or_create(
            tenant=inv_tenant,
            sku='INV-001',
            defaults={
                'name': 'Produto Inv',
                'base_unit': inv_unit,
                'requires_lot': True,
                'requires_expiry': True,
            },
        )[0],
    )


@pytest.fixture
def inv_company(inv_tenant):
    return _run_in_tenant(
        inv_tenant,
        lambda: Company.objects.get_or_create(tenant=inv_tenant, name='InvCo')[0],
    )


@pytest.fixture
def inv_branch(inv_company, inv_tenant):
    return _run_in_tenant(
        inv_tenant,
        lambda: Branch.objects.get_or_create(
            company=inv_company,
            tenant=inv_tenant,
            name='InvBranch',
        )[0],
    )


@pytest.fixture
def sale_context(django_user_model):
    from decimal import Decimal

    from django.utils import timezone

    from catalog.models import Product, ProductPrice, Unit
    from inventory.models import StockLocation
    from inventory.services import create_receipt
    from sales.services import create_counter_sale, open_cash_session

    tenant = Tenant.objects.create(name='Sale Tenant', slug='sale-ctx')
    user = django_user_model.objects.create_user(
        email='sale-ctx@test.local',
        password='pass123',
    )
    TenantMembership.objects.create(user=user, tenant=tenant, role='admin', is_active=True)

    def _create():
        unit = Unit.all_objects.create(tenant=tenant, symbol='UN', name='Unidade')
        product = Product.all_objects.create(
            tenant=tenant,
            sku='SALE-CTX',
            name='Produto Venda',
            base_unit=unit,
        )
        ProductPrice.all_objects.create(
            tenant=tenant,
            product=product,
            amount=Decimal('10.00'),
            valid_from=timezone.now(),
        )
        company = Company.all_objects.create(tenant=tenant, name='Empresa Venda')
        branch = Branch.all_objects.create(
            tenant=tenant,
            company=company,
            name='Filial Venda',
        )
        location = StockLocation.all_objects.create(
            tenant=tenant,
            branch=branch,
            code='BALCAO',
            name='Balcao',
            is_primary=True,
        )
        create_receipt(
            tenant,
            branch,
            product,
            location,
            Decimal('5'),
            unit,
            Decimal('1'),
            idempotency_key='sale-ctx-stock',
            actor=user,
            reason='seed sale ctx stock',
        )
        open_cash_session(
            tenant=tenant,
            branch=branch,
            operator=user,
            opening_amount=Decimal('50.00'),
            idempotency_key='sale-ctx-cash-open',
        )
        sale = create_counter_sale(
            tenant=tenant,
            branch=branch,
            operator=user,
            stock_location=location,
            items=[
                {
                    'product': product,
                    'unit': unit,
                    'quantity': Decimal('2'),
                    'factor': Decimal('1'),
                }
            ],
            payments=[{'method': 'cash', 'amount': Decimal('20.00')}],
            idempotency_key='sale-ctx-sale',
        )
        return {
            'tenant': tenant,
            'user': user,
            'unit': unit,
            'product': product,
            'branch': branch,
            'location': location,
            'sale': sale,
        }

    return _run_in_tenant(tenant, _create)


@pytest.fixture
def fiscal_sale_context(django_user_model):
    from decimal import Decimal

    from django.utils import timezone

    from catalog.models import Product, ProductPrice, Unit
    from fiscal.models import FiscalEmitter
    from inventory.models import StockLocation
    from inventory.services import create_receipt
    from sales.services import create_counter_sale, open_cash_session

    tenant = Tenant.objects.create(name='Fiscal Shared Tenant', slug='fiscal-shared')
    user = django_user_model.objects.create_user(
        email='fiscal-shared@test.local',
        password='pass123',
    )
    TenantMembership.objects.create(user=user, tenant=tenant, role='admin', is_active=True)

    def _create():
        unit = Unit.all_objects.create(tenant=tenant, symbol='UN', name='Unidade')
        product = Product.all_objects.create(
            tenant=tenant,
            sku='FISCAL-SHARED',
            name='Produto Fiscal',
            base_unit=unit,
            ncm='12345678',
        )
        ProductPrice.all_objects.create(
            tenant=tenant,
            product=product,
            amount=Decimal('10.00'),
            valid_from=timezone.now(),
        )
        company = Company.all_objects.create(
            tenant=tenant,
            name='Empresa Fiscal',
            cnpj='12345678000199',
        )
        branch = Branch.all_objects.create(
            tenant=tenant,
            company=company,
            name='Filial Fiscal',
        )
        FiscalEmitter.all_objects.create(
            tenant=tenant,
            branch=branch,
            provider=FiscalEmitter.PROVIDER_PLUGNOTAS,
            cpf_cnpj='12345678000199',
            registered_at_provider=True,
        )
        location = StockLocation.all_objects.create(
            tenant=tenant,
            branch=branch,
            code='FISCAL',
            name='Fiscal',
            is_primary=True,
        )
        create_receipt(
            tenant,
            branch,
            product,
            location,
            Decimal('5'),
            unit,
            Decimal('1'),
            idempotency_key='fiscal-shared-stock',
            actor=user,
            reason='seed fiscal stock',
        )
        open_cash_session(
            tenant=tenant,
            branch=branch,
            operator=user,
            opening_amount=Decimal('0'),
            idempotency_key='fiscal-shared-cash-open',
        )
        sale = create_counter_sale(
            tenant=tenant,
            branch=branch,
            operator=user,
            stock_location=location,
            items=[
                {
                    'product': product,
                    'unit': unit,
                    'quantity': Decimal('1'),
                    'factor': Decimal('1'),
                }
            ],
            payments=[{'method': 'cash', 'amount': Decimal('10.00')}],
            idempotency_key='fiscal-shared-sale',
        )
        return {
            'tenant': tenant,
            'user': user,
            'unit': unit,
            'product': product,
            'branch': branch,
            'sale': sale,
        }

    return _run_in_tenant(tenant, _create)
