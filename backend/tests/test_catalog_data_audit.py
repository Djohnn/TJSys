"""Sprint 30 — BDD tests for the read-only catalog reconciliation audit."""

from io import StringIO

import pytest
from django.core.management import CommandError, call_command
from django.db import connection

from catalog.models import Product, ProductImage, Unit
from tenancy.models import Tenant


@pytest.fixture
def catalog_tenant():
    return Tenant.objects.create(name='Catalog audit', slug='catalog-audit')


def _activate_tenant(tenant):
    with connection.cursor() as cursor:
        cursor.execute(
            'SELECT set_config(%s, %s, false)',
            ['app.current_tenant_id', str(tenant.id)],
        )


@pytest.mark.django_db
def test_catalog_audit_returns_success_for_consistent_data(catalog_tenant):
    output = StringIO()
    call_command('audit_catalog_sprints_23_29', stdout=output)
    assert 'inconsistencies=0' in output.getvalue()


@pytest.mark.django_db
def test_catalog_audit_fails_for_multiple_primary_images(catalog_tenant):
    _activate_tenant(catalog_tenant)
    unit = Unit.all_objects.create(tenant=catalog_tenant, symbol='AU', name='Audit unit')
    product = Product.all_objects.create(
        tenant=catalog_tenant,
        sku='AUDIT-1',
        name='Audit product',
        base_unit=unit,
    )
    ProductImage.all_objects.create(
        tenant=catalog_tenant, product=product, object_key='one.png', is_primary=True
    )
    ProductImage.all_objects.create(
        tenant=catalog_tenant, product=product, object_key='two.png', is_primary=True
    )

    with pytest.raises(CommandError, match='multiple_primary_images'):
        call_command('audit_catalog_sprints_23_29')
