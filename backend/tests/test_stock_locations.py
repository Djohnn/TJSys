import contextlib

import pytest
from django.db import connection, transaction

from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Branch, Company, Tenant


@contextlib.contextmanager
def pg_tenant_context(tenant):
    token = set_current_tenant_id(tenant.id)
    with transaction.atomic():
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT set_config('app.current_tenant_id', %s, true)",
                [str(tenant.id)],
            )
        try:
            yield
        finally:
            reset_current_tenant_id(token)


@pytest.fixture
def inv_tenant():
    return Tenant.objects.create(name='Inv', slug='inv-test')


@pytest.fixture
def inv_unit(inv_tenant):
    from catalog.models import Unit

    return _create_in_tenant(
        inv_tenant,
        lambda: Unit.all_objects.create(
            tenant=inv_tenant,
            symbol='kg',
            name='Kg',
            precision=3,
        ),
    )


@pytest.fixture
def inv_product(inv_tenant, inv_unit):
    from catalog.models import Product

    return _create_in_tenant(
        inv_tenant,
        lambda: Product.all_objects.create(
            tenant=inv_tenant,
            sku='INV-001',
            name='Produto Inv',
            base_unit=inv_unit,
        ),
    )


@pytest.fixture
def inv_company(inv_tenant):
    return _create_in_tenant(
        inv_tenant,
        lambda: Company.objects.create(
            tenant=inv_tenant,
            name='InvCo',
        ),
    )


@pytest.fixture
def inv_branch(inv_company, inv_tenant):
    return _create_in_tenant(
        inv_tenant,
        lambda: Branch.objects.create(
            company=inv_company,
            tenant=inv_tenant,
            name='InvBranch',
        ),
    )


def _create_in_tenant(tenant, callback):
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


@pytest.mark.django_db
def test_branch_has_exactly_one_primary_stock_location(inv_branch, inv_tenant):
    from inventory.models import StockLocation

    with pg_tenant_context(inv_tenant):
        loc1 = StockLocation.objects.create(
            tenant=inv_tenant,
            branch=inv_branch,
            code='LOC-01',
            name='Local 1',
            is_primary=True,
            is_active=True,
        )
        loc2 = StockLocation.objects.create(
            tenant=inv_tenant,
            branch=inv_branch,
            code='LOC-02',
            name='Local 2',
            is_primary=True,
            is_active=True,
        )

    loc1.refresh_from_db()
    loc2.refresh_from_db()
    assert loc2.is_primary is True
    assert loc1.is_primary is False
    assert (
        StockLocation.all_objects.filter(
            branch=inv_branch,
            is_primary=True,
            is_active=True,
        ).count()
        == 1
    )


@pytest.mark.django_db
def test_stock_location_code_unique_per_branch(inv_branch, inv_tenant):

    from inventory.models import StockLocation

    with pg_tenant_context(inv_tenant):
        StockLocation.objects.create(
            tenant=inv_tenant,
            branch=inv_branch,
            code='UNIQ',
            name='Local A',
        )
        with pytest.raises(Exception):
            StockLocation.objects.create(
                tenant=inv_tenant,
                branch=inv_branch,
                code='UNIQ',
                name='Local B',
            )


@pytest.mark.django_db
def test_stock_location_inactivation_preserves_record(inv_branch, inv_tenant):
    from inventory.models import StockLocation

    with pg_tenant_context(inv_tenant):
        loc = StockLocation.objects.create(
            tenant=inv_tenant,
            branch=inv_branch,
            code='INAT',
            name='Inativar',
        )
        loc.is_active = False
        loc.save()
    assert StockLocation.all_objects.filter(pk=loc.pk, is_active=False).exists()
