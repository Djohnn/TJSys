from django.urls import path

from pdv.views import SyncBatchesView

urlpatterns = [
    path('sync-batches/', SyncBatchesView.as_view(), name='pdv-sync-batches'),
]
