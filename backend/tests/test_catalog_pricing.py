import contextlib
from decimal import Decimal

import pytest
from django.db import connection, transaction
from django.utils import timezone

from catalog.models import BranchPrice, Product, ProductPrice, Unit
from catalog.services.pricing import PriceNotAvailable, resolve_effective_price
from tenancy.context import reset_current_tenant_id, set_current_tenant_id
from tenancy.models import Branch, Company, Tenant


@contextlib.contextmanager
def pg_tenant_context(tenant):
    """Context manager que define o tenant no contexto PG (igual ao middleware)."""
    token = set_current_tenant_id(tenant.id)
    try:
        with transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT set_config('app.current_tenant_id', %s, true)", [str(tenant.id)]
                )
            yield
    finally:
        reset_current_tenant_id(token)


def _run_in_tenant(tenant, callback):
    token = set_current_tenant_id(tenant.id)
    try:
        with connection.cursor() as cursor:
            cursor.execute('SET app.current_tenant_id = %s', [str(tenant.id)])
        return callback()
    finally:
        reset_current_tenant_id(token)


@pytest.fixture
def pricing_tenant():
    return Tenant.objects.create(name='Price', slug='price-catalog')


@pytest.fixture
def pricing_unit(pricing_tenant):
    return _run_in_tenant(
        pricing_tenant,
        lambda: Unit.all_objects.create(
            tenant=pricing_tenant,
            symbol='kg',
            name='Kg',
            precision=3,
        ),
    )


@pytest.fixture
def pricing_product(pricing_tenant, pricing_unit):
    return _run_in_tenant(
        pricing_tenant,
        lambda: Product.all_objects.create(
            tenant=pricing_tenant,
            sku='P-PRICE',
            name='PPrice',
            base_unit=pricing_unit,
        ),
    )


@pytest.fixture
def pricing_company(pricing_tenant):
    return _run_in_tenant(
        pricing_tenant,
        lambda: Company.objects.create(tenant=pricing_tenant, name='PriceCo'),
    )


@pytest.fixture
def pricing_branch(pricing_company, pricing_tenant):
    return _run_in_tenant(
        pricing_tenant,
        lambda: Branch.objects.create(
            company=pricing_company,
            tenant=pricing_tenant,
            name='PriceBranch',
        ),
    )


@pytest.fixture
def other_branch(pricing_company, pricing_tenant):
    return _run_in_tenant(
        pricing_tenant,
        lambda: Branch.objects.create(
            company=pricing_company,
            tenant=pricing_tenant,
            name='OtherBranch',
        ),
    )


@pytest.fixture
def tenant_price(pricing_tenant, pricing_product):
    now = timezone.now()
    return _run_in_tenant(
        pricing_tenant,
        lambda: ProductPrice.all_objects.create(
            tenant=pricing_tenant,
            product=pricing_product,
            amount=Decimal('13.90'),
            valid_from=now,
            valid_to=None,
        ),
    )


@pytest.fixture
def branch_price(pricing_tenant, pricing_product, pricing_branch):
    now = timezone.now()
    return _run_in_tenant(
        pricing_tenant,
        lambda: BranchPrice.all_objects.create(
            tenant=pricing_tenant,
            product=pricing_product,
            branch=pricing_branch,
            amount=Decimal('12.90'),
            valid_from=now,
            valid_to=None,
        ),
    )


@pytest.mark.django_db
def test_branch_price_overrides_tenant_default(
    pricing_tenant,
    pricing_product,
    pricing_branch,
    tenant_price,
    branch_price,
):
    def _assert():
        result = resolve_effective_price(
            product=pricing_product,
            branch=pricing_branch,
            at=timezone.now(),
        )
        assert result.amount == Decimal('12.90')

    _run_in_tenant(pricing_tenant, _assert)


@pytest.mark.django_db
def test_default_price_is_used_without_branch_override(
    pricing_tenant,
    pricing_product,
    other_branch,
    tenant_price,
):
    def _assert():
        result = resolve_effective_price(
            product=pricing_product,
            branch=other_branch,
            at=timezone.now(),
        )
        assert result.amount == Decimal('13.90')

    _run_in_tenant(pricing_tenant, _assert)


@pytest.mark.django_db
def test_price_not_available_raises(pricing_tenant, pricing_product, pricing_branch):
    def _assert():
        with pytest.raises(PriceNotAvailable):
            resolve_effective_price(
                product=pricing_product,
                branch=pricing_branch,
                at=timezone.now(),
            )

    _run_in_tenant(pricing_tenant, _assert)


@pytest.mark.django_db
def test_price_amount_cannot_be_negative(pricing_tenant, pricing_product):
    from django.core.exceptions import ValidationError

    now = timezone.now()
    price = ProductPrice(
        tenant=pricing_tenant,
        product=pricing_product,
        amount=Decimal('-1.00'),
        valid_from=now,
    )
    with pytest.raises(ValidationError):
        price.full_clean()


@pytest.mark.django_db
def test_overlapping_tenant_prices_are_rejected(pricing_tenant, pricing_product):
    now = timezone.now()
    from datetime import timedelta

    ProductPrice.all_objects.create(
        tenant=pricing_tenant,
        product=pricing_product,
        amount=Decimal('10.00'),
        valid_from=now,
        valid_to=now + timedelta(days=10),
    )
    from django.core.exceptions import ValidationError

    price2 = ProductPrice(
        tenant=pricing_tenant,
        product=pricing_product,
        amount=Decimal('20.00'),
        valid_from=now + timedelta(days=5),
        valid_to=now + timedelta(days=15),
    )
    with pytest.raises(ValidationError):
        price2.full_clean()


@pytest.mark.django_db
def test_branch_price_tenant_must_match_branch_tenant():
    from django.core.exceptions import ValidationError

    tenant_a = Tenant.objects.create(name='A', slug='bp-a')
    tenant_b = Tenant.objects.create(name='B', slug='bp-b')
    with pg_tenant_context(tenant_b):
        unit = Unit.all_objects.create(tenant=tenant_b, symbol='kg', name='Kg', precision=3)
        product = Product.all_objects.create(
            tenant=tenant_b,
            sku='BP',
            name='BP',
            base_unit=unit,
        )
    branch = _run_in_tenant(
        tenant_b,
        lambda: Branch.objects.create(
            company=Company.objects.create(tenant=tenant_b, name='Co'),
            tenant=tenant_b,
            name='Br',
        ),
    )
    price = BranchPrice(
        tenant=tenant_a,
        product=product,
        branch=branch,
        amount=Decimal('5.00'),
        valid_from=timezone.now(),
    )
    with pytest.raises(ValidationError):
        price.full_clean()
