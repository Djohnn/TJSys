from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from purchasing.models import (
    PurchaseOrder,
    PurchaseOrderCancellation,
    PurchaseOrderItem,
    PurchaseReceipt,
    PurchaseReceiptCancellation,
    PurchaseReceiptItem,
    RecurringPurchaseOrderTemplate,
    RecurringTemplateItem,
    Supplier,
    SupplierReturn,
    SupplierReturnItem,
)


class FullCleanModelSerializer(serializers.ModelSerializer):
    def _full_clean(self, instance):
        try:
            instance.full_clean()
        except DjangoValidationError as exc:
            if hasattr(exc, 'message_dict'):
                raise serializers.ValidationError(exc.message_dict) from exc
            raise serializers.ValidationError({'non_field_errors': exc.messages}) from exc

    def create(self, validated_data):
        instance = self.Meta.model(**validated_data)
        self._full_clean(instance)
        instance.save()
        return instance

    def update(self, instance, validated_data):
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        self._full_clean(instance)
        instance.save()
        return instance


class SupplierSerializer(FullCleanModelSerializer):
    class Meta:
        model = Supplier
        fields = [
            'id',
            'person',
            'name',
            'cnpj',
            'phone',
            'email',
            'created_at',
            'updated_at',
            'version',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'version']


class PurchaseOrderItemSerializer(FullCleanModelSerializer):
    product_sku = serializers.CharField(source='product.sku', read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True)
    unit_symbol = serializers.CharField(source='unit.symbol', read_only=True)
    line_total = serializers.DecimalField(
        max_digits=18,
        decimal_places=2,
        read_only=True,
    )

    class Meta:
        model = PurchaseOrderItem
        fields = [
            'id',
            'purchase_order',
            'product',
            'product_sku',
            'product_name',
            'unit',
            'unit_symbol',
            'quantity',
            'unit_cost',
            'factor',
            'line_total',
            'created_at',
            'updated_at',
            'version',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'version', 'line_total']


class PurchaseOrderListSerializer(FullCleanModelSerializer):
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    items_count = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseOrder
        fields = [
            'id',
            'supplier',
            'supplier_name',
            'branch',
            'branch_name',
            'status',
            'notes',
            'items_total',
            'items_count',
            'created_at',
            'updated_at',
            'version',
        ]
        read_only_fields = ['id', 'status', 'created_at', 'updated_at', 'version']

    def get_items_count(self, obj):
        return PurchaseOrderItem.all_objects.filter(purchase_order=obj).count()


class PurchaseOrderDetailSerializer(FullCleanModelSerializer):
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    items = PurchaseOrderItemSerializer(many=True, read_only=True)

    class Meta:
        model = PurchaseOrder
        fields = [
            'id',
            'supplier',
            'supplier_name',
            'branch',
            'branch_name',
            'status',
            'notes',
            'items_total',
            'items',
            'idempotency_key',
            'payload_hash',
            'created_at',
            'updated_at',
            'version',
        ]
        read_only_fields = [
            'id',
            'status',
            'items',
            'idempotency_key',
            'payload_hash',
            'created_at',
            'updated_at',
            'version',
        ]


class PurchaseReceiptItemSerializer(FullCleanModelSerializer):
    product_name = serializers.CharField(
        source='purchase_order_item.product.name',
        read_only=True,
    )
    product_sku = serializers.CharField(
        source='purchase_order_item.product.sku',
        read_only=True,
    )
    line_total = serializers.DecimalField(
        max_digits=18,
        decimal_places=2,
        read_only=True,
    )

    class Meta:
        model = PurchaseReceiptItem
        fields = [
            'id',
            'receipt',
            'purchase_order_item',
            'product_name',
            'product_sku',
            'quantity_received',
            'unit_cost',
            'line_total',
            'created_at',
            'updated_at',
            'version',
        ]
        read_only_fields = [
            'id',
            'receipt',
            'product_name',
            'product_sku',
            'line_total',
            'created_at',
            'updated_at',
            'version',
        ]


class PurchaseReceiptSerializer(FullCleanModelSerializer):
    purchase_order_status = serializers.CharField(
        source='purchase_order.status',
        read_only=True,
    )
    supplier_name = serializers.CharField(
        source='purchase_order.supplier.name',
        read_only=True,
    )
    items = PurchaseReceiptItemSerializer(many=True, read_only=True)

    class Meta:
        model = PurchaseReceipt
        fields = [
            'id',
            'purchase_order',
            'purchase_order_status',
            'supplier_name',
            'status',
            'notes',
            'items',
            'idempotency_key',
            'created_at',
            'updated_at',
            'version',
        ]
        read_only_fields = [
            'id',
            'purchase_order_status',
            'supplier_name',
            'status',
            'items',
            'idempotency_key',
            'created_at',
            'updated_at',
            'version',
        ]


class PurchaseOrderCancellationSerializer(FullCleanModelSerializer):
    class Meta:
        model = PurchaseOrderCancellation
        fields = [
            'id',
            'purchase_order',
            'reason',
            'status',
            'idempotency_key',
            'created_at',
            'updated_at',
            'version',
        ]
        read_only_fields = ['id', 'status', 'created_at', 'updated_at', 'version']


class PurchaseReceiptCancellationSerializer(FullCleanModelSerializer):
    class Meta:
        model = PurchaseReceiptCancellation
        fields = [
            'id',
            'receipt',
            'reason',
            'status',
            'idempotency_key',
            'created_at',
            'updated_at',
            'version',
        ]
        read_only_fields = ['id', 'status', 'created_at', 'updated_at', 'version']


class SupplierReturnItemSerializer(FullCleanModelSerializer):
    product_name = serializers.CharField(
        source='purchase_order_item.product.name',
        read_only=True,
    )
    product_sku = serializers.CharField(
        source='purchase_order_item.product.sku',
        read_only=True,
    )
    line_total = serializers.DecimalField(
        max_digits=18,
        decimal_places=2,
        read_only=True,
    )

    class Meta:
        model = SupplierReturnItem
        fields = [
            'id',
            'supplier_return',
            'purchase_order_item',
            'product_name',
            'product_sku',
            'quantity',
            'unit_cost',
            'line_total',
            'created_at',
            'updated_at',
            'version',
        ]
        read_only_fields = [
            'id',
            'supplier_return',
            'product_name',
            'product_sku',
            'line_total',
            'created_at',
            'updated_at',
            'version',
        ]


class SupplierReturnSerializer(FullCleanModelSerializer):
    items = SupplierReturnItemSerializer(many=True, read_only=True)

    class Meta:
        model = SupplierReturn
        fields = [
            'id',
            'receipt',
            'reason',
            'status',
            'items',
            'idempotency_key',
            'created_at',
            'updated_at',
            'version',
        ]
        read_only_fields = [
            'id',
            'status',
            'items',
            'idempotency_key',
            'created_at',
            'updated_at',
            'version',
        ]


class RecurringTemplateItemSerializer(FullCleanModelSerializer):
    product_sku = serializers.CharField(source='product.sku', read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True)
    unit_symbol = serializers.CharField(source='unit.symbol', read_only=True)
    line_total = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)

    class Meta:
        model = RecurringTemplateItem
        fields = [
            'id',
            'template',
            'product',
            'product_sku',
            'product_name',
            'unit',
            'unit_symbol',
            'quantity',
            'unit_cost',
            'factor',
            'line_total',
            'created_at',
            'updated_at',
            'version',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'version', 'line_total']


class RecurringPurchaseOrderTemplateSerializer(FullCleanModelSerializer):
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    items = RecurringTemplateItemSerializer(many=True, read_only=True)

    class Meta:
        model = RecurringPurchaseOrderTemplate
        fields = [
            'id',
            'supplier',
            'supplier_name',
            'branch',
            'branch_name',
            'frequency',
            'next_run',
            'is_active',
            'notes',
            'items',
            'created_at',
            'updated_at',
            'version',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'version']
