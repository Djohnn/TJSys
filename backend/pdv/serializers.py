from rest_framework import serializers


class SyncEventSerializer(serializers.Serializer):
    event_id = serializers.UUIDField()
    device_id = serializers.CharField(max_length=100)
    tenant_id = serializers.UUIDField()
    branch_id = serializers.UUIDField()
    cash_session_id = serializers.UUIDField()
    operator_id = serializers.UUIDField()
    local_sequence = serializers.IntegerField(min_value=1)
    event_type = serializers.ChoiceField(choices=['offline.sale.completed'])
    event_version = serializers.IntegerField(min_value=1)
    idempotency_key = serializers.CharField(max_length=255, min_length=1)
    occurred_at = serializers.DateTimeField()
    payload = serializers.JSONField()
    payload_hash = serializers.RegexField(regex=r'^[0-9a-f]{64}$')


class SyncBatchSerializer(serializers.Serializer):
    events = SyncEventSerializer(many=True)
    batch_hash = serializers.RegexField(regex=r'^[0-9a-f]{64}$', required=False)

    def validate_events(self, value):
        if not 1 <= len(value) <= 50:
            raise serializers.ValidationError('A batch must contain between 1 and 50 events.')
        return value
