"""Sprint 22 — application services for product extensions.

- upsert_product_fiscal_data: create or update ProductFiscalData (1:1).
- add_product_price_tier: create ProductPriceTier for active product.
"""

from django.core.exceptions import ValidationError
from django.db import transaction

from catalog.models import ProductFiscalData, ProductPriceTier


@transaction.atomic
def upsert_product_fiscal_data(*, tenant, product, **fields):
    """Create or update ProductFiscalData 1:1 for a product.

    If fiscal_data already exists, update the record. Otherwise create.
    """
    existing = ProductFiscalData.all_objects.filter(
        tenant=tenant,
        product=product,
    ).first()

    if existing is not None:
        for field, value in fields.items():
            setattr(existing, field, value)
        existing.full_clean()
        existing.save()
        return existing

    obj = ProductFiscalData(tenant=tenant, product=product, **fields)
    obj.full_clean()
    obj.save()
    return obj


@transaction.atomic
def add_product_price_tier(*, tenant, product, min_quantity, amount, price=None):
    """Create a new ProductPriceTier for an active product.

    Raises ValidationError if the product is inactive or min_quantity <= 0.
    """
    if not product.is_active:
        raise ValidationError({'product': 'Cannot add price tiers to an inactive product.'})

    tier = ProductPriceTier(
        tenant=tenant,
        product=product,
        min_quantity=min_quantity,
        amount=amount,
        price=price,
    )
    tier.full_clean()
    tier.save()
    return tier
