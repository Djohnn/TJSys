from rest_framework import serializers

from fiscal.models import FiscalDocument, FiscalEmitter, FiscalProductConfig


class FiscalStatusSerializer(serializers.Serializer):
    sale_id = serializers.UUIDField()
    fiscal_status = serializers.CharField(source='status')
    attempt = serializers.IntegerField(source='attempt_number')
    protocol = serializers.CharField(allow_blank=True)
    pdf_url = serializers.CharField(source='pdf_key', allow_blank=True)
    xml_url = serializers.CharField(source='xml_key', allow_blank=True)
    error_detail = serializers.CharField(allow_blank=True)


class FiscalRequestSerializer(serializers.Serializer):
    sale_id = serializers.UUIDField()
    status = serializers.CharField(read_only=True)
    attempt = serializers.IntegerField(read_only=True)


class ReceiptFiscalValidateSerializer(serializers.Serializer):
    receipt_id = serializers.UUIDField()
    cfop = serializers.CharField(required=False, allow_blank=True)
    issues = serializers.ListField(read_only=True)
    warnings = serializers.ListField(read_only=True)
    requires_attention = serializers.BooleanField(read_only=True)
    created = serializers.BooleanField(read_only=True)
    document_id = serializers.UUIDField(read_only=True, allow_null=True)


class OCRXmlSerializer(serializers.Serializer):
    xml_content = serializers.CharField(write_only=True)
    supplier = serializers.DictField(read_only=True)
    items = serializers.ListField(read_only=True)
    cfop = serializers.CharField(read_only=True)
    document_number = serializers.CharField(read_only=True)
    series = serializers.CharField(read_only=True)
    emission_date = serializers.CharField(read_only=True)


# Sprint 20 — management serializers (write-only secret)


class FiscalEmitterSerializer(serializers.ModelSerializer):
    """Read serializer — never exposes secrets/api_key/certificate."""

    class Meta:
        model = FiscalEmitter
        fields = [
            'id',
            'branch',
            'provider',
            'cpf_cnpj',
            'ie',
            'registered_at_provider',
            'registration_source',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = fields


class FiscalEmitterWriteSerializer(serializers.ModelSerializer):
    """Write serializer — accepts api_key once (write-only, not persisted)."""

    api_key = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
    )

    class Meta:
        model = FiscalEmitter
        fields = [
            'id',
            'branch',
            'provider',
            'cpf_cnpj',
            'ie',
            'registered_at_provider',
            'registration_source',
            'is_active',
            'api_key',
        ]
        read_only_fields = ['id']

    def update(self, instance, validated_data):
        # api_key is handled by the receiving view — remove before saving model
        validated_data.pop('api_key', None)
        return super().update(instance, validated_data)

    def create(self, validated_data):
        validated_data.pop('api_key', None)
        return super().create(validated_data)


class FiscalDocumentTimelineEntrySerializer(serializers.Serializer):
    """One row of the immutable status timeline for a fiscal document."""

    status = serializers.CharField()
    timestamp = serializers.DateTimeField(source='created_at')


class FiscalDocumentSerializer(serializers.ModelSerializer):
    """List/detail of fiscal documents — never raw XML/PDF content."""

    class Meta:
        model = FiscalDocument
        fields = [
            'id',
            'direction',
            'sale',
            'purchase_order',
            'receipt',
            'status',
            'attempt_number',
            'provider_document_id',
            'cfop',
            'protocol',
            'xml_key',
            'pdf_key',
            'error_detail',
            'retry_count',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = fields


class FiscalDocumentDetailSerializer(FiscalDocumentSerializer):
    """Detail view — adds immutable status timeline."""

    timeline = serializers.SerializerMethodField()

    class Meta(FiscalDocumentSerializer.Meta):
        fields = FiscalDocumentSerializer.Meta.fields + ['timeline']

    def get_timeline(self, obj):
        history = (
            FiscalDocument.all_objects.filter(sale_id=obj.sale_id, tenant_id=obj.tenant_id)
            .order_by('attempt_number')
            .values('status', 'created_at')
        )
        return list(history)


class FiscalProductConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = FiscalProductConfig
        fields = [
            'id',
            'product',
            'cst_icms',
            'cst_pis',
            'cst_cofins',
            'aliquota_icms',
            'origem',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
