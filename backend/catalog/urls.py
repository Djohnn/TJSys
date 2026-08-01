from django.urls import include, path
from rest_framework.routers import DefaultRouter

from catalog.views import (
    BranchPriceViewSet,
    BrandViewSet,
    CategoryViewSet,
    EffectivePriceView,
    ProductCodeViewSet,
    ProductFiscalDataView,
    ProductImageViewSet,
    ProductPriceTierViewSet,
    ProductPriceViewSet,
    ProductUnitViewSet,
    ProductViewSet,
    UnitViewSet,
)

router = DefaultRouter()
router.register('categories', CategoryViewSet, basename='category')
router.register('units', UnitViewSet, basename='unit')
router.register('products', ProductViewSet, basename='product')
router.register('brands', BrandViewSet, basename='brand')

urlpatterns = [
    path('', include(router.urls)),
    path(
        'products/<uuid:product_id>/effective-price/',
        EffectivePriceView.as_view(),
        name='product-effective-price',
    ),
    path(
        'products/<uuid:product_pk>/units/',
        ProductUnitViewSet.as_view(
            {
                'get': 'list',
                'post': 'create',
            }
        ),
        name='product-unit-list',
    ),
    path(
        'products/<uuid:product_pk>/units/<uuid:pk>/',
        ProductUnitViewSet.as_view(
            {
                'get': 'retrieve',
                'put': 'update',
                'patch': 'partial_update',
                'delete': 'destroy',
            }
        ),
        name='product-unit-detail',
    ),
    path(
        'products/<uuid:product_pk>/codes/',
        ProductCodeViewSet.as_view(
            {
                'get': 'list',
                'post': 'create',
            }
        ),
        name='product-code-list',
    ),
    path(
        'products/<uuid:product_pk>/codes/<uuid:pk>/',
        ProductCodeViewSet.as_view(
            {
                'get': 'retrieve',
                'put': 'update',
                'patch': 'partial_update',
                'delete': 'destroy',
            }
        ),
        name='product-code-detail',
    ),
    path(
        'products/<uuid:product_pk>/prices/',
        ProductPriceViewSet.as_view(
            {
                'get': 'list',
                'post': 'create',
            }
        ),
        name='product-price-list',
    ),
    path(
        'products/<uuid:product_pk>/prices/<uuid:pk>/',
        ProductPriceViewSet.as_view(
            {
                'get': 'retrieve',
                'put': 'update',
                'patch': 'partial_update',
                'delete': 'destroy',
            }
        ),
        name='product-price-detail',
    ),
    path(
        'products/<uuid:product_pk>/branch-prices/',
        BranchPriceViewSet.as_view(
            {
                'get': 'list',
                'post': 'create',
            }
        ),
        name='branch-price-list',
    ),
    path(
        'products/<uuid:product_pk>/branch-prices/<uuid:pk>/',
        BranchPriceViewSet.as_view(
            {
                'get': 'retrieve',
                'put': 'update',
                'patch': 'partial_update',
                'delete': 'destroy',
            }
        ),
        name='branch-price-detail',
    ),
    # Sprint 22 — ProductFiscalData (1:1)
    path(
        'products/<uuid:product_pk>/fiscal-data/',
        ProductFiscalDataView.as_view(),
        name='product-fiscal-data',
    ),
    # Sprint 22 — ProductPriceTier (collection)
    path(
        'products/<uuid:product_pk>/price-tiers/',
        ProductPriceTierViewSet.as_view(
            {
                'get': 'list',
                'post': 'create',
            }
        ),
        name='product-price-tier-list',
    ),
    path(
        'products/<uuid:product_pk>/price-tiers/<uuid:pk>/',
        ProductPriceTierViewSet.as_view(
            {
                'get': 'retrieve',
                'delete': 'destroy',
            }
        ),
        name='product-price-tier-detail',
    ),
    # Sprint 24 — ProductImage (collection nested under product)
    path(
        'products/<uuid:product_pk>/images/',
        ProductImageViewSet.as_view({'get': 'list', 'post': 'create'}),
        name='product-image-list',
    ),
    path(
        'products/<uuid:product_pk>/images/<uuid:pk>/',
        ProductImageViewSet.as_view({'get': 'retrieve', 'delete': 'destroy'}),
        name='product-image-detail',
    ),
]
