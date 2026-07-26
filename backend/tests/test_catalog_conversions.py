from decimal import Decimal

import pytest

from catalog.services.codes import validate_gtin
from catalog.services.conversions import to_base_quantity


def test_conversion_uses_decimal_and_unit_precision():
    assert to_base_quantity(Decimal('1.250'), Decimal('20')) == Decimal('25.000')


def test_conversion_rejects_zero_quantity():
    with pytest.raises(ValueError):
        to_base_quantity(Decimal('0'), Decimal('20'))


def test_conversion_rejects_negative_factor():
    with pytest.raises(ValueError):
        to_base_quantity(Decimal('1'), Decimal('-5'))


def test_conversion_rejects_zero_factor():
    with pytest.raises(ValueError):
        to_base_quantity(Decimal('1'), Decimal('0'))


@pytest.mark.parametrize('code', ['7894900011517', '7891000315507'])
def test_valid_gtin_check_digit(code):
    assert validate_gtin(code) is True


def test_invalid_gtin_check_digit():
    assert validate_gtin('7894900011518') is False


def test_invalid_gtin_wrong_length():
    assert validate_gtin('12345') is False


def test_invalid_gtin_non_digit():
    assert validate_gtin('789490001151A') is False
