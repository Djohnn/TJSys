from django.contrib import admin

from .models import OutboxMessage


@admin.register(OutboxMessage)
class OutboxMessageAdmin(admin.ModelAdmin):
    list_display = [
        'created_at',
        'event_type',
        'aggregate_type',
        'aggregate_id',
        'status',
        'retry_count',
    ]
    list_filter = ['event_type', 'status']
    search_fields = ['aggregate_id']
    readonly_fields = ['id', 'created_at', 'published_at']
