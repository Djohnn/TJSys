from django.contrib import admin

from .models import AuditRecord


@admin.register(AuditRecord)
class AuditRecordAdmin(admin.ModelAdmin):
    list_display = ['created_at', 'action', 'resource_type', 'resource_id', 'actor']
    list_filter = ['action', 'resource_type']
    search_fields = ['resource_id', 'actor__email']
    readonly_fields = [
        'id',
        'actor',
        'action',
        'resource_type',
        'resource_id',
        'detail',
        'correlation_id',
        'tenant_id',
        'created_at',
    ]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
