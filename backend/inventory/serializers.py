from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from inventory.models import (
    InventoryCount,
    InventoryCountItem,
    MovementReason,
    ProductStockPolicy,
    ReplenishmentOrder,
    ReplenishmentRule,
    StorageType,
    StockBalance,
    StockLocation,
    StockLot,
    StockMovement,
    StockOperation,
    StockOperationReversal,
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


class StockLocationSerializer(FullCleanModelSerializer):
    branch_name = serializers.CharField(source='branch.name', read_only=True)

    class Meta:
        model = StockLocation
        fields = [
            'id',
            'branch',
            'branch_name',
            'code',
            'name',
            'location_type',
            'is_primary',
            'is_active',
            'created_at',
            'updated_at',
            'version',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'version']


class StockLotSerializer(FullCleanModelSerializer):
    product_sku = serializers.CharField(source='product.sku', read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True)
    is_expired = serializers.BooleanField(read_only=True)

    class Meta:
        model = StockLot
        fields = [
            'id',
            'product',
            'product_sku',
            'product_name',
            'lot_number',
            'manufacture_date',
            'expiry_date',
            'is_active',
            'is_expired',
            'created_at',
            'updated_at',
            'version',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'version', 'is_expired']


class StockOperationSerializer(FullCleanModelSerializer):
    actor_email = serializers.EmailField(source='actor.email', read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)

    class Meta:
        model = StockOperation
        fields = [
            'id',
            'operation_type',
            'status',
            'branch',
            'branch_name',
            'actor',
            'actor_email',
            'idempotency_key',
            'reference',
            'reason',
            'created_at',
            'updated_at',
            'version',
        ]
        read_only_fields = ['id', 'actor', 'created_at', 'updated_at', 'version']


class StockMovementSerializer(FullCleanModelSerializer):
    product_sku = serializers.CharField(source='product.sku', read_only=True)
    location_code = serializers.CharField(source='location.code', read_only=True)
    lot_number = serializers.CharField(source='lot.lot_number', read_only=True)
    unit_symbol = serializers.CharField(source='unit.symbol', read_only=True)

    class Meta:
        model = StockMovement
        fields = [
            'id',
            'operation',
            'product',
            'product_sku',
            'location',
            'location_code',
            'lot',
            'lot_number',
            'direction',
            'quantity',
            'unit',
            'unit_symbol',
            'factor',
            'unit_cost',
            'notes',
            'created_at',
            'updated_at',
            'version',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'version']


class StockBalanceSerializer(FullCleanModelSerializer):
    product_sku = serializers.CharField(source='product.sku', read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True)
    location_code = serializers.CharField(source='location.code', read_only=True)
    location_name = serializers.CharField(source='location.name', read_only=True)
    lot_number = serializers.CharField(source='lot.lot_number', read_only=True)
    available = serializers.DecimalField(max_digits=18, decimal_places=6, read_only=True)

    class Meta:
        model = StockBalance
        fields = [
            'id',
            'product',
            'product_sku',
            'product_name',
            'location',
            'location_code',
            'location_name',
            'lot',
            'lot_number',
            'quantity',
            'reserved',
            'available',
            'created_at',
            'updated_at',
            'version',
        ]
        read_only_fields = [
            'id',
            'quantity',
            'reserved',
            'available',
            'created_at',
            'updated_at',
            'version',
        ]


class StockOperationReversalSerializer(FullCleanModelSerializer):
    class Meta:
        model = StockOperationReversal
        fields = [
            'id',
            'original_operation',
            'reversal_operation',
            'reason',
            'created_at',
            'updated_at',
            'version',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'version']


class StockControlDeactivateRequestSerializer(serializers.Serializer):
    command_id = serializers.UUIDField()
    correlation_id = serializers.UUIDField(required=False, allow_null=True)


class StockControlReactivateRequestSerializer(serializers.Serializer):
    command_id = serializers.UUIDField()
    correlation_id = serializers.UUIDField(required=False, allow_null=True)
    initial_stocks = serializers.ListField(
        child=serializers.DictField(),
        required=False,
        default=list,
    )


class ProductStockPolicySerializer(FullCleanModelSerializer):
    product_sku = serializers.CharField(source='product.sku', read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    location_code = serializers.CharField(source='location.code', read_only=True)
    location_name = serializers.CharField(source='location.name', read_only=True)

    class Meta:
        model = ProductStockPolicy
        fields = [
            'id',
            'product',
            'product_sku',
            'product_name',
            'branch',
            'branch_name',
            'location',
            'location_code',
            'location_name',
            'minimum_quantity',
            'maximum_quantity',
            'reorder_point',
            'allow_negative',
            'is_active',
            'created_at',
            'updated_at',
            'version',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'version']

class StorageTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = StorageType
        fields = [
            'id',
            'name',
            'description',
            'temperature_min',
            'temperature_max',
            'requires_refrigeration',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']

class MovementReasonSerializer(serializers.ModelSerializer):
    class Meta:
        model = MovementReason
        fields = [
            'id',
            'name',
            'description',
            'direction',
            'requires_authorization',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class ReplenishmentRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReplenishmentRule
        fields = [
            'id',
            'product',
            'location',
            'trigger_type',
            'min_quantity',
            'max_quantity',
            'reorder_quantity',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class ReplenishmentOrderSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReplenishmentOrder
        fields = [
            'id',
            'rule',
            'status',
            'quantity',
            'notes',
            'approved_by',
            'approved_at',
            'completed_at',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class InventoryCountSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryCount
        fields = [
            'id',
            'location',
            'status',
            'notes',
            'started_at',
            'completed_at',
            'counted_by',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class InventoryCountItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryCountItem
        fields = [
            'id',
            'count',
            'product',
            'system_quantity',
            'counted_quantity',
            'difference',
            'notes',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']
