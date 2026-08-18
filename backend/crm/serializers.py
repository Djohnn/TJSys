from rest_framework import serializers

from crm.models import CustomerHistoryEntry


class CustomerHistoryEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerHistoryEntry
        fields = [
            'id',
            'customer',
            'event_type',
            'reference_id',
            'reference_model',
            'title',
            'description',
            'amount',
            'metadata',
            'created_by',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']
