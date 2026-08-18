from rest_framework import serializers

from crm.models import Activity, ActivityType, Opportunity


class ActivityTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ActivityType
        fields = [
            'id',
            'name',
            'description',
            'color',
            'icon',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class ActivitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Activity
        fields = [
            'id',
            'activity_type',
            'customer',
            'opportunity',
            'assigned_to',
            'title',
            'description',
            'status',
            'due_date',
            'completed_at',
            'notes',
            'reminder_date',
            'is_recurring',
            'recurrence_interval',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class CreateActivitySerializer(serializers.Serializer):
    activity_type = serializers.UUIDField()
    customer = serializers.UUIDField()
    opportunity = serializers.UUIDField(required=False, allow_null=True)
    assigned_to = serializers.UUIDField(required=False, allow_null=True)
    title = serializers.CharField(max_length=200)
    description = serializers.CharField(required=False, allow_blank=True, default='')
    due_date = serializers.DateTimeField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    reminder_date = serializers.DateTimeField(required=False, allow_null=True)
    is_recurring = serializers.BooleanField(default=False)
    recurrence_interval = serializers.CharField(required=False, allow_blank=True, default='')
