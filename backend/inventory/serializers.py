from rest_framework import serializers

from inventory.models import MovementReason, ReplenishmentOrder, ReplenishmentRule, StorageType


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
