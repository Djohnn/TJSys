import pytest
from django.urls import resolve, reverse


@pytest.mark.parametrize(
    'serializer_path',
    [
        'inventory.serializers.StockLocationSerializer',
        'inventory.serializers.StockLotSerializer',
        'inventory.serializers.StockOperationSerializer',
        'inventory.serializers.StockMovementSerializer',
        'inventory.serializers.StockBalanceSerializer',
    ],
)
def test_inventory_serializers_can_build_fields(serializer_path):
    module_name, class_name = serializer_path.rsplit('.', 1)
    module = __import__(module_name, fromlist=[class_name])
    serializer_class = getattr(module, class_name)

    assert serializer_class().fields


def test_inventory_views_import_without_missing_permissions():
    import inventory.views  # noqa: F401


@pytest.mark.parametrize(
    'url_name',
    [
        'stocklocation-list',
        'lot-list',
        'stockoperation-list',
        'movement-list',
        'balance-list',
    ],
)
def test_inventory_routes_are_registered(url_name):
    url = reverse(url_name)

    assert resolve(url).url_name == url_name
