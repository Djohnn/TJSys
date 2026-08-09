"""Sprint 22 — application services for product extensions.

- upsert_product_fiscal_data: create or update ProductFiscalData (1:1).
- add_product_price_tier: create ProductPriceTier for active product.
"""

from django.core.exceptions import ValidationError
from django.db import transaction

from catalog.models import ProductComposition, ProductFiscalData, ProductPriceTier


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
    if price is None:
        raise ValidationError({'price': 'Base price is required.'})
    if price.tenant_id != tenant.id:
        raise ValidationError({'price': 'Base price must belong to the same tenant.'})
    if price.product_id != product.id:
        raise ValidationError({'price': 'Base price must belong to the same product.'})
    if not price.is_active:
        raise ValidationError({'price': 'Base price must be active.'})

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


def resolve_composition(*, tenant, kit_product_id):
    """Public contract: return list of {component_id, component_sku, quantity} for active kit."""
    return list(
        ProductComposition.all_objects
        .filter(tenant=tenant, kit_id=kit_product_id, is_active=True)
        .select_related('component')
        .values_list('component_id', 'component__sku', 'quantity')
    )
