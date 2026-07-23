from rest_framework import serializers

from financial.models import Payable, Receivable


class PayableSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payable
        fields = [
            'id', 'branch', 'supplier_name', 'description', 'amount',
            'status', 'due_date', 'created_at', 'version',
        ]
        read_only_fields = fields


class ReceivableSerializer(serializers.ModelSerializer):
    class Meta:
        model = Receivable
        fields = [
            'id', 'branch', 'customer_name', 'description', 'amount',
            'status', 'due_date', 'source_type', 'source_id', 'created_at', 'version',
        ]
        read_only_fields = fields
