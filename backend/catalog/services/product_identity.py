from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction

from catalog.models import ProductCode, TenantProductCodeSequence


def _ean13_check_digit(body: str) -> str:
    total = sum(int(digit) * (1 if index % 2 == 0 else 3) for index, digit in enumerate(body))
    return str((10 - (total % 10)) % 10)


def _validate_ean13(value: str) -> str:
    normalized = value.strip()
    if len(normalized) != 13 or not normalized.isdigit():
        raise ValidationError({'barcode': 'Barcode must contain exactly 13 digits.'})
    return normalized


def _initial_sequence_value(tenant_id) -> int:
    # UUID entropy keeps the first generated code distinct across tenants while
    # the locked row preserves monotonic allocation inside each tenant.
    return (tenant_id.int % 10_000_000_000) if hasattr(tenant_id, 'int') else 0


@transaction.atomic
def create_product_ean(*, tenant, product, requested_value=''):
    """Create the principal EAN code for a product in the caller transaction."""
    if requested_value:
        value = _validate_ean13(requested_value)
    else:
        sequence, _ = TenantProductCodeSequence.all_objects.get_or_create(
            tenant=tenant,
            defaults={'next_value': _initial_sequence_value(tenant.id)},
        )
        sequence = TenantProductCodeSequence.all_objects.select_for_update().get(pk=sequence.pk)
        body = f'20{sequence.next_value:010d}'
        value = body + _ean13_check_digit(body)
        sequence.next_value = (sequence.next_value + 1) % 10_000_000_000
        sequence.save(update_fields=['next_value', 'updated_at'])

    try:
        return ProductCode.all_objects.create(
            tenant=tenant,
            product=product,
            code_type='ean',
            value=value,
            is_principal=True,
            is_active=True,
        )
    except IntegrityError as exc:
        raise ValidationError({'barcode': 'Barcode is already active for this tenant.'}) from exc
