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
    price_status = serializers.SerializerMethodField()
    unit = serializers.UUIDField(source='base_unit_id', read_only=True)
    unit_name = serializers.CharField(source='base_unit.name', read_only=True)
    unit_symbol = serializers.CharField(source='base_unit.symbol', read_only=True)
    unit_precision = serializers.IntegerField(source='base_unit.precision', read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True, default='')
    barcode = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            'id',
            'sku',
            'name',
            'description',
            'category',
            'category_name',
            'base_unit',
            'unit',
            'unit_name',
            'unit_symbol',
            'unit_precision',
            'barcode',
            'requires_lot',
            'requires_expiry',
            'is_active',
            'version',
            'price',
            'price_status',
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
        read_only_fields = ['id', 'version', 'price', 'price_status']

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
        prices = list(
            ProductPrice.all_objects.filter(
                tenant=obj.tenant,
                product=obj,
                is_active=True,
                valid_from__lte=now,
            )
            .filter(Q(valid_to__isnull=True) | Q(valid_to__gt=now))
            .order_by('-valid_from')
            [:2]
        )
        # A tier is never a substitute for the canonical ProductPrice. If
        # the base contract is absent or ambiguous, expose no sellable price
        # rather than silently selecting an arbitrary record.
        if len(prices) != 1:
            return None
        return f'{prices[0].amount:.2f}'

    def get_price_status(self, obj):
        return 'priced' if self.get_price(obj) is not None else 'missing'

    def get_barcode(self, obj):
        code = (
            obj.codes.filter(code_type='ean', is_active=True)
            .order_by('-is_principal', 'id')
            .first()
        )
        return code.value if code else ''


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
    # A base-price write starts now unless the caller explicitly supplies a
    # historical/future effective date. This keeps the ProductPrice endpoint
    # the canonical contract while leaving tiers optional.
    valid_from = serializers.DateTimeField(required=False, default=timezone.now)

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
        read_only_fields = ['id', 'product', 'version']


class ProductPriceTierSerializer(FullCleanModelSerializer):
    def validate(self, attrs):
        price = attrs.get('price')
        if price is None:
            raise serializers.ValidationError({'price': 'Base price is required.'})
        request = self.context.get('request')
        path_product_id = None
        if request is not None:
            path_product_id = request.parser_context.get('kwargs', {}).get('product_pk')
        if path_product_id is not None and str(price.product_id) != str(path_product_id):
            raise serializers.ValidationError(
                {'price': 'Price must belong to the requested product.'}
            )
        if request is not None and getattr(request, 'tenant', None) is not None:
            if price.tenant_id != request.tenant.id:
                raise serializers.ValidationError(
                    {'price': 'Price must belong to the active tenant.'}
                )
        if not price.is_active:
            raise serializers.ValidationError({'price': 'Price must be active.'})
        return attrs

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
        read_only_fields = ['id', 'product', 'version']


class BrandSerializer(FullCleanModelSerializer):
    class Meta:
        model = Brand
        fields = ['id', 'name', 'is_active', 'version']
        read_only_fields = ['id', 'version']


class ProductImageSerializer(FullCleanModelSerializer):
    file_url = serializers.SerializerMethodField()

    def validate_file(self, value):
        allowed_types = {'image/jpeg', 'image/png', 'image/webp'}
        if value.content_type not in allowed_types:
            raise serializers.ValidationError('Use uma imagem JPEG, PNG ou WebP.')
        if value.size > 5 * 1024 * 1024:
            raise serializers.ValidationError('A imagem deve ter no máximo 5 MB.')
        return value

    def get_file_url(self, obj):
        if obj.file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.file.url)
            return obj.file.url
        return None

    class Meta:
        model = ProductImage
        fields = [
            'id',
            'product',
            'object_key',
            'file',
            'file_url',
            'alt_text',
            'is_primary',
            'position',
        ]
        read_only_fields = ['id', 'product']


class ProductCompositionSerializer(FullCleanModelSerializer):
    unit_name = serializers.CharField(source='component.base_unit.name', read_only=True)
    unit_symbol = serializers.CharField(source='component.base_unit.symbol', read_only=True)
    unit_precision = serializers.IntegerField(
        source='component.base_unit.precision', read_only=True,
    )

    class Meta:
        model = ProductComposition
        fields = [
            'id', 'kit', 'component', 'quantity', 'unit_name', 'unit_symbol',
            'unit_precision', 'version', 'is_active',
        ]
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


class ApplyProductStockSerializer(serializers.Serializer):
    branch = serializers.UUIDField()
    location = serializers.UUIDField()
    initial_quantity = serializers.DecimalField(
        max_digits=18, decimal_places=6, required=False, default=0,
    )
    minimum_quantity = serializers.DecimalField(
        max_digits=18, decimal_places=6, required=False, default=0,
    )
    maximum_quantity = serializers.DecimalField(
        max_digits=18, decimal_places=6, required=False, allow_null=True,
    )
    reorder_point = serializers.DecimalField(
        max_digits=18, decimal_places=6, required=False, default=0,
    )
    allow_negative = serializers.BooleanField(required=False, default=False)


class ApplyProductInputSerializer(serializers.Serializer):
    sku = serializers.CharField(max_length=64, required=False, allow_blank=True, default='')
    name = serializers.CharField(max_length=200)
    description = serializers.CharField(required=False, allow_blank=True, default='')
    product_kind = serializers.CharField(
        max_length=20,
        required=False,
        allow_blank=True,
        default='',
    )
    base_unit = serializers.UUIDField()
    category = serializers.UUIDField(required=False, allow_null=True)
    brand = serializers.CharField(max_length=120, required=False, allow_blank=True, default='')
    model = serializers.CharField(max_length=120, required=False, allow_blank=True, default='')
    tags = serializers.JSONField(required=False, default=list)
    tracks_inventory = serializers.BooleanField(required=False, default=False)


class ApplyProductSerializer(serializers.Serializer):
    command_id = serializers.CharField(max_length=80)
    product = ApplyProductInputSerializer()
    stock = ApplyProductStockSerializer(required=False, allow_null=True)

    def validate(self, attrs):
        product_data = attrs.get('product', {})
        stock = attrs.get('stock')
        tracks_inventory = product_data.get('tracks_inventory', False)
        if tracks_inventory and not stock:
            raise serializers.ValidationError(
                {'stock': 'Stock is required when the product tracks inventory.'}
            )
        if product_data.get('product_kind') == 'servico' and stock:
            raise serializers.ValidationError(
                {'stock': 'Services cannot have stock.'}
            )
        return attrs
