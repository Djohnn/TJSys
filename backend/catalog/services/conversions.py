from decimal import Decimal


def to_base_quantity(quantity: Decimal, factor: Decimal) -> Decimal:
    if quantity <= 0 or factor <= 0:
        raise ValueError('Quantity and factor must be positive.')
    return quantity * factor
