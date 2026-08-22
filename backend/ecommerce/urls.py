from django.urls import include, path
from rest_framework.routers import DefaultRouter

from ecommerce.views import ChannelViewSet, MarketplaceViewSet, OnlineOrderViewSet

router = DefaultRouter()
router.register('channels', ChannelViewSet, basename='channel')
router.register('marketplaces', MarketplaceViewSet, basename='marketplace')
router.register('online-orders', OnlineOrderViewSet, basename='online-order')

urlpatterns = [
    path('', include(router.urls)),
]
