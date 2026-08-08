from django.db.models import Q
from django.utils import timezone


def _effective_candidates(queryset, *, at):
    period = Q(valid_from__lte=at) & (Q(valid_to__isnull=True) | Q(valid_to__gt=at))
    return list(queryset.filter(is_active=True).filter(period)[:2])


def _unique_effective_price(queryset, *, at):
    """Return the sole effective price, or ``None`` when absent/ambiguous."""
    matches = _effective_candidates(queryset, at=at)
    return matches[0] if len(matches) == 1 else None


class PriceNotAvailable(Exception):
    def __init__(self, product_id, branch_id):
        self.product_id = product_id
        self.branch_id = branch_id
        super().__init__(f'No active price for product {product_id} at branch {branch_id}.')


def resolve_effective_price(*, product, branch, at=None):
    if at is None:
        at = timezone.now()
    from catalog.models import BranchPrice, ProductPrice

    branch_candidates = _effective_candidates(
        BranchPrice.objects.filter(product=product, branch=branch), at=at,
    )
    if len(branch_candidates) > 1:
        raise PriceNotAvailable(product.id, branch.id)
    branch_price = branch_candidates[0] if branch_candidates else None
    if branch_price is not None:
        return branch_price
    tenant_candidates = _effective_candidates(ProductPrice.objects.filter(product=product), at=at)
    tenant_price = tenant_candidates[0] if len(tenant_candidates) == 1 else None
    if tenant_price is not None:
        return tenant_price
    raise PriceNotAvailable(product.id, branch.id)
