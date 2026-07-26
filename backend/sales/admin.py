from django.contrib import admin

from .models import Sale, SaleItem, SalePayment


class SaleItemInline(admin.TabularInline):
    model = SaleItem
    extra = 0
    readonly_fields = [
        'product',
        'unit',
        'quantity',
        'factor',
        'unit_price',
        'discount_amount',
        'line_total',
    ]
    can_delete = False

    def get_queryset(self, request):
        return SaleItem.all_objects.all()

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


class SalePaymentInline(admin.TabularInline):
    model = SalePayment
    extra = 0
    readonly_fields = ['method', 'amount', 'reference']
    can_delete = False

    def get_queryset(self, request):
        return SalePayment.all_objects.all()

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Sale)
class SaleAdmin(admin.ModelAdmin):
    list_display = [
        'id',
        'tenant',
        'branch',
        'cash_session',
        'operator',
        'status',
        'gross_total',
        'discount_total',
        'net_total',
        'created_at',
    ]
    list_filter = ['status', 'tenant', 'branch', 'created_at']
    search_fields = ['id', 'branch__name', 'operator__email']
    readonly_fields = [
        'id',
        'tenant',
        'branch',
        'cash_session',
        'operator',
        'status',
        'gross_total',
        'discount_total',
        'net_total',
        'idempotency_key',
        'payload_hash',
        'created_at',
        'updated_at',
    ]
    inlines = [SaleItemInline, SalePaymentInline]

    def get_queryset(self, request):
        return Sale.all_objects.select_related('tenant', 'branch', 'operator')

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
