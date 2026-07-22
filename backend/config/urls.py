from django.contrib import admin
from django.urls import include, path

from .views import health, readiness

urlpatterns = [
    path('health/', health, name='health'),
    path('readiness/', readiness, name='readiness'),
    path('api/v1/health/', health, name='api-health'),
    path('api/v1/monitoring/', include('monitoring.urls')),
    path('api/v1/readiness/', readiness, name='api-readiness'),
    path('api/v1/', include('accounts.urls')),
    path('api/v1/', include('tenancy.urls')),
    path('api/v1/', include('catalog.urls')),
    path('api/v1/', include('inventory.urls')),
    path('api/v1/', include('purchasing.urls')),
    path('api/v1/', include('financial.urls')),
    path('api/v1/', include('sales.urls')),
    path('api/v1/', include('fiscal.urls')),
    path('api/v1/', include('people.urls')),
    path('api/v1/', include('payments.urls')),
    path('api/v1/', include('platform_admin.urls')),
    path('admin/', admin.site.urls),
]
