"""Tests for catalog models, inventory/kit_decomposition, fiscal views/ocr,
and catalog/services/product_extensions — covering remaining coverage gaps."""
import contextlib
import uuid
from decimal import Decimal
from unittest.mock import MagicMock

import pytest
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import connection
from django.utils import timezone
from rest_framework.request import Request as DRFRequest
from rest_framework.test import APIRequestFactory

from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Branch, Company, Tenant

User = get_user_model()


def _wrap_drf(wsgi_request, tenant=None, user=None, data=None):
    """Wrap a WSGIRequest into a DRF Request so query_params/data work."""
    drf = DRFRequest(wsgi_request)
    if tenant is not None:
        drf.tenant = tenant
    if user is not None:
        drf.user = user
    if data is not None:
        drf._full_data = data
    return drf


def _run_in_tenant(tenant, callback):
    token = set_current_tenant_id(tenant.id)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SET app.current_tenant_id = %s', [str(tenant.id)])
        return callback()
    finally:
        reset_current_tenant_id(token)


@contextlib.contextmanager
def pg_tenant_context(tenant):
    token = set_current_tenant_id(tenant.id)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT set_config('app.current_tenant_id', %s, true)",
                [str(tenant.id)],
            )
        yield
    finally:
        reset_current_tenant_id(token)


def _make_tenant(name, slug):
    return Tenant.objects.get_or_create(name=name, slug=slug)[0]


def _make_branch(tenant):
    def _create():
        company = Company.all_objects.get_or_create(
            tenant=tenant, name=f'{tenant.name} Co'
        )[0]
        return Branch.all_objects.get_or_create(
            company=company, tenant=tenant, name=f'{tenant.name} Branch'
        )[0]
    return _run_in_tenant(tenant, _create)


# =============================================================================
# CATALOG MODELS
# =============================================================================


@pytest.mark.django_db
class TestUnitModel:
    def test_str(self):
        t = _make_tenant('UT', 'ut-unit')
        from catalog.models import Unit
        with pg_tenant_context(t):
            u = Unit.all_objects.create(tenant=t, symbol='kg', name='Quilo', precision=2)
            s = str(u)
            assert 'KG' in s or 'kg' in s
            assert t.name in s

    def test_save_strips_and_uppercases(self):
        t = _make_tenant('UT2', 'ut2-unit')
        from catalog.models import Unit
        with pg_tenant_context(t):
            u = Unit.all_objects.create(tenant=t, symbol='  lb  ', name='Libra')
            assert u.symbol == 'LB'

    def test_clean_precision_above_6_raises(self):
        t = _make_tenant('UT3', 'ut3-unit')
        from catalog.models import Unit
        with pg_tenant_context(t):
            u = Unit(tenant=t, symbol='X', name='X', precision=7)
            with pytest.raises(ValidationError):
                u.full_clean()


@pytest.mark.django_db
class TestCategoryModel:
    def test_str(self):
        t = _make_tenant('CAT', 'cat-str')
        from catalog.models import Category
        with pg_tenant_context(t):
            c = Category.all_objects.create(tenant=t, name='Eletronicos')
            assert 'Eletronicos' in str(c)

    def test_self_parent_raises(self):
        t = _make_tenant('CAT2', 'cat-self-parent')
        from catalog.models import Category
        with pg_tenant_context(t):
            c = Category.all_objects.create(tenant=t, name='Root')
            c.parent = c
            with pytest.raises(ValidationError):
                c.full_clean()

    def test_cycle_detection(self):
        t = _make_tenant('CAT3', 'cat-cycle')
        from catalog.models import Category
        with pg_tenant_context(t):
            a = Category.all_objects.create(tenant=t, name='A')
            b = Category.all_objects.create(tenant=t, name='B', parent=a)
            c = Category.all_objects.create(tenant=t, name='C', parent=b)
            a.parent = c
            with pytest.raises(ValidationError):
                a.full_clean()

    def test_cross_tenant_parent_raises(self):
        t1 = _make_tenant('CAT4', 'cat-x-tenant1')
        t2 = _make_tenant('CAT5', 'cat-x-tenant2')
        from catalog.models import Category
        with pg_tenant_context(t2):
            parent_other = Category.all_objects.create(tenant=t2, name='Other')
        with pg_tenant_context(t1):
            child = Category.all_objects.create(tenant=t1, name='Child', parent=parent_other)
            with pytest.raises(ValidationError):
                child.full_clean()

    def test_unique_code_per_tenant(self):
        t = _make_tenant('CAT6', 'cat-uniq-code')
        from catalog.models import Category
        with pg_tenant_context(t):
            Category.all_objects.create(tenant=t, name='A', code='ELEC')
            with pytest.raises(Exception):
                Category.all_objects.create(tenant=t, name='B', code='ELEC')


@pytest.mark.django_db
class TestProductModel:
    def test_str(self):
        t = _make_tenant('PROD', 'prod-str')
        from catalog.models import Product, Unit
        with pg_tenant_context(t):
            u = Unit.all_objects.create(tenant=t, symbol='un', name='Un')
            p = Product.all_objects.create(tenant=t, sku='P001', name='Teste', base_unit=u)
            assert 'P001' in str(p)

    def test_save_uppercases_sku(self):
        t = _make_tenant('PROD2', 'prod-upper')
        from catalog.models import Product, Unit
        with pg_tenant_context(t):
            u = Unit.all_objects.create(tenant=t, symbol='un', name='Un')
            p = Product.all_objects.create(tenant=t, sku='  abc-01  ', name='X', base_unit=u)
            assert p.sku == 'ABC-01'

    def test_clean_cross_tenant_unit_raises(self):
        t1 = _make_tenant('PROD3', 'prod-xunit1')
        t2 = _make_tenant('PROD4', 'prod-xunit2')
        from catalog.models import Product, Unit
        with pg_tenant_context(t2):
            u2 = Unit.all_objects.create(tenant=t2, symbol='kg', name='Kg')
        with pg_tenant_context(t1):
            p = Product.all_objects.create(tenant=t1, sku='P-X', name='X', base_unit=u2)
            with pytest.raises(ValidationError):
                p.full_clean()

    def test_clean_cross_tenant_category_raises(self):
        t1 = _make_tenant('PROD5', 'prod-xcat1')
        t2 = _make_tenant('PROD6', 'prod-xcat2')
        from catalog.models import Category, Product, Unit
        with pg_tenant_context(t2):
            cat2 = Category.all_objects.create(tenant=t2, name='Other')
        with pg_tenant_context(t1):
            u = Unit.all_objects.create(tenant=t1, symbol='un', name='Un')
            p = Product.all_objects.create(
                tenant=t1, sku='P-XC', name='XC', base_unit=u, category=cat2
            )
            with pytest.raises(ValidationError):
                p.full_clean()

    def test_servico_sets_inventory_flags(self):
        t = _make_tenant('PROD7', 'prod-svc')
        from catalog.models import Product, Unit
        with pg_tenant_context(t):
            u = Unit.all_objects.create(tenant=t, symbol='h', name='Hora')
            p = Product(
                tenant=t, sku='SVC', name='Servico', base_unit=u, product_kind='servico',
                tracks_inventory=True, requires_lot=True, requires_expiry=True,
            )
            p.full_clean()
            assert p.tracks_inventory is False
            assert p.requires_lot is False
            assert p.requires_expiry is False


@pytest.mark.django_db
class TestProductUnitModel:
    def test_str(self):
        t = _make_tenant('PU', 'pu-str')
        from catalog.models import Product, ProductUnit, Unit
        with pg_tenant_context(t):
            u = Unit.all_objects.create(tenant=t, symbol='kg', name='Kg')
            p = Product.all_objects.create(tenant=t, sku='PU-1', name='P', base_unit=u)
            pu = ProductUnit.all_objects.create(
                tenant=t, product=p, unit=u, factor=Decimal('2.5')
            )
            s = str(pu)
            assert 'PU-1' in s
            assert '2.5' in s

    def test_clean_zero_factor_raises(self):
        t = _make_tenant('PU2', 'pu-zero')
        from catalog.models import Product, ProductUnit, Unit
        with pg_tenant_context(t):
            u = Unit.all_objects.create(tenant=t, symbol='un', name='Un')
            p = Product.all_objects.create(tenant=t, sku='PU-Z', name='P', base_unit=u)
            pu = ProductUnit(tenant=t, product=p, unit=u, factor=Decimal('0'))
            with pytest.raises(ValidationError):
                pu.full_clean()

    def test_clean_cross_tenant_product_raises(self):
        t1 = _make_tenant('PU3', 'pu-xp1')
        t2 = _make_tenant('PU4', 'pu-xp2')
        from catalog.models import Product, ProductUnit, Unit
        with pg_tenant_context(t2):
            u2 = Unit.all_objects.create(tenant=t2, symbol='un', name='Un')
            p2 = Product.all_objects.create(tenant=t2, sku='PU-XP2', name='P2', base_unit=u2)
        with pg_tenant_context(t1):
            u1 = Unit.all_objects.create(tenant=t1, symbol='kg', name='Kg')
            pu = ProductUnit(tenant=t1, product=p2, unit=u1, factor=Decimal('1'))
            with pytest.raises(ValidationError):
                pu.full_clean()

    def test_clean_cross_tenant_unit_raises(self):
        t1 = _make_tenant('PU5', 'pu-xu1')
        t2 = _make_tenant('PU6', 'pu-xu2')
        from catalog.models import Product, ProductUnit, Unit
        with pg_tenant_context(t1):
            u1 = Unit.all_objects.create(tenant=t1, symbol='un', name='Un')
            p1 = Product.all_objects.create(tenant=t1, sku='PU-XU', name='P', base_unit=u1)
        with pg_tenant_context(t2):
            u2 = Unit.all_objects.create(tenant=t2, symbol='lb', name='Lb')
        with pg_tenant_context(t1):
            pu = ProductUnit(tenant=t1, product=p1, unit=u2, factor=Decimal('1'))
            with pytest.raises(ValidationError):
                pu.full_clean()


@pytest.mark.django_db
class TestProductCodeModel:
    def test_str(self):
        t = _make_tenant('PC', 'pc-str')
        from catalog.models import Product, ProductCode, Unit
        with pg_tenant_context(t):
            u = Unit.all_objects.create(tenant=t, symbol='un', name='Un')
            p = Product.all_objects.create(tenant=t, sku='PC-1', name='P', base_unit=u)
            pc = ProductCode.all_objects.create(
                tenant=t, product=p, code_type='internal', value='12345'
            )
            assert '12345' in str(pc)

    def test_save_uppercases_value(self):
        t = _make_tenant('PC2', 'pc-upper')
        from catalog.models import Product, ProductCode, Unit
        with pg_tenant_context(t):
            u = Unit.all_objects.create(tenant=t, symbol='un', name='Un')
            p = Product.all_objects.create(tenant=t, sku='PC-U', name='P', base_unit=u)
            pc = ProductCode.all_objects.create(
                tenant=t, product=p, code_type='supplier', value='  abc-123  '
            )
            assert pc.value == 'ABC-123'

    def test_clean_cross_tenant_product_raises(self):
        t1 = _make_tenant('PC3', 'pc-xp1')
        t2 = _make_tenant('PC4', 'pc-xp2')
        from catalog.models import Product, ProductCode, Unit
        with pg_tenant_context(t2):
            u2 = Unit.all_objects.create(tenant=t2, symbol='un', name='Un')
            p2 = Product.all_objects.create(tenant=t2, sku='PC-XP', name='P2', base_unit=u2)
        with pg_tenant_context(t1):
            pc = ProductCode(tenant=t1, product=p2, code_type='internal', value='X')
            with pytest.raises(ValidationError):
                pc.full_clean()


@pytest.mark.django_db
class TestProductPriceModel:
    def test_str(self):
        t = _make_tenant('PP', 'pp-str')
        from catalog.models import Product, ProductPrice, Unit
        with pg_tenant_context(t):
            u = Unit.all_objects.create(tenant=t, symbol='un', name='Un')
            p = Product.all_objects.create(tenant=t, sku='PP-1', name='P', base_unit=u)
            pp = ProductPrice.all_objects.create(
                tenant=t, product=p, amount=Decimal('10.00'), valid_from=timezone.now()
            )
            assert 'PP-1' in str(pp)

    def test_clean_negative_amount_raises(self):
        t = _make_tenant('PP2', 'pp-neg')
        from catalog.models import Product, ProductPrice, Unit
        with pg_tenant_context(t):
            u = Unit.all_objects.create(tenant=t, symbol='un', name='Un')
            p = Product.all_objects.create(tenant=t, sku='PP-N', name='P', base_unit=u)
            pp = ProductPrice(tenant=t, product=p, amount=Decimal('-1'), valid_from=timezone.now())
            with pytest.raises(ValidationError):
                pp.full_clean()

    def test_clean_valid_to_before_from_raises(self):
        t = _make_tenant('PP3', 'pp-to')
        from catalog.models import Product, ProductPrice, Unit
        with pg_tenant_context(t):
            u = Unit.all_objects.create(tenant=t, symbol='un', name='Un')
            p = Product.all_objects.create(tenant=t, sku='PP-T', name='P', base_unit=u)
            now = timezone.now()
            pp = ProductPrice(
                tenant=t, product=p, amount=Decimal('5'),
                valid_from=now, valid_to=now - timezone.timedelta(days=1),
            )
            with pytest.raises(ValidationError):
                pp.full_clean()

    def test_clean_cross_tenant_product_raises(self):
        t1 = _make_tenant('PP4', 'pp-xp1')
        t2 = _make_tenant('PP5', 'pp-xp2')
        from catalog.models import Product, ProductPrice, Unit
        with pg_tenant_context(t2):
            u2 = Unit.all_objects.create(tenant=t2, symbol='un', name='Un')
            p2 = Product.all_objects.create(tenant=t2, sku='PP-XP', name='P', base_unit=u2)
        with pg_tenant_context(t1):
            pp = ProductPrice(tenant=t1, product=p2, amount=Decimal('5'), valid_from=timezone.now())
            with pytest.raises(ValidationError):
                pp.full_clean()

    def test_clean_overlapping_price_raises(self):
        t = _make_tenant('PP6', 'pp-overlap')
        from catalog.models import Product, ProductPrice, Unit
        with pg_tenant_context(t):
            u = Unit.all_objects.create(tenant=t, symbol='un', name='Un')
            p = Product.all_objects.create(tenant=t, sku='PP-O', name='P', base_unit=u)
            now = timezone.now()
            ProductPrice.all_objects.create(
                tenant=t, product=p, amount=Decimal('10'), valid_from=now,
            )
            pp2 = ProductPrice(
                tenant=t, product=p, amount=Decimal('12'),
                valid_from=now + timezone.timedelta(days=5),
            )
            with pytest.raises(ValidationError):
                pp2.full_clean()


@pytest.mark.django_db
class TestBranchPriceModel:
    def test_str(self):
        t = _make_tenant('BP', 'bp-str')
        from catalog.models import BranchPrice, Product, Unit
        br = _make_branch(t)
        with pg_tenant_context(t):
            u = Unit.all_objects.create(tenant=t, symbol='un', name='Un')
            p = Product.all_objects.create(tenant=t, sku='BP-1', name='P', base_unit=u)
            bp = BranchPrice.all_objects.create(
                tenant=t, product=p, branch=br, amount=Decimal('20'), valid_from=timezone.now()
            )
            assert 'BP-1' in str(bp)
            assert br.name in str(bp)

    def test_clean_negative_amount_raises(self):
        t = _make_tenant('BP2', 'bp-neg')
        from catalog.models import BranchPrice, Product, Unit
        br = _make_branch(t)
        with pg_tenant_context(t):
            u = Unit.all_objects.create(tenant=t, symbol='un', name='Un')
            p = Product.all_objects.create(tenant=t, sku='BP-N', name='P', base_unit=u)
            bp = BranchPrice(
                tenant=t, product=p, branch=br, amount=Decimal('-5'), valid_from=timezone.now()
            )
            with pytest.raises(ValidationError):
                bp.full_clean()

    def test_clean_valid_to_before_from_raises(self):
        t = _make_tenant('BP3', 'bp-to')
        from catalog.models import BranchPrice, Product, Unit
        br = _make_branch(t)
        with pg_tenant_context(t):
            u = Unit.all_objects.create(tenant=t, symbol='un', name='Un')
            p = Product.all_objects.create(tenant=t, sku='BP-T', name='P', base_unit=u)
            now = timezone.now()
            bp = BranchPrice(
                tenant=t, product=p, branch=br, amount=Decimal('5'),
                valid_from=now, valid_to=now - timezone.timedelta(days=1),
            )
            with pytest.raises(ValidationError):
                bp.full_clean()

    def test_clean_cross_tenant_branch_raises(self):
        t1 = _make_tenant('BP4', 'bp-xb1')
        t2 = _make_tenant('BP5', 'bp-xb2')
        from catalog.models import BranchPrice, Product, Unit
        br2 = _make_branch(t2)
        with pg_tenant_context(t1):
            u = Unit.all_objects.create(tenant=t1, symbol='un', name='Un')
            p = Product.all_objects.create(tenant=t1, sku='BP-XB', name='P', base_unit=u)
            bp = BranchPrice(
                tenant=t1, product=p, branch=br2, amount=Decimal('5'),
                valid_from=timezone.now(),
            )
            with pytest.raises(ValidationError):
                bp.full_clean()

    def test_clean_overlapping_branch_price_raises(self):
        t = _make_tenant('BP6', 'bp-overlap')
        from catalog.models import BranchPrice, Product, Unit
        br = _make_branch(t)
        with pg_tenant_context(t):
            u = Unit.all_objects.create(tenant=t, symbol='un', name='Un')
            p = Product.all_objects.create(tenant=t, sku='BP-O', name='P', base_unit=u)
            now = timezone.now()
            BranchPrice.all_objects.create(
                tenant=t, product=p, branch=br, amount=Decimal('10'), valid_from=now,
            )
            bp2 = BranchPrice(
                tenant=t, product=p, branch=br, amount=Decimal('12'),
                valid_from=now + timezone.timedelta(days=5),
            )
            with pytest.raises(ValidationError):
                bp2.full_clean()


@pytest.mark.django_db
class TestProductFiscalDataModel:
    def test_str(self):
        t = _make_tenant('PFD', 'pfd-str')
        from catalog.models import Product, ProductFiscalData, Unit
        with pg_tenant_context(t):
            u = Unit.all_objects.create(tenant=t, symbol='un', name='Un')
            p = Product.all_objects.create(
                tenant=t, sku='PFD-1', name='P', base_unit=u, ncm='12345678'
            )
            fd = ProductFiscalData.all_objects.create(
                tenant=t, product=p, ncm='87654321', fiscal_type='revenda'
            )
            assert 'PFD-1' in str(fd)
            assert '87654321' in str(fd)

    def test_clean_cross_tenant_product_raises(self):
        t1 = _make_tenant('PFD2', 'pfd-xp1')
        t2 = _make_tenant('PFD3', 'pfd-xp2')
        from catalog.models import Product, ProductFiscalData, Unit
        with pg_tenant_context(t2):
            u2 = Unit.all_objects.create(tenant=t2, symbol='un', name='Un')
            p2 = Product.all_objects.create(tenant=t2, sku='PFD-XP', name='P', base_unit=u2)
        with pg_tenant_context(t1):
            fd = ProductFiscalData(tenant=t1, product=p2)
            with pytest.raises(ValidationError):
                fd.full_clean()

    def test_clean_invalid_origin_code_raises(self):
        t = _make_tenant('PFD4', 'pfd-origin')
        from catalog.models import Product, ProductFiscalData, Unit
        with pg_tenant_context(t):
            u = Unit.all_objects.create(tenant=t, symbol='un', name='Un')
            p = Product.all_objects.create(tenant=t, sku='PFD-O', name='P', base_unit=u)
            fd = ProductFiscalData(tenant=t, product=p, origin_code='9')
            with pytest.raises(ValidationError):
                fd.full_clean()

    def test_clean_valid_origin_codes(self):
        t = _make_tenant('PFD5', 'pfd-valid-origin')
        from catalog.models import Product, ProductFiscalData, Unit
        with pg_tenant_context(t):
            u = Unit.all_objects.create(tenant=t, symbol='un', name='Un')
            p = Product.all_objects.create(tenant=t, sku='PFD-V', name='P', base_unit=u)
            for code in '012345678':
                fd = ProductFiscalData(tenant=t, product=p, origin_code=code)
                fd.full_clean()


@pytest.mark.django_db
class TestProductPriceTierModel:
    def test_str(self):
        t = _make_tenant('PPT', 'ppt-str')
        from catalog.models import Product, ProductPriceTier, Unit
        with pg_tenant_context(t):
            u = Unit.all_objects.create(tenant=t, symbol='un', name='Un')
            p = Product.all_objects.create(tenant=t, sku='PPT-1', name='P', base_unit=u)
            tier = ProductPriceTier.all_objects.create(
                tenant=t, product=p, min_quantity=Decimal('10'), amount=Decimal('8.5')
            )
            assert 'PPT-1' in str(tier)

    def test_clean_zero_min_quantity_raises(self):
        t = _make_tenant('PPT2', 'ppt-zero')
        from catalog.models import Product, ProductPriceTier, Unit
        with pg_tenant_context(t):
            u = Unit.all_objects.create(tenant=t, symbol='un', name='Un')
            p = Product.all_objects.create(tenant=t, sku='PPT-Z', name='P', base_unit=u)
            tier = ProductPriceTier(
                tenant=t, product=p, min_quantity=Decimal('0'), amount=Decimal('5')
            )
            with pytest.raises(ValidationError):
                tier.full_clean()

    def test_clean_negative_amount_raises(self):
        t = _make_tenant('PPT3', 'ppt-neg')
        from catalog.models import Product, ProductPriceTier, Unit
        with pg_tenant_context(t):
            u = Unit.all_objects.create(tenant=t, symbol='un', name='Un')
            p = Product.all_objects.create(tenant=t, sku='PPT-N', name='P', base_unit=u)
            tier = ProductPriceTier(
                tenant=t, product=p, min_quantity=Decimal('1'), amount=Decimal('-5')
            )
            with pytest.raises(ValidationError):
                tier.full_clean()

    def test_clean_inactive_product_raises(self):
        t = _make_tenant('PPT4', 'ppt-inact')
        from catalog.models import Product, ProductPriceTier, Unit
        with pg_tenant_context(t):
            u = Unit.all_objects.create(tenant=t, symbol='un', name='Un')
            p = Product.all_objects.create(
                tenant=t, sku='PPT-I', name='P', base_unit=u, is_active=False
            )
            tier = ProductPriceTier(
                tenant=t, product=p, min_quantity=Decimal('1'), amount=Decimal('5')
            )
            with pytest.raises(ValidationError):
                tier.full_clean()

    def test_clean_duplicate_tier_raises(self):
        t = _make_tenant('PPT5', 'ppt-dup')
        from catalog.models import Product, ProductPriceTier, Unit
        with pg_tenant_context(t):
            u = Unit.all_objects.create(tenant=t, symbol='un', name='Un')
            p = Product.all_objects.create(tenant=t, sku='PPT-D', name='P', base_unit=u)
            ProductPriceTier.all_objects.create(
                tenant=t, product=p, min_quantity=Decimal('10'), amount=Decimal('5')
            )
            tier2 = ProductPriceTier(
                tenant=t, product=p, min_quantity=Decimal('10'), amount=Decimal('4')
            )
            with pytest.raises(ValidationError):
                tier2.full_clean()


@pytest.mark.django_db
class TestBrandModel:
    def test_str(self):
        t = _make_tenant('BR', 'br-str')
        from catalog.models import Brand
        with pg_tenant_context(t):
            b = Brand.all_objects.create(tenant=t, name='Marca Legal')
            assert str(b) == 'Marca Legal'

    def test_save_normalizes_whitespace(self):
        t = _make_tenant('BR2', 'br-ws')
        from catalog.models import Brand
        with pg_tenant_context(t):
            b = Brand.all_objects.create(tenant=t, name='  Marca   Legal  ')
            assert b.name == 'Marca Legal'

    def test_clean_duplicate_name_raises(self):
        t = _make_tenant('BR3', 'br-dup')
        from catalog.models import Brand
        with pg_tenant_context(t):
            Brand.all_objects.create(tenant=t, name='Dup')
            b2 = Brand(tenant=t, name='Dup')
            with pytest.raises(ValidationError):
                b2.full_clean()


@pytest.mark.django_db
class TestProductImageModel:
    def test_clean_cross_tenant_product_raises(self):
        t1 = _make_tenant('PI', 'pi-xp1')
        t2 = _make_tenant('PI2', 'pi-xp2')
        from catalog.models import Product, ProductImage, Unit
        with pg_tenant_context(t2):
            u2 = Unit.all_objects.create(tenant=t2, symbol='un', name='Un')
            p2 = Product.all_objects.create(tenant=t2, sku='PI-X', name='P', base_unit=u2)
        with pg_tenant_context(t1):
            pi = ProductImage(tenant=t1, product=p2)
            with pytest.raises(ValidationError):
                pi.full_clean()


@pytest.mark.django_db
class TestCommercialComboModel:
    def test_str(self):
        t = _make_tenant('CC', 'cc-str')
        from catalog.models import CommercialCombo
        with pg_tenant_context(t):
            c = CommercialCombo.all_objects.create(
                tenant=t, sku='combo-01', name='Combo', price=Decimal('50'),
                valid_from=timezone.now(),
            )
            assert 'COMBO-01' in str(c)

    def test_save_uppercases_sku(self):
        t = _make_tenant('CC2', 'cc-upper')
        from catalog.models import CommercialCombo
        with pg_tenant_context(t):
            c = CommercialCombo.all_objects.create(
                tenant=t, sku='  combo-xyz  ', name='C', price=Decimal('10'),
                valid_from=timezone.now(),
            )
            assert c.sku == 'COMBO-XYZ'


@pytest.mark.django_db
class TestComboItemModel:
    def test_str(self):
        t = _make_tenant('CI', 'ci-str')
        from catalog.models import ComboItem, CommercialCombo, Product, Unit
        with pg_tenant_context(t):
            u = Unit.all_objects.create(tenant=t, symbol='un', name='Un')
            p = Product.all_objects.create(tenant=t, sku='CI-P', name='P', base_unit=u)
            combo = CommercialCombo.all_objects.create(
                tenant=t, sku='CI-C', name='C', price=Decimal('10'),
                valid_from=timezone.now(),
            )
            ci = ComboItem.all_objects.create(
                tenant=t, combo=combo, item=p, quantity=Decimal('2')
            )
            assert 'CI-C' in str(ci)
            assert 'CI-P' in str(ci)

    def test_clean_zero_quantity_raises(self):
        t = _make_tenant('CI2', 'ci-zero')
        from catalog.models import ComboItem, CommercialCombo, Product, Unit
        with pg_tenant_context(t):
            u = Unit.all_objects.create(tenant=t, symbol='un', name='Un')
            p = Product.all_objects.create(tenant=t, sku='CI-Z', name='P', base_unit=u)
            combo = CommercialCombo.all_objects.create(
                tenant=t, sku='CI-CZ', name='C', price=Decimal('10'),
                valid_from=timezone.now(),
            )
            ci = ComboItem(tenant=t, combo=combo, item=p, quantity=Decimal('0'))
            with pytest.raises(ValidationError):
                ci.full_clean()

    def test_clean_cross_tenant_combo_raises(self):
        t1 = _make_tenant('CI3', 'ci-xc1')
        t2 = _make_tenant('CI4', 'ci-xc2')
        from catalog.models import ComboItem, CommercialCombo, Product, Unit
        with pg_tenant_context(t2):
            u2 = Unit.all_objects.create(tenant=t2, symbol='un', name='Un')
            p2 = Product.all_objects.create(tenant=t2, sku='CI-XC', name='P', base_unit=u2)
            combo2 = CommercialCombo.all_objects.create(
                tenant=t2, sku='CI-CXC', name='C', price=Decimal('10'),
                valid_from=timezone.now(),
            )
        with pg_tenant_context(t1):
            ci = ComboItem(tenant=t1, combo=combo2, item=p2, quantity=Decimal('1'))
            with pytest.raises(ValidationError):
                ci.full_clean()

    def test_clean_cross_tenant_item_raises(self):
        t1 = _make_tenant('CI5', 'ci-xi1')
        t2 = _make_tenant('CI6', 'ci-xi2')
        from catalog.models import ComboItem, CommercialCombo, Product, Unit
        with pg_tenant_context(t1):
            u1 = Unit.all_objects.create(tenant=t1, symbol='un', name='Un')
            combo1 = CommercialCombo.all_objects.create(
                tenant=t1, sku='CI-CXI', name='C', price=Decimal('10'),
                valid_from=timezone.now(),
            )
        with pg_tenant_context(t2):
            u2 = Unit.all_objects.create(tenant=t2, symbol='un', name='Un')
            p2 = Product.all_objects.create(tenant=t2, sku='CI-XI', name='P', base_unit=u2)
        with pg_tenant_context(t1):
            ci = ComboItem(tenant=t1, combo=combo1, item=p2, quantity=Decimal('1'))
            with pytest.raises(ValidationError):
                ci.full_clean()


@pytest.mark.django_db
class TestProductCompositionModel:
    def test_str(self):
        t = _make_tenant('PCMP', 'pcmp-str')
        from catalog.models import Product, ProductComposition, Unit
        with pg_tenant_context(t):
            u = Unit.all_objects.create(tenant=t, symbol='un', name='Un')
            kit = Product.all_objects.create(
                tenant=t, sku='KIT-S', name='Kit', base_unit=u, product_kind='kit'
            )
            comp = Product.all_objects.create(tenant=t, sku='CMP-S', name='Comp', base_unit=u)
            pc = ProductComposition.all_objects.create(
                tenant=t, kit=kit, component=comp, quantity=Decimal('3')
            )
            assert 'KIT-S' in str(pc)
            assert 'CMP-S' in str(pc)

    def test_clean_self_composition_raises(self):
        t = _make_tenant('PCMP2', 'pcmp-self')
        from catalog.models import Product, ProductComposition, Unit
        with pg_tenant_context(t):
            u = Unit.all_objects.create(tenant=t, symbol='un', name='Un')
            kit = Product.all_objects.create(
                tenant=t, sku='KIT-SELF', name='Kit', base_unit=u, product_kind='kit'
            )
            pc = ProductComposition(tenant=t, kit=kit, component=kit, quantity=Decimal('1'))
            with pytest.raises(ValidationError):
                pc.full_clean()

    def test_clean_kit_component_is_also_kit_raises(self):
        t = _make_tenant('PCMP3', 'pcmp-kit-kit')
        from catalog.models import Product, ProductComposition, Unit
        with pg_tenant_context(t):
            u = Unit.all_objects.create(tenant=t, symbol='un', name='Un')
            kit1 = Product.all_objects.create(
                tenant=t, sku='KIT-A', name='KitA', base_unit=u, product_kind='kit'
            )
            kit2 = Product.all_objects.create(
                tenant=t, sku='KIT-B', name='KitB', base_unit=u, product_kind='kit'
            )
            pc = ProductComposition(tenant=t, kit=kit1, component=kit2, quantity=Decimal('1'))
            with pytest.raises(ValidationError):
                pc.full_clean()

    def test_clean_cycle_detection(self):
        t = _make_tenant('PCMP4', 'pcmp-cycle')
        from catalog.models import Product, ProductComposition, Unit
        with pg_tenant_context(t):
            u = Unit.all_objects.create(tenant=t, symbol='un', name='Un')
            p1 = Product.all_objects.create(tenant=t, sku='CYC-1', name='P1', base_unit=u)
            p2 = Product.all_objects.create(tenant=t, sku='CYC-2', name='P2', base_unit=u)
            p3 = Product.all_objects.create(tenant=t, sku='CYC-3', name='P3', base_unit=u)
            ProductComposition.all_objects.create(
                tenant=t, kit=p1, component=p2, quantity=Decimal('1')
            )
            ProductComposition.all_objects.create(
                tenant=t, kit=p2, component=p3, quantity=Decimal('1')
            )
            pc = ProductComposition(tenant=t, kit=p3, component=p1, quantity=Decimal('1'))
            with pytest.raises(ValidationError):
                pc.full_clean()

    def test_clean_zero_quantity_raises(self):
        t = _make_tenant('PCMP5', 'pcmp-zero')
        from catalog.models import Product, ProductComposition, Unit
        with pg_tenant_context(t):
            u = Unit.all_objects.create(tenant=t, symbol='un', name='Un')
            kit = Product.all_objects.create(
                tenant=t, sku='KIT-Z', name='Kit', base_unit=u, product_kind='kit'
            )
            comp = Product.all_objects.create(tenant=t, sku='CMP-Z', name='C', base_unit=u)
            pc = ProductComposition(tenant=t, kit=kit, component=comp, quantity=Decimal('0'))
            with pytest.raises(ValidationError):
                pc.full_clean()


@pytest.mark.django_db
class TestLabelTemplateModel:
    def test_str(self):
        t = _make_tenant('LT', 'lt-str')
        from catalog.models import LabelTemplate
        with pg_tenant_context(t):
            lt = LabelTemplate.all_objects.create(
                tenant=t, name='Etiqueta 10x5',
                width_mm=Decimal('100'), height_mm=Decimal('50'),
            )
            assert 'Etiqueta 10x5' in str(lt)
            assert t.name in str(lt)


@pytest.mark.django_db
class TestProductChannelProfileModel:
    def test_str(self):
        t = _make_tenant('PCP', 'pcp-str')
        from catalog.models import Product, ProductChannelProfile, Unit
        with pg_tenant_context(t):
            u = Unit.all_objects.create(tenant=t, symbol='un', name='Un')
            p = Product.all_objects.create(tenant=t, sku='PCP-1', name='P', base_unit=u)
            cp = ProductChannelProfile.all_objects.create(
                tenant=t, product=p, channel_slug='web', status='draft',
            )
            assert 'PCP-1' in str(cp)
            assert 'web' in str(cp)
            assert 'draft' in str(cp)


@pytest.mark.django_db
class TestProductApplyCommandModel:
    def test_create(self):
        t = _make_tenant('PAC', 'pac-create')
        from catalog.models import ProductApplyCommand
        with pg_tenant_context(t):
            pac = ProductApplyCommand.all_objects.create(
                tenant=t, command_id='cmd-1', payload_hash='abc',
                response_json={}, correlation_id=uuid.uuid4(),
            )
            assert pac.command_id == 'cmd-1'


# =============================================================================
# INVENTORY — kit_decomposition.py
# =============================================================================


@pytest.mark.django_db
class TestKitDecomposition:
    def _build_context(self):
        from catalog.models import Product, ProductComposition, Unit
        from inventory.models import StockBalance, StockLocation
        from sales.models import CashSession, Sale

        t = _make_tenant('KD', 'kd-ctx')
        user = User.objects.create_user(email='kd@test.local', password='pass123')

        def _create():
            unit = Unit.all_objects.create(tenant=t, symbol='UN', name='Un')
            comp1 = Product.all_objects.create(
                tenant=t, sku='KD-C1', name='Comp1', base_unit=unit,
            )
            comp2 = Product.all_objects.create(
                tenant=t, sku='KD-C2', name='Comp2', base_unit=unit,
            )
            kit = Product.all_objects.create(
                tenant=t, sku='KD-KIT', name='Kit', base_unit=unit, product_kind='kit',
            )
            company = Company.all_objects.create(tenant=t, name='KDCo')
            branch = Branch.all_objects.create(tenant=t, company=company, name='KDBranch')
            location = StockLocation.all_objects.create(
                tenant=t, branch=branch, code='KD-LOC', name='Loc', is_primary=True,
            )
            StockBalance.all_objects.create(
                tenant=t, product=comp1, location=location, quantity=Decimal('50'),
            )
            StockBalance.all_objects.create(
                tenant=t, product=comp2, location=location, quantity=Decimal('50'),
            )
            ProductComposition.all_objects.create(
                tenant=t, kit=kit, component=comp1, quantity=Decimal('1'),
            )
            ProductComposition.all_objects.create(
                tenant=t, kit=kit, component=comp2, quantity=Decimal('2'),
            )
            cash_session = CashSession.all_objects.create(
                tenant=t, branch=branch, operator=user,
                opening_amount=Decimal('0'), expected_amount=Decimal('0'),
            )
            sale = Sale.all_objects.create(
                tenant=t, branch=branch, cash_session=cash_session,
                operator=user, status='confirmed',
                gross_total=Decimal('100'), discount_total=Decimal('0'),
                net_total=Decimal('100'),
            )
            return {
                'tenant': t, 'unit': unit, 'kit': kit, 'comp1': comp1,
                'comp2': comp2, 'branch': branch, 'location': location,
                'sale': sale, 'user': user,
            }

        return _run_in_tenant(t, _create)

    def test_decompose_creates_movements(self):
        from inventory.kit_decomposition import decompose_kit_sale
        ctx = self._build_context()
        event_id = uuid.uuid4()
        movements = decompose_kit_sale(
            tenant=ctx['tenant'], sale=ctx['sale'], kit_product=ctx['kit'],
            kit_quantity=Decimal('5'), sale_event_id=str(event_id),
            location=ctx['location'],
        )
        assert len(movements) == 2

    def test_decompose_idempotent(self):
        from inventory.kit_decomposition import decompose_kit_sale
        ctx = self._build_context()
        event_id = uuid.uuid4()
        decompose_kit_sale(
            tenant=ctx['tenant'], sale=ctx['sale'], kit_product=ctx['kit'],
            kit_quantity=Decimal('1'), sale_event_id=str(event_id),
            location=ctx['location'],
        )
        result = decompose_kit_sale(
            tenant=ctx['tenant'], sale=ctx['sale'], kit_product=ctx['kit'],
            kit_quantity=Decimal('1'), sale_event_id=str(event_id),
            location=ctx['location'],
        )
        assert result == []

    def test_insufficient_stock_raises(self):
        from inventory.kit_decomposition import InsufficientComponentStock, decompose_kit_sale
        ctx = self._build_context()
        with pytest.raises(InsufficientComponentStock):
            decompose_kit_sale(
                tenant=ctx['tenant'], sale=ctx['sale'], kit_product=ctx['kit'],
                kit_quantity=Decimal('100'), sale_event_id=str(uuid.uuid4()),
                location=ctx['location'],
            )

    def test_no_composition_raises(self):
        from django.core.exceptions import ValidationError as VE

        from inventory.kit_decomposition import decompose_kit_sale
        ctx = self._build_context()
        from catalog.models import ProductComposition
        ProductComposition.all_objects.filter(
            tenant=ctx['tenant'], kit=ctx['kit']
        ).update(is_active=False)
        with pytest.raises(VE, match='no active composition'):
            decompose_kit_sale(
                tenant=ctx['tenant'], sale=ctx['sale'], kit_product=ctx['kit'],
                kit_quantity=Decimal('1'), sale_event_id=str(uuid.uuid4()),
                location=ctx['location'],
            )

    def test_no_primary_location_raises(self):
        from django.core.exceptions import ValidationError as VE

        from inventory.kit_decomposition import decompose_kit_sale
        from inventory.models import StockLocation
        ctx = self._build_context()
        StockLocation.all_objects.filter(
            tenant=ctx['tenant'], branch=ctx['branch']
        ).update(is_primary=False)
        with pytest.raises(VE, match='No primary stock location'):
            decompose_kit_sale(
                tenant=ctx['tenant'], sale=ctx['sale'], kit_product=ctx['kit'],
                kit_quantity=Decimal('1'), sale_event_id=str(uuid.uuid4()),
            )

    def test_insufficient_stock_exception_message(self):
        from inventory.kit_decomposition import InsufficientComponentStock
        exc = InsufficientComponentStock([('SKU', '0', '5')])
        assert 'Insufficient stock' in str(exc)
        assert exc.shortages == [('SKU', '0', '5')]

    def test_decompose_updates_balances(self):
        from inventory.kit_decomposition import decompose_kit_sale
        from inventory.models import StockBalance
        ctx = self._build_context()
        decompose_kit_sale(
            tenant=ctx['tenant'], sale=ctx['sale'], kit_product=ctx['kit'],
            kit_quantity=Decimal('5'), sale_event_id=str(uuid.uuid4()),
            location=ctx['location'],
        )
        b1 = StockBalance.all_objects.get(
            tenant=ctx['tenant'], product=ctx['comp1'], location=ctx['location'],
        )
        b2 = StockBalance.all_objects.get(
            tenant=ctx['tenant'], product=ctx['comp2'], location=ctx['location'],
        )
        assert b1.quantity == Decimal('45')
        assert b2.quantity == Decimal('40')


# =============================================================================
# FISCAL — ocr.py
# =============================================================================


@pytest.mark.django_db
class TestOCRParseNfeXml:
    def _minimal_xml(self, *, items=None, emit_cnpj=None, dest_cnpj=None,
                      doc_number='123', series='1', emission_date='2024-01-15'):
        item_xml = ''
        for i, item in enumerate(items or [{'code': 'P1', 'desc': 'Prod1', 'ncm': '12345678',
                                             'cfop': '5102', 'qty': '10', 'price': '5.00'}]):
            item_xml += f'''
            <det nItem="{i+1}">
              <prod>
                <cProd>{item["code"]}</cProd>
                <xProd>{item["desc"]}</xProd>
                <NCM>{item["ncm"]}</NCM>
                <CFOP>{item["cfop"]}</CFOP>
                <uCom>UN</uCom>
                <qCom>{item["qty"]}</qCom>
                <vUnCom>{item["price"]}</vUnCom>
              </prod>
            </det>'''

        emit_section = ''
        if emit_cnpj:
            emit_section = f'<emit><xNome>Fornecedor</xNome><CNPJ>{emit_cnpj}</CNPJ></emit>'
        dest_section = ''
        if dest_cnpj:
            dest_section = f'<dest><CNPJ>{dest_cnpj}</CNPJ></dest>'

        return f'''<?xml version="1.0" encoding="UTF-8"?>
        <nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">
          <NFe>
            <infNFe>
              {emit_section}
              {dest_section}
              <ide>
                <nNF>{doc_number}</nNF>
                <serie>{series}</serie>
                <dhEmi>{emission_date}</dhEmi>
              </ide>
              {item_xml}
            </infNFe>
          </NFe>
        </nfeProc>'''

    def test_parse_basic(self):
        from fiscal.ocr import parse_nfe_xml
        xml = self._minimal_xml(emit_cnpj='12345678000199')
        result = parse_nfe_xml(xml)
        assert result['supplier']['cnpj'] == '12345678000199'
        assert result['supplier']['name'] == 'Fornecedor'
        assert len(result['items']) == 1
        assert result['document_number'] == '123'
        assert result['series'] == '1'
        assert result['cfop'] == '5102'

    def test_parse_multiple_items(self):
        from fiscal.ocr import parse_nfe_xml
        items = [
            {'code': 'P1', 'desc': 'A', 'ncm': '12345678', 'cfop': '5102', 'qty': '10', 'price': '5.00'},
            {'code': 'P2', 'desc': 'B', 'ncm': '87654321', 'cfop': '5102', 'qty': '20', 'price': '3.00'},
        ]
        xml = self._minimal_xml(items=items, emit_cnpj='11111111000111')
        result = parse_nfe_xml(xml)
        assert len(result['items']) == 2
        assert result['items'][0]['code'] == 'P1'
        assert result['items'][1]['code'] == 'P2'

    def test_parse_no_emit_cnpj_uses_dest(self):
        from fiscal.ocr import parse_nfe_xml
        xml = self._minimal_xml(dest_cnpj='99999999000199')
        result = parse_nfe_xml(xml)
        assert result['supplier']['cnpj'] == '99999999000199'

    def test_parse_empty_xml(self):
        from fiscal.ocr import parse_nfe_xml
        xml = '''<?xml version="1.0" encoding="UTF-8"?>
        <nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">
          <NFe><infNFe></infNFe></NFe>
        </nfeProc>'''
        result = parse_nfe_xml(xml)
        assert result['items'] == []
        assert result['supplier'] == {}
        assert result['document_number'] == ''

    def test_parse_decimal_quantity_and_price(self):
        from decimal import Decimal

        from fiscal.ocr import parse_nfe_xml
        xml = self._minimal_xml(
            items=[{'code': 'P1', 'desc': 'X', 'ncm': '12345678',
                    'cfop': '5102', 'qty': '2.5', 'price': '10.75'}],
            emit_cnpj='11111111000111',
        )
        result = parse_nfe_xml(xml)
        assert result['items'][0]['quantity'] == Decimal('2.5')
        assert result['items'][0]['unit_price'] == Decimal('10.75')

    def test_parse_item_missing_optional_fields(self):
        from decimal import Decimal

        from fiscal.ocr import parse_nfe_xml
        xml = '''<?xml version="1.0" encoding="UTF-8"?>
        <nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">
          <NFe><infNFe>
            <det nItem="1"><prod>
              <cProd>P1</cProd>
            </prod></det>
          </infNFe></NFe>
        </nfeProc>'''
        result = parse_nfe_xml(xml)
        assert len(result['items']) == 1
        assert result['items'][0]['quantity'] == Decimal('0')
        assert result['items'][0]['unit'] == 'UN'


# =============================================================================
# FISCAL — views.py
# =============================================================================


@pytest.mark.django_db
class TestFiscalViews:
    def test_get_or_create_active_fiscal_document_creates(self):
        from fiscal.models import FiscalDocument
        from fiscal.views import _get_or_create_active_fiscal_document
        from sales.models import CashSession, Sale

        t = _make_tenant('FV1', 'fv1')
        user = User.objects.create_user(email='fv1@test.local', password='pass123')

        def _create():
            from catalog.models import Product, Unit
            unit = Unit.all_objects.create(tenant=t, symbol='UN', name='Un')
            Product.all_objects.create(tenant=t, sku='FV1-P', name='P', base_unit=unit)
            company = Company.all_objects.create(tenant=t, name='FV1Co')
            branch = Branch.all_objects.create(tenant=t, company=company, name='FV1Br')
            cash = CashSession.all_objects.create(
                tenant=t, branch=branch, operator=user,
                opening_amount=Decimal('0'), expected_amount=Decimal('0'),
            )
            sale = Sale.all_objects.create(
                tenant=t, branch=branch, cash_session=cash,
                operator=user, status='confirmed',
                gross_total=Decimal('10'), discount_total=Decimal('0'),
                net_total=Decimal('10'),
            )
            doc, created = _get_or_create_active_fiscal_document(sale, t)
            assert created is True
            assert doc.status == FiscalDocument.STATUS_QUEUED
            return sale

        sale = _run_in_tenant(t, _create)
        with pg_tenant_context(t):
            doc2, created2 = _get_or_create_active_fiscal_document(sale, t)
            assert created2 is False

    def test_fiscal_status_view_404(self):
        from django.http import Http404

        from fiscal.views import FiscalStatusView

        t = _make_tenant('FV2', 'fv2')
        view = FiscalStatusView()
        view.kwargs = {'sale_id': str(uuid.uuid4())}
        view.request = MagicMock()
        view.request.tenant = t
        with pytest.raises(Http404):
            view.get_object()

    def test_problem_helper(self):
        from fiscal.views import _problem
        resp = _problem('test detail', 'test_code', 400)
        assert resp.status_code == 400
        data = resp.data
        assert 'test detail' in data.get('detail', '')


@pytest.mark.django_db
class TestFiscalConfigView:
    def test_missing_branch_param(self):
        from fiscal.views import FiscalConfigView
        factory = APIRequestFactory()
        t = _make_tenant('FC1', 'fc1')
        request = _wrap_drf(factory.get('/api/fiscal/config/'), tenant=t)
        request.user = MagicMock(is_authenticated=True)
        view = FiscalConfigView()
        view.kwargs = {}
        resp = view.get(request)
        assert resp.status_code == 400

    def test_branch_not_found(self):
        from fiscal.views import FiscalConfigView
        t = _make_tenant('FC2', 'fc2')
        factory = APIRequestFactory()
        request = _wrap_drf(factory.get(f'/api/fiscal/config/?branch={uuid.uuid4()}'), tenant=t)
        request.user = MagicMock(is_authenticated=True)
        view = FiscalConfigView()
        view.kwargs = {}
        resp = view.get(request)
        assert resp.status_code == 404


@pytest.mark.django_db
class TestOCRNFeView:
    def test_missing_xml_content(self):
        from fiscal.views import OCRNFeView
        factory = APIRequestFactory()
        t = _make_tenant('OCR1', 'ocr1')
        request = _wrap_drf(factory.post('/api/fiscal/ocr/', {}, format='json'), tenant=t, data={})
        request.user = MagicMock(is_authenticated=True)
        view = OCRNFeView()
        resp = view.post(request)
        assert resp.status_code == 400

    def test_invalid_xml_returns_empty_data(self):
        from fiscal.views import OCRNFeView
        factory = APIRequestFactory()
        t = _make_tenant('OCR2', 'ocr2')
        payload = {'xml_content': '<invalid>broken</invalid>'}
        request = _wrap_drf(
            factory.post('/api/fiscal/ocr/', payload, format='json'),
            tenant=t, data=payload,
        )
        request.user = MagicMock(is_authenticated=True)
        view = OCRNFeView()
        resp = view.post(request)
        assert resp.status_code == 200
        data = resp.data
        assert data.get('items') == [] or data.get('supplier') == {}


@pytest.mark.django_db
class TestFiscalDocumentViewSetActions:
    def _make_doc(self):
        from fiscal.models import FiscalDocument
        from sales.models import CashSession, Sale

        t = _make_tenant('FDV', 'fdv-ctx')
        user = User.objects.create_user(email='fdv@test.local', password='pass123')

        def _create():
            from catalog.models import Product, Unit
            unit = Unit.all_objects.create(tenant=t, symbol='UN', name='Un')
            Product.all_objects.create(tenant=t, sku='FDV-P', name='P', base_unit=unit)
            company = Company.all_objects.create(tenant=t, name='FDVCo')
            branch = Branch.all_objects.create(tenant=t, company=company, name='FDVBr')
            cash = CashSession.all_objects.create(
                tenant=t, branch=branch, operator=user,
                opening_amount=Decimal('0'), expected_amount=Decimal('0'),
            )
            sale = Sale.all_objects.create(
                tenant=t, branch=branch, cash_session=cash,
                operator=user, status='confirmed',
                gross_total=Decimal('10'), discount_total=Decimal('0'),
                net_total=Decimal('10'),
            )
            doc = FiscalDocument.all_objects.create(
                tenant=t, sale=sale, status=FiscalDocument.STATUS_QUEUED,
            )
            return {'tenant': t, 'user': user, 'doc': doc, 'sale': sale}

        return _run_in_tenant(t, _create)

    def _get_view(self, ctx, action):
        from fiscal.views import FiscalDocumentViewSet
        factory = APIRequestFactory()
        if action == 'cancel':
            request = factory.post(
                f'/api/fiscal/documents/{ctx["doc"].id}/cancel/',
                {'reason': 'test'}, format='json',
            )
        elif action == 'retry':
            request = factory.post(
                f'/api/fiscal/documents/{ctx["doc"].id}/retry/',
                {'reason': 'test'}, format='json',
            )
        elif action == 'xml':
            request = factory.get(f'/api/fiscal/documents/{ctx["doc"].id}/xml/')
        elif action == 'pdf':
            request = factory.get(f'/api/fiscal/documents/{ctx["doc"].id}/pdf/')
        else:
            request = factory.get(f'/api/fiscal/documents/{ctx["doc"].id}/')
        request = _wrap_drf(request, tenant=ctx['tenant'], user=ctx['user'])
        view = FiscalDocumentViewSet()
        view.kwargs = {'pk': str(ctx['doc'].id)}
        view.request = request
        view.format_kwarg = None
        return view, request

    def test_cancel_already_cancelled(self):
        from fiscal.models import FiscalDocument
        ctx = self._make_doc()
        FiscalDocument.all_objects.filter(pk=ctx['doc'].pk).update(
            status=FiscalDocument.STATUS_CANCELLED
        )
        ctx['doc'].refresh_from_db()
        view, request = self._get_view(ctx, 'cancel')
        resp = view.cancel(request, pk=str(ctx['doc'].id))
        assert resp.status_code == 409

    def test_cancel_missing_reason(self):
        from fiscal.views import FiscalDocumentViewSet
        ctx = self._make_doc()
        factory = APIRequestFactory()
        request = _wrap_drf(
            factory.post(f'/api/fiscal/documents/{ctx["doc"].id}/cancel/', {}, format='json'),
            tenant=ctx['tenant'], user=ctx['user'], data={},
        )
        view = FiscalDocumentViewSet()
        view.kwargs = {'pk': str(ctx['doc'].id)}
        view.request = request
        view.format_kwarg = None
        resp = view.cancel(request, pk=str(ctx['doc'].id))
        assert resp.status_code == 422

    def test_retry_concluded_conflict(self):
        from fiscal.models import FiscalDocument
        ctx = self._make_doc()
        FiscalDocument.all_objects.filter(pk=ctx['doc'].pk).update(
            status=FiscalDocument.STATUS_CONCLUDED
        )
        ctx['doc'].refresh_from_db()
        view, request = self._get_view(ctx, 'retry')
        resp = view.retry(request, pk=str(ctx['doc'].id))
        assert resp.status_code == 409

    def test_retry_missing_reason(self):
        from fiscal.views import FiscalDocumentViewSet
        ctx = self._make_doc()
        factory = APIRequestFactory()
        request = _wrap_drf(
            factory.post(f'/api/fiscal/documents/{ctx["doc"].id}/retry/', {}, format='json'),
            tenant=ctx['tenant'], user=ctx['user'], data={},
        )
        view = FiscalDocumentViewSet()
        view.kwargs = {'pk': str(ctx['doc'].id)}
        view.request = request
        view.format_kwarg = None
        resp = view.retry(request, pk=str(ctx['doc'].id))
        assert resp.status_code == 422

    def test_xml_download_not_concluded(self):
        ctx = self._make_doc()
        view, request = self._get_view(ctx, 'xml')
        resp = view.xml(request, pk=str(ctx['doc'].id))
        assert resp.status_code == 403

    def test_xml_download_concluded(self):
        from fiscal.models import FiscalDocument
        ctx = self._make_doc()
        FiscalDocument.all_objects.filter(pk=ctx['doc'].pk).update(
            status=FiscalDocument.STATUS_CONCLUDED
        )
        ctx['doc'].refresh_from_db()
        view, request = self._get_view(ctx, 'xml')
        resp = view.xml(request, pk=str(ctx['doc'].id))
        assert resp.status_code == 200
        assert b'nfe' in resp.content

    def test_pdf_download_forbidden(self):
        ctx = self._make_doc()
        view, request = self._get_view(ctx, 'pdf')
        resp = view.pdf(request, pk=str(ctx['doc'].id))
        assert resp.status_code == 403

    def test_pdf_download_concluded(self):
        from fiscal.models import FiscalDocument
        ctx = self._make_doc()
        FiscalDocument.all_objects.filter(pk=ctx['doc'].pk).update(
            status=FiscalDocument.STATUS_CONCLUDED
        )
        ctx['doc'].refresh_from_db()
        view, request = self._get_view(ctx, 'pdf')
        resp = view.pdf(request, pk=str(ctx['doc'].id))
        assert resp.status_code == 200
        assert b'%PDF' in resp.content

    def test_get_serializer_class_detail_vs_list(self):
        from fiscal.views import FiscalDocumentViewSet
        view = FiscalDocumentViewSet()
        view.action = 'retrieve'
        assert view.get_serializer_class().__name__ == 'FiscalDocumentDetailSerializer'
        view.action = 'list'
        assert view.get_serializer_class().__name__ == 'FiscalDocumentSerializer'


@pytest.mark.django_db
class TestFiscalEmitterViewSetActions:
    def test_get_serializer_class_write_vs_read(self):
        from fiscal.views import FiscalEmitterViewSet
        view = FiscalEmitterViewSet()
        view.action = 'create'
        assert view.get_serializer_class().__name__ == 'FiscalEmitterWriteSerializer'
        view.action = 'list'
        assert view.get_serializer_class().__name__ == 'FiscalEmitterSerializer'


@pytest.mark.django_db
class TestFiscalProductConfigViewSetActions:
    def test_upsert_existing_config(self):
        from fiscal.models import FiscalProductConfig
        from fiscal.views import FiscalProductConfigViewSet
        t = _make_tenant('FPC', 'fpc-ctx')
        user = User.objects.create_user(email='fpc@test.local', password='pass123')

        def _create():
            from catalog.models import Product, Unit
            unit = Unit.all_objects.create(tenant=t, symbol='UN', name='Un')
            product = Product.all_objects.create(
                tenant=t, sku='FPC-P', name='P', base_unit=unit,
            )
            existing = FiscalProductConfig.all_objects.create(
                tenant=t, product=product, cst_icms='00',
            )
            factory = APIRequestFactory()
            payload = {
                'product': str(product.id),
                'cst_icms': '10',
                'origem': '1',
            }
            request = _wrap_drf(
                factory.post('/api/fiscal/product-configs/', payload, format='json'),
                tenant=t, user=user, data=payload,
            )
            view = FiscalProductConfigViewSet()
            view.kwargs = {}
            view.request = request
            view.format_kwarg = None
            resp = view.create(request)
            assert resp.status_code == 200
            existing.refresh_from_db()
            assert existing.cst_icms == '10'

        _run_in_tenant(t, _create)


# =============================================================================
# CATALOG SERVICES — product_extensions.py
# =============================================================================


@pytest.mark.django_db
class TestUpsertProductFiscalData:
    def test_create_new(self):
        from catalog.models import Product, Unit
        from catalog.services.product_extensions import upsert_product_fiscal_data
        t = _make_tenant('UFD1', 'ufd1')
        with pg_tenant_context(t):
            u = Unit.all_objects.create(tenant=t, symbol='un', name='Un')
            p = Product.all_objects.create(tenant=t, sku='UFD-P', name='P', base_unit=u)
            fd = upsert_product_fiscal_data(
                tenant=t, product=p, ncm='12345678', fiscal_type='revenda',
            )
            assert fd.pk is not None
            assert fd.ncm == '12345678'
            assert fd.fiscal_type == 'revenda'

    def test_update_existing(self):
        from catalog.models import Product, ProductFiscalData, Unit
        from catalog.services.product_extensions import upsert_product_fiscal_data
        t = _make_tenant('UFD2', 'ufd2')
        with pg_tenant_context(t):
            u = Unit.all_objects.create(tenant=t, symbol='un', name='Un')
            p = Product.all_objects.create(tenant=t, sku='UFD-U', name='P', base_unit=u)
            ProductFiscalData.all_objects.create(
                tenant=t, product=p, ncm='00000000', fiscal_type='',
            )
            fd = upsert_product_fiscal_data(
                tenant=t, product=p, ncm='99999999', fiscal_type='servico',
            )
            assert fd.ncm == '99999999'
            assert fd.fiscal_type == 'servico'


@pytest.mark.django_db
class TestAddProductPriceTier:
    def test_create_tier(self):
        from catalog.models import Product, Unit
        from catalog.services.product_extensions import add_product_price_tier
        t = _make_tenant('APT1', 'apt1')
        with pg_tenant_context(t):
            u = Unit.all_objects.create(tenant=t, symbol='un', name='Un')
            p = Product.all_objects.create(tenant=t, sku='APT-P', name='P', base_unit=u)
            tier = add_product_price_tier(
                tenant=t, product=p, min_quantity=Decimal('10'), amount=Decimal('8.5'),
            )
            assert tier.pk is not None
            assert tier.min_quantity == Decimal('10')

    def test_inactive_product_raises(self):
        from catalog.models import Product, Unit
        from catalog.services.product_extensions import add_product_price_tier
        t = _make_tenant('APT2', 'apt2')
        with pg_tenant_context(t):
            u = Unit.all_objects.create(tenant=t, symbol='un', name='Un')
            p = Product.all_objects.create(
                tenant=t, sku='APT-I', name='P', base_unit=u, is_active=False,
            )
            with pytest.raises(ValidationError):
                add_product_price_tier(
                    tenant=t, product=p, min_quantity=Decimal('1'),
                    amount=Decimal('5'),
                )


@pytest.mark.django_db
class TestResolveComposition:
    def test_returns_component_data(self):
        from catalog.models import Product, ProductComposition, Unit
        from catalog.services.product_extensions import resolve_composition
        t = _make_tenant('RC1', 'rc1')
        with pg_tenant_context(t):
            u = Unit.all_objects.create(tenant=t, symbol='un', name='Un')
            kit = Product.all_objects.create(
                tenant=t, sku='RC-KIT', name='Kit', base_unit=u, product_kind='kit',
            )
            c1 = Product.all_objects.create(tenant=t, sku='RC-C1', name='C1', base_unit=u)
            c2 = Product.all_objects.create(tenant=t, sku='RC-C2', name='C2', base_unit=u)
            ProductComposition.all_objects.create(
                tenant=t, kit=kit, component=c1, quantity=Decimal('3'),
            )
            ProductComposition.all_objects.create(
                tenant=t, kit=kit, component=c2, quantity=Decimal('1'),
            )
            result = resolve_composition(tenant=t, kit_product_id=kit.id)
            assert len(result) == 2
            ids_qtys = {(r[0], r[2]) for r in result}
            assert (c1.id, Decimal('3')) in ids_qtys
            assert (c2.id, Decimal('1')) in ids_qtys

    def test_empty_for_kit_without_composition(self):
        from catalog.models import Product, Unit
        from catalog.services.product_extensions import resolve_composition
        t = _make_tenant('RC2', 'rc2')
        with pg_tenant_context(t):
            u = Unit.all_objects.create(tenant=t, symbol='un', name='Un')
            kit = Product.all_objects.create(
                tenant=t, sku='RC-EMPTY', name='Kit', base_unit=u, product_kind='kit',
            )
            result = resolve_composition(tenant=t, kit_product_id=kit.id)
            assert result == []

    def test_excludes_inactive_compositions(self):
        from catalog.models import Product, ProductComposition, Unit
        from catalog.services.product_extensions import resolve_composition
        t = _make_tenant('RC3', 'rc3')
        with pg_tenant_context(t):
            u = Unit.all_objects.create(tenant=t, symbol='un', name='Un')
            kit = Product.all_objects.create(
                tenant=t, sku='RC-INACT', name='Kit', base_unit=u, product_kind='kit',
            )
            c1 = Product.all_objects.create(tenant=t, sku='RC-IC1', name='C', base_unit=u)
            ProductComposition.all_objects.create(
                tenant=t, kit=kit, component=c1, quantity=Decimal('1'), is_active=False,
            )
            result = resolve_composition(tenant=t, kit_product_id=kit.id)
            assert result == []
