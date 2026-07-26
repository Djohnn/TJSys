import pytest

from tenancy.capabilities import role_allows


@pytest.mark.parametrize(
    ('role', 'capability', 'allowed'),
    [
        ('admin', 'inventory.view', True),
        ('admin', 'inventory.receive', True),
        ('admin', 'inventory.issue', True),
        ('admin', 'inventory.transfer', True),
        ('admin', 'inventory.adjust', True),
        ('admin', 'inventory.locations.manage', True),
        ('manager', 'inventory.view', True),
        ('manager', 'inventory.receive', True),
        ('manager', 'inventory.issue', True),
        ('manager', 'inventory.transfer', True),
        ('manager', 'inventory.adjust', True),
        ('manager', 'inventory.locations.manage', True),
        ('operator', 'inventory.view', True),
        ('operator', 'inventory.receive', True),
        ('operator', 'inventory.issue', True),
        ('operator', 'inventory.transfer', False),
        ('operator', 'inventory.adjust', False),
        ('operator', 'inventory.locations.manage', False),
    ],
)
def test_inventory_capability_matrix(role, capability, allowed):
    assert role_allows(role, capability) is allowed
