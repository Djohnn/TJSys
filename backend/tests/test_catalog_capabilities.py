import pytest

from tenancy.capabilities import role_allows


@pytest.mark.parametrize(
    ('role', 'capability', 'allowed'),
    [
        ('admin', 'catalog.view', True),
        ('admin', 'catalog.manage', True),
        ('admin', 'pricing.view', True),
        ('admin', 'pricing.manage', True),
        ('manager', 'catalog.view', True),
        ('manager', 'catalog.manage', True),
        ('manager', 'pricing.view', True),
        ('manager', 'pricing.manage', True),
        ('operator', 'catalog.view', True),
        ('operator', 'catalog.manage', False),
        ('operator', 'pricing.view', True),
        ('operator', 'pricing.manage', False),
    ],
)
def test_catalog_capability_matrix(role, capability, allowed):
    assert role_allows(role, capability) is allowed
