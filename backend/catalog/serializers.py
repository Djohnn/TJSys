from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers

from catalog.models import (
    BranchPrice,
    Brand,
    Category,
    ComboItem,
    CommercialCombo,
    LabelTemplate,
    Product,
    ProductChannelProfile,
    ProductCode,
    ProductComposition,
    ProductFiscalData,
    ProductImage,
    ProductPrice,
    ProductPriceTier,
    ProductUnit,
    Unit,
)


class FullCleanModelSerializer(serializers.ModelSerializer):
    """Execute model-level validation for catalog API writes.

    Django REST Framework does not call model.clean() automatically. The
    catalog keeps core business rules there, including same-tenant foreign keys
    and price period overlap checks, so API writes must call full_clean()
    before saving.
    """

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


class UnitSerializer(FullCleanModelSerializer):
    class Meta:
        model = Unit
        fields = ['id', 'symbol', 'name', 'precision', 'is_active', 'version']
        read_only_fields = ['id', 'version']


class CategorySerializer(FullCleanModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name', 'code', 'parent', 'is_active', 'version']
        read_only_fields = ['id', 'version']


class ProductSerializer(FullCleanModelSerializer):
    price = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            'id',
            'sku',
            'name',
            'description',
            'category',
            'base_unit',
            'requires_lot',
            'requires_expiry',
            'is_active',
            'version',
            'price',
            # Sprint 22 fields
            'product_kind',
            'tracks_inventory',
            'brand',
            'model',
            'tags',
            'scale_code',
            # Sprint 26 — service metadata
            'billing_unit',
            'duration_minutes',
        ]
        read_only_fields = ['id', 'version', 'price']

    def validate(self, data):
        if data.get('product_kind') == 'servico':
            if data.get('tracks_inventory'):
                raise serializers.ValidationError(
                    {'tracks_inventory': 'Services cannot track inventory.'}
                )
            if data.get('requires_lot'):
                raise serializers.ValidationError({'requires_lot': 'Services cannot require lots.'})
            if data.get('requires_expiry'):
                raise serializers.ValidationError(
                    {'requires_expiry': 'Services cannot require expiry.'}
                )
        return data

    def get_price(self, obj):
        now = timezone.now()
        price = (
            ProductPrice.all_objects.filter(
                tenant=obj.tenant,
                product=obj,
                is_active=True,
                valid_from__lte=now,
            )
            .filter(Q(valid_to__isnull=True) | Q(valid_to__gt=now))
            .order_by('-valid_from')
            .first()
        )
        return f'{price.amount:.2f}' if price else None


class ProductUnitSerializer(FullCleanModelSerializer):
    class Meta:
        model = ProductUnit
        fields = [
            'id',
            'product',
            'unit',
            'factor',
            'is_active',
            'version',
        ]
        read_only_fields = ['id', 'product', 'version']


class ProductCodeSerializer(FullCleanModelSerializer):
    class Meta:
        model = ProductCode
        fields = [
            'id',
            'product',
            'code_type',
            'value',
            'is_principal',
            'is_active',
            'version',
        ]
        read_only_fields = ['id', 'product', 'version']


class ProductPriceSerializer(FullCleanModelSerializer):
    class Meta:
        model = ProductPrice
        fields = [
            'id',
            'product',
            'amount',
            'valid_from',
            'valid_to',
            'is_active',
            'version',
        ]
        read_only_fields = ['id', 'product', 'version', 'is_active']


class BranchPriceSerializer(FullCleanModelSerializer):
    class Meta:
        model = BranchPrice
        fields = [
            'id',
            'product',
            'branch',
            'amount',
            'valid_from',
            'valid_to',
            'is_active',
            'version',
        ]
        read_only_fields = ['id', 'product', 'version']


# Sprint 22 serializers


class ProductFiscalDataSerializer(FullCleanModelSerializer):
    class Meta:
        model = ProductFiscalData
        fields = [
            'id',
            'product',
            'fiscal_type',
            'ncm',
            'cest',
            'origin_code',
            'fiscal_class',
            'is_active',
            'version',
        ]
        read_only_fields = ['id', 'version']


class ProductPriceTierSerializer(FullCleanModelSerializer):
    class Meta:
        model = ProductPriceTier
        fields = [
            'id',
            'product',
            'price',
            'min_quantity',
            'amount',
            'is_active',
            'version',
        ]
        read_only_fields = ['id', 'version']


class BrandSerializer(FullCleanModelSerializer):
    class Meta:
        model = Brand
        fields = ['id', 'name', 'is_active', 'version']
        read_only_fields = ['id', 'version']


class ProductImageSerializer(FullCleanModelSerializer):
    def validate_file(self, value):
        allowed_types = {'image/jpeg', 'image/png', 'image/webp'}
        if value.content_type not in allowed_types:
            raise serializers.ValidationError('Use uma imagem JPEG, PNG ou WebP.')
        if value.size > 5 * 1024 * 1024:
            raise serializers.ValidationError('A imagem deve ter no máximo 5 MB.')
        return value

    class Meta:
        model = ProductImage
        fields = ['id', 'product', 'object_key', 'file', 'alt_text', 'is_primary', 'position']
        read_only_fields = ['id', 'product']


class ProductCompositionSerializer(FullCleanModelSerializer):
    class Meta:
        model = ProductComposition
        fields = ['id', 'kit', 'component', 'quantity', 'version', 'is_active']
        read_only_fields = ['id', 'version']


class ComboItemSerializer(FullCleanModelSerializer):
    class Meta:
        model = ComboItem
        fields = ['id', 'combo', 'item', 'quantity', 'is_active', 'version']
        read_only_fields = ['id', 'combo', 'version']


# =============================================================================
# Sprint 28 — LabelTemplate + Label Generate
# =============================================================================


class LabelTemplateSerializer(FullCleanModelSerializer):
    class Meta:
        model = LabelTemplate
        fields = [
            'id',
            'name',
            'width_mm',
            'height_mm',
            'margin_mm',
            'columns',
            'rows',
            'show_sku',
            'show_barcode',
            'show_price',
            'show_name',
            'is_active',
            'version',
        ]
        read_only_fields = ['id', 'version']


class LabelGenerateItemSerializer(serializers.Serializer):
    product_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1, default=1)


class LabelGenerateSerializer(serializers.Serializer):
    template_id = serializers.UUIDField()
    items = LabelGenerateItemSerializer(many=True)


class CommercialComboSerializer(FullCleanModelSerializer):
    items = ComboItemSerializer(many=True, read_only=True)

    class Meta:
        model = CommercialCombo
        fields = [
            'id',
            'sku',
            'name',
            'description',
            'price',
            'valid_from',
            'valid_to',
            'is_active',
            'version',
            'items',
        ]
        read_only_fields = ['id', 'version']


# =============================================================================
# Sprint 29 — ProductChannelProfile
# =============================================================================


class ProductChannelProfileSerializer(FullCleanModelSerializer):
    class Meta:
        model = ProductChannelProfile
        fields = [
            'id',
            'product',
            'channel_slug',
            'title',
            'description',
            'list_price',
            'sale_price',
            'dimensions_json',
            'weight_grams',
            'status',
            'version',
            'published_at',
        ]
        read_only_fields = ['id', 'product', 'version', 'published_at']
