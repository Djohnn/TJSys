from django.urls import path

from catalog.views import R4ProductPriceViewSet

urlpatterns = [
    path(
        'products/<uuid:product_pk>/prices/',
        R4ProductPriceViewSet.as_view({'get': 'list', 'post': 'create'}),
        name='r4-product-price-list',
    ),
]
