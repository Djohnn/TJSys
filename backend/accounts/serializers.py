from rest_framework import serializers


class RegistrationSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=12)
    tenant_name = serializers.CharField(max_length=200)
    company_name = serializers.CharField(max_length=200)
    branch_name = serializers.CharField(max_length=200)


class TokenSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=300)


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)


class EmailSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetSerializer(TokenSerializer):
    password = serializers.CharField(write_only=True, min_length=12)


class TenantSelectionSerializer(serializers.Serializer):
    tenant_id = serializers.UUIDField()


class TOTPConfirmationSerializer(serializers.Serializer):
    device_id = serializers.UUIDField()
    code = serializers.RegexField(r'^\d{6}$')


class EmailChallengeSerializer(serializers.Serializer):
    challenge_id = serializers.UUIDField()
    code = serializers.RegexField(r'^\d{6}$')


class RecoveryVerificationSerializer(TenantSelectionSerializer):
    code = serializers.CharField(min_length=8, max_length=32)


class UserFavoriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = None  # Set dynamically
        fields = [
            'id',
            'entity_type',
            'entity_id',
            'label',
            'route',
            'position',
            'icon',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        from accounts.models import UserFavorite
        self.Meta.model = UserFavorite


class UserFavoriteCreateSerializer(serializers.Serializer):
    entity_type = serializers.CharField(max_length=32)
    entity_id = serializers.UUIDField(required=False, allow_null=True)
    label = serializers.CharField(max_length=200)  # type: ignore[assignment]
    route = serializers.CharField(max_length=200)
    position = serializers.IntegerField(required=False, default=0)
    icon = serializers.CharField(max_length=32, required=False, default='')


class UserFavoriteReorderSerializer(serializers.Serializer):
    favorite_ids = serializers.ListField(child=serializers.UUIDField())
