from decimal import Decimal

from rest_framework import serializers

from .models import (
    PaymentIntent,
    PaymentProviderConfig,
    PaymentReconciliationBatch,
    PaymentReconciliationItem,
    PaymentTransaction,
    PaymentWebhookEvent,
)


class PaymentIntentInputSerializer(serializers.Serializer):
    sale = serializers.UUIDField()
    provider_config = serializers.UUIDField()
    idempotency_key = serializers.CharField(max_length=100)


class PaymentIntentSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentIntent
        fields = [
            'id', 'sale', 'amount', 'currency', 'status', 'provider_reference',
            'idempotency_key', 'created_at',
        ]
        read_only_fields = fields


class PaymentTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentTransaction
        fields = [
            'id', 'intent', 'transaction_type', 'status', 'gross_amount',
            'fee_amount', 'net_amount', 'provider_reference', 'created_at',
        ]
        read_only_fields = fields


class PaymentWebhookEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentWebhookEvent
        fields = ['id', 'provider', 'external_id', 'processed_at']
        read_only_fields = fields


class ReconciliationRowSerializer(serializers.Serializer):
    provider_reference = serializers.CharField(max_length=100)
    gross_amount = serializers.DecimalField(max_digits=18, decimal_places=2)
    fee_amount = serializers.DecimalField(
        max_digits=18, decimal_places=2, default=Decimal('0.00')
    )
    settled_amount = serializers.DecimalField(max_digits=18, decimal_places=2)


class ReconciliationBatchInputSerializer(serializers.Serializer):
    provider = serializers.CharField(max_length=40)
    rows = ReconciliationRowSerializer(many=True)


class PaymentReconciliationItemSerializer(serializers.ModelSerializer):
    difference_amount = serializers.DecimalField(
        max_digits=18, decimal_places=2, read_only=True
    )

    class Meta:
        model = PaymentReconciliationItem
        exclude = ['tenant', 'batch', 'updated_at']


class PaymentReconciliationBatchSerializer(serializers.ModelSerializer):
    items = serializers.SerializerMethodField()

    class Meta:
        model = PaymentReconciliationBatch
        fields = ['id', 'provider', 'status', 'confirmed_at', 'items', 'created_at']
        read_only_fields = fields

    def get_items(self, obj):
        queryset = PaymentReconciliationItem.all_objects.filter(batch=obj)
        return PaymentReconciliationItemSerializer(queryset, many=True).data


# Sprint 20 — management serializers (write-only secret)

class PaymentProviderConfigReadSerializer(serializers.ModelSerializer):
    """Read view — only `configured` boolean, never the secret."""

    configured = serializers.SerializerMethodField()

    class Meta:
        model = PaymentProviderConfig
        fields = ['id', 'provider', 'is_active', 'configured', 'created_at', 'updated_at']
        read_only_fields = fields

    def get_configured(self, obj):
        return bool(obj.secret)


class PaymentProviderConfigWriteSerializer(serializers.ModelSerializer):
    """Write view — secret is write-only. Blank secret preserves existing value."""

    class Meta:
        model = PaymentProviderConfig
        fields = ['id', 'provider', 'secret', 'is_active']
        read_only_fields = ['id']
        extra_kwargs = {
            'secret': {'write_only': True, 'required': False, 'allow_blank': True},
        }

    def update(self, instance, validated_data):
        if not validated_data.get('secret'):
            validated_data.pop('secret', None)
        return super().update(instance, validated_data)

