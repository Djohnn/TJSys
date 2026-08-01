"""Sprint 23 — unit tests for ProductComposition model."""

from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError
from django.db import connection

from catalog.models import Product, ProductComposition, Unit
from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Tenant


@pytest.mark.django_db
def test_composition_positive_quantity():
    tenant = Tenant.objects.create(name='S23', slug='s23-comp')
    token = set_current_tenant_id(tenant.id)
    with connection.cursor() as c:
        c.execute('SET app.current_tenant_id = %s', [str(tenant.id)])
    unit = Unit.objects.create(tenant=tenant, symbol='UN', name='Un')
    kit = Product.objects.create(
        tenant=tenant, sku='KIT', name='Kit', base_unit=unit, product_kind='kit'
    )
    comp = Product.objects.create(tenant=tenant, sku='COMP', name='Comp', base_unit=unit)
    reset_current_tenant_id(token)
    with pytest.raises(ValidationError):
        pc = ProductComposition(tenant=tenant, kit=kit, component=comp, quantity=Decimal('0'))
        pc.full_clean()


@pytest.mark.django_db
def test_self_reference_blocked():
    tenant = Tenant.objects.create(name='S23b', slug='s23b')
    token = set_current_tenant_id(tenant.id)
    with connection.cursor() as c:
        c.execute('SET app.current_tenant_id = %s', [str(tenant.id)])
    unit = Unit.objects.create(tenant=tenant, symbol='UN', name='Un')
    kit = Product.objects.create(
        tenant=tenant, sku='SELF', name='SelfKit', base_unit=unit, product_kind='kit'
    )
    reset_current_tenant_id(token)
    with pytest.raises(ValidationError):
        pc = ProductComposition(tenant=tenant, kit=kit, component=kit, quantity=Decimal('1'))
        pc.full_clean()


@pytest.mark.django_db
def test_component_cannot_be_kit():
    tenant = Tenant.objects.create(name='S23c', slug='s23c')
    token = set_current_tenant_id(tenant.id)
    with connection.cursor() as c:
        c.execute('SET app.current_tenant_id = %s', [str(tenant.id)])
    unit = Unit.objects.create(tenant=tenant, symbol='UN', name='Un')
    kit1 = Product.objects.create(
        tenant=tenant, sku='K1', name='K1', base_unit=unit, product_kind='kit'
    )
    kit2 = Product.objects.create(
        tenant=tenant, sku='K2', name='K2', base_unit=unit, product_kind='kit'
    )
    reset_current_tenant_id(token)
    with pytest.raises(ValidationError):
        pc = ProductComposition(tenant=tenant, kit=kit1, component=kit2, quantity=Decimal('1'))
        pc.full_clean()


@pytest.mark.django_db
def test_valid_composition_created():
    tenant = Tenant.objects.create(name='S23d', slug='s23d')
    token = set_current_tenant_id(tenant.id)
    with connection.cursor() as c:
        c.execute('SET app.current_tenant_id = %s', [str(tenant.id)])
    unit = Unit.objects.create(tenant=tenant, symbol='UN', name='Un')
    kit = Product.objects.create(
        tenant=tenant, sku='VKIT', name='ValidKit', base_unit=unit, product_kind='kit'
    )
    comp = Product.objects.create(tenant=tenant, sku='VCOMP', name='ValidComp', base_unit=unit)
    reset_current_tenant_id(token)
    pc = ProductComposition(tenant=tenant, kit=kit, component=comp, quantity=Decimal('3'))
    pc.full_clean()
    pc.save()
    assert pc.quantity == Decimal('3')
