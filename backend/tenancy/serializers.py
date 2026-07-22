
from django.utils.crypto import get_random_string
from rest_framework import serializers

from tenancy.models import Branch, Company, Device


class CompanySerializer(serializers.ModelSerializer):
    tenant = serializers.UUIDField(source='tenant_id', read_only=True)

    class Meta:
        model = Company
        fields = ['id', 'tenant', 'name', 'cnpj', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['id', 'tenant', 'created_at', 'updated_at']


class DeviceSerializer(serializers.ModelSerializer):
    branch_name = serializers.CharField(source='branch.name', read_only=True)

    class Meta:
        model = Device
        fields = [
            'id', 'name', 'device_id', 'branch', 'branch_name',
            'status', 'platform', 'app_version', 'os_version',
            'last_seen_at', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'device_id', 'created_at', 'updated_at']


class DeviceRegisterSerializer(serializers.ModelSerializer):
    class Meta:
        model = Device
        fields = ['name', 'device_id', 'branch', 'platform', 'app_version', 'os_version']
        extra_kwargs = {'device_id': {'required': False, 'allow_blank': True}}

    def create(self, validated_data):
        # Generate a device ID if not provided
        if not validated_data.get('device_id'):
            validated_data['device_id'] = f"pdv_{get_random_string(12)}"
        validated_data['tenant'] = self.context['request'].tenant
        validated_data['registered_by'] = self.context['request'].user
        return super().create(validated_data)


class DeviceValidateSerializer(serializers.Serializer):
    api_key = serializers.CharField()


class BranchSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source='company.name', read_only=True)

    class Meta:
        model = Branch
        fields = ['id', 'company', 'company_name', 'name', 'is_active', 'ie', 'address_json', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class DeviceListSerializer(serializers.ModelSerializer):
    branch_name = serializers.CharField(source='branch.name', read_only=True)

    class Meta:
        model = Device
        fields = [
            'id', 'name', 'device_id', 'branch', 'branch_name',
            'status', 'platform', 'app_version', 'os_version',
            'last_seen_at', 'created_at', 'updated_at',
        ]
        read_only_fields = fields
