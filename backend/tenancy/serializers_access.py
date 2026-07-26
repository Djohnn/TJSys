from rest_framework import serializers

from tenancy.models import Invitation, TenantMembership, TenantMFAPolicy


class InvitationSerializer(serializers.ModelSerializer):
    branch_ids = serializers.ListField(
        child=serializers.UUIDField(),
        write_only=True,
        required=False,
        default=list,
    )

    class Meta:
        model = Invitation
        fields = [
            'id',
            'email',
            'role',
            'branch_ids',
            'expires_at',
            'accepted_at',
            'created_at',
        ]
        read_only_fields = ['id', 'expires_at', 'accepted_at', 'created_at']


class InvitationAcceptSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=300)


class MembershipSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source='user.email', read_only=True)
    branch_ids = serializers.ListField(
        child=serializers.UUIDField(),
        write_only=True,
        required=False,
    )

    class Meta:
        model = TenantMembership
        fields = ['id', 'email', 'role', 'is_active', 'branch_ids']
        read_only_fields = ['id', 'email']


class MFAPolicySerializer(serializers.ModelSerializer):
    class Meta:
        model = TenantMFAPolicy
        fields = ['allow_totp', 'allow_email']

    def validate(self, attrs):
        attrs = super().validate(attrs)
        allow_totp = attrs.get('allow_totp', self.instance.allow_totp)
        allow_email = attrs.get('allow_email', self.instance.allow_email)
        if not allow_totp and not allow_email:
            raise serializers.ValidationError('At least one MFA method must remain enabled.')
        disabled = []
        if self.instance.allow_totp and not allow_totp:
            disabled.append('totp')
        if self.instance.allow_email and not allow_email:
            disabled.append('email')
        if disabled:
            admin_ids = TenantMembership.objects.filter(
                tenant=self.instance.tenant,
                role='admin',
                is_active=True,
            ).values_list('user_id', flat=True)
            alternative = 'email' if disabled == ['totp'] else 'totp'
            from accounts.models import MFADevice

            covered = (
                MFADevice.objects.filter(
                    tenant=self.instance.tenant,
                    user_id__in=admin_ids,
                    method=alternative,
                    verified_at__isnull=False,
                )
                .values_list('user_id', flat=True)
                .distinct()
            )
            if set(admin_ids) - set(covered):
                raise serializers.ValidationError(
                    'Every administrator needs a verified alternative MFA method.',
                )
        return attrs
