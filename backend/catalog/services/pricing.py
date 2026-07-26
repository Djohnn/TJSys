from django.db.models import Q
from django.utils import timezone


class PriceNotAvailable(Exception):
    def __init__(self, product_id, branch_id):
        self.product_id = product_id
        self.branch_id = branch_id
        super().__init__(f'No active price for product {product_id} at branch {branch_id}.')


def resolve_effective_price(*, product, branch, at=None):
    if at is None:
        at = timezone.now()
    period = Q(valid_from__lte=at) & (Q(valid_to__isnull=True) | Q(valid_to__gt=at))
    from catalog.models import BranchPrice, ProductPrice

    branch_price = (
        BranchPrice.objects.filter(
            product=product,
            branch=branch,
        )
        .filter(period)
        .first()
    )
    if branch_price is not None:
        return branch_price
    tenant_price = ProductPrice.objects.filter(product=product).filter(period).first()
    if tenant_price is not None:
        return tenant_price
    raise PriceNotAvailable(product.id, branch.id)
