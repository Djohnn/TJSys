from rest_framework import serializers

from financial.models import CashflowEntry, Payable, Receivable


class CashflowEntrySerializer(serializers.ModelSerializer):
    date = serializers.DateField(source='effective_date', read_only=True)
    inflow = serializers.SerializerMethodField()
    outflow = serializers.SerializerMethodField()
    balance = serializers.SerializerMethodField()
    branch_name = serializers.CharField(source='branch.name', read_only=True, allow_null=True)

    class Meta:
        model = CashflowEntry
        fields = [
            'id',
            'date',
            'description',
            'inflow',
            'outflow',
            'balance',
            'branch',
            'branch_name',
            'created_at',
        ]

    def get_inflow(self, obj):
        return obj.amount if obj.direction == 'inflow' else None

    def get_outflow(self, obj):
        return obj.amount if obj.direction == 'outflow' else None

    def get_balance(self, obj):
        return obj.amount if obj.direction == 'inflow' else -obj.amount


class PayableSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payable
        fields = [
            'id',
            'branch',
            'supplier',
            'purchase_order',
            'purchase_receipt',
            'supplier_name',
            'description',
            'amount',
            'status',
            'due_date',
            'created_at',
            'version',
        ]
        read_only_fields = fields


class ReceivableSerializer(serializers.ModelSerializer):
    class Meta:
        model = Receivable
        fields = [
            'id',
            'branch',
            'customer_name',
            'description',
            'amount',
            'status',
            'due_date',
            'source_type',
            'source_id',
            'created_at',
            'version',
        ]
        read_only_fields = fields
