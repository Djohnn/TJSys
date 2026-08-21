from rest_framework import serializers

from crm.models import Activity, ActivityType, CustomerHistoryEntry, Opportunity, Pipeline, PipelineStage


class PipelineStageSerializer(serializers.ModelSerializer):
    class Meta:
        model = PipelineStage
        fields = [
            'id',
            'name',
            'description',
            'order',
            'color',
            'is_won',
            'is_lost',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class PipelineSerializer(serializers.ModelSerializer):
    stages = PipelineStageSerializer(many=True, read_only=True)

    class Meta:
        model = Pipeline
        fields = [
            'id',
            'name',
            'description',
            'is_default',
            'is_active',
            'stages',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class OpportunitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Opportunity
        fields = [
            'id',
            'pipeline',
            'stage',
            'customer',
            'assigned_to',
            'title',
            'description',
            'value',
            'currency',
            'probability',
            'expected_close_date',
            'actual_close_date',
            'status',
            'lost_reason',
            'source',
            'notes',
            'converted_sale',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']


class CreateOpportunitySerializer(serializers.Serializer):
    pipeline = serializers.UUIDField()
    stage = serializers.UUIDField()
    customer = serializers.UUIDField()
    assigned_to = serializers.UUIDField(required=False, allow_null=True)
    title = serializers.CharField(max_length=200)
    description = serializers.CharField(required=False, allow_blank=True, default='')
    value = serializers.DecimalField(max_digits=18, decimal_places=2, default=0)
    currency = serializers.CharField(max_length=3, default='BRL')
    probability = serializers.IntegerField(default=0)
    expected_close_date = serializers.DateField(required=False, allow_null=True)
    source = serializers.CharField(required=False, allow_blank=True, default='')
    notes = serializers.CharField(required=False, allow_blank=True, default='')


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
