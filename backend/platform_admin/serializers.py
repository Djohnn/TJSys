from rest_framework import serializers

from platform_admin.models import (
    FeatureFlag,
    Plan,
    PlatformAdminAudit,
    Subscription,
    SupportAccessRequest,
    TenantEntitlement,
)


class PlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = Plan
        fields = [
            'id', 'code', 'name', 'capabilities', 'limits',
            'is_active', 'sort_order', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class SubscriptionSerializer(serializers.ModelSerializer):
    plan_code = serializers.CharField(source='plan.code', read_only=True)
    plan_name = serializers.CharField(source='plan.name', read_only=True)
    tenant_slug = serializers.CharField(source='tenant.slug', read_only=True)

    class Meta:
        model = Subscription
        fields = [
            'id', 'tenant', 'tenant_slug', 'plan', 'plan_code', 'plan_name',
            'status', 'start_date', 'end_date', 'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class TenantEntitlementSerializer(serializers.ModelSerializer):
    class Meta:
        model = TenantEntitlement
        fields = [
            'id', 'tenant', 'capability', 'is_enabled', 'limit_value',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class FeatureFlagSerializer(serializers.ModelSerializer):
    is_enabled_for_current = serializers.SerializerMethodField()

    class Meta:
        model = FeatureFlag
        fields = [
            'id', 'code', 'description', 'is_globally_enabled',
            'rollout_percentage', 'tenant_overrides',
            'is_enabled_for_current', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_rollout_percentage(self, value):
        if value > 100:
            raise serializers.ValidationError('Rollout percentage cannot exceed 100.')
        return value

    def get_is_enabled_for_current(self, obj):
        request = self.context.get('request')
        if request and hasattr(request, 'tenant') and request.tenant:
            return obj.is_enabled_for(request.tenant.id)
        return None


class SupportAccessRequestSerializer(serializers.ModelSerializer):
    requester_email = serializers.EmailField(
        source='requester.email', read_only=True,
    )
    approved_by_email = serializers.EmailField(
        source='approved_by.email', read_only=True, allow_null=True,
    )

    class Meta:
        model = SupportAccessRequest
        fields = [
            'id', 'requester', 'requester_email', 'target_tenant',
            'reason', 'status', 'approved_by', 'approved_by_email',
            'expires_at', 'revoked_at', 'revoked_by',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'requester', 'status', 'approved_by',
            'revoked_at', 'revoked_by', 'created_at', 'updated_at',
        ]

    def validate_target_tenant(self, value):
        request = self.context.get('request')
        if (
            request
            and not request.user.is_staff
            and getattr(request, 'tenant', None) != value
        ):
            raise serializers.ValidationError(
                'Support access can only target the active tenant.',
            )
        return value


class PlatformAdminAuditSerializer(serializers.ModelSerializer):
    actor_email = serializers.EmailField(
        source='actor.email', read_only=True, allow_null=True,
    )

    class Meta:
        model = PlatformAdminAudit
        fields = [
            'id', 'actor', 'actor_email', 'action',
            'target_tenant', 'detail', 'created_at',
        ]
        read_only_fields = ['id', 'actor', 'created_at']
