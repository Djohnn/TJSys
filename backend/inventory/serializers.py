from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from inventory.models import (
    ProductStockPolicy,
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


class NormalizedDecimalField(serializers.DecimalField):
    """Render decimals without insignificant trailing zeroes."""

    def to_representation(self, value):
        rendered = super().to_representation(value)
        if rendered in ('', None):
            return rendered
        if isinstance(rendered, Decimal):
            return rendered.normalize()
        return format(Decimal(str(rendered)).normalize(), 'f')


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
    quantity = NormalizedDecimalField(
        max_digits=18,
        decimal_places=6,
    )
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
    quantity = NormalizedDecimalField(
        max_digits=18,
        decimal_places=6,
        read_only=True,
    )
    reserved = NormalizedDecimalField(
        max_digits=18,
        decimal_places=6,
        read_only=True,
    )
    product_sku = serializers.CharField(source='product.sku', read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True)
    location_code = serializers.CharField(source='location.code', read_only=True)
    location_name = serializers.CharField(source='location.name', read_only=True)
    lot_number = serializers.CharField(source='lot.lot_number', read_only=True)
    available = NormalizedDecimalField(
        max_digits=18,
        decimal_places=6,
        read_only=True,
    )

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
