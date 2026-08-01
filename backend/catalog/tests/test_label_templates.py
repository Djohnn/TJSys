"""Sprint 28 — tests for LabelTemplate model and CRUD."""

from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError
from django.db import connection

from catalog.models import LabelTemplate
from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Tenant


@pytest.fixture
def tenant():
    t = Tenant.objects.create(name='Label Test', slug='label-test')
    yield t
    t.delete()


def _in_tenant(tenant, fn):
    token = set_current_tenant_id(tenant.id)
    with connection.cursor() as cursor:
        cursor.execute('SET app.current_tenant_id = %s', [str(tenant.id)])
    result = fn()
    reset_current_tenant_id(token)
    return result


@pytest.mark.django_db
def test_label_template_create_defaults(tenant):
    template = _in_tenant(
        tenant,
        lambda: LabelTemplate.objects.create(
            tenant=tenant,
            name='Padrao',
            width_mm=Decimal('50.00'),
            height_mm=Decimal('30.00'),
        ),
    )
    assert template.columns == 2
    assert template.rows == 5
    assert template.margin_mm == Decimal('2.00')
    assert template.show_sku is True
    assert template.show_barcode is True
    assert template.show_price is True
    assert template.show_name is True
    assert template.is_active is True
    assert template.version == 1


@pytest.mark.django_db
def test_label_template_ordering(tenant):
    def _create():
        LabelTemplate.objects.create(
            tenant=tenant,
            name='B',
            width_mm=Decimal('60'),
            height_mm=Decimal('40'),
        )
        LabelTemplate.objects.create(
            tenant=tenant,
            name='A',
            width_mm=Decimal('50'),
            height_mm=Decimal('30'),
        )
        return list(LabelTemplate.objects.filter(tenant=tenant).values_list('name', flat=True))

    names = _in_tenant(tenant, _create)
    assert names == ['A', 'B']


@pytest.mark.django_db
def test_label_template_tenant_scoped(tenant):
    _in_tenant(
        tenant,
        lambda: LabelTemplate.objects.create(
            tenant=tenant,
            name='Etiqueta X',
            width_mm=Decimal('40'),
            height_mm=Decimal('20'),
        ),
    )
    t2 = Tenant.objects.create(name='Other', slug='other')
    qs = LabelTemplate.objects.filter(tenant=t2)
    assert qs.count() == 0
    t2.delete()


@pytest.mark.django_db
def test_label_template_width_positive(tenant):
    tpl = LabelTemplate(tenant=tenant, name='Neg', width_mm=Decimal('-1'), height_mm=Decimal('10'))
    with pytest.raises(ValidationError):
        tpl.full_clean()


@pytest.mark.django_db
def test_label_template_height_positive(tenant):
    tpl = LabelTemplate(tenant=tenant, name='Neg', width_mm=Decimal('10'), height_mm=Decimal('0'))
    with pytest.raises(ValidationError):
        tpl.full_clean()


@pytest.mark.django_db
def test_label_template_decimal_precision(tenant):
    tpl = _in_tenant(
        tenant,
        lambda: LabelTemplate.objects.create(
            tenant=tenant,
            name='Precision',
            width_mm=Decimal('66.6'),
            height_mm=Decimal('33.3'),
        ),
    )
    assert tpl.width_mm == Decimal('66.60')
    assert tpl.height_mm == Decimal('33.30')


@pytest.mark.django_db
def test_label_template_str(tenant):
    tpl = _in_tenant(
        tenant,
        lambda: LabelTemplate.objects.create(
            tenant=tenant,
            name='Principal',
            width_mm=Decimal('50'),
            height_mm=Decimal('30'),
        ),
    )
    assert str(tpl) == f'Principal [{tenant.name}]'
