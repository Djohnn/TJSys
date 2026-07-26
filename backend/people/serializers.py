from rest_framework import serializers

from .models import ConsentRecord, Person, PersonAddress, PersonContact, PersonDocument
from .services import create_person


class PersonDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = PersonDocument
        fields = ['id', 'document_type', 'value', 'is_active']
        read_only_fields = ['id', 'is_active']


class PersonAddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = PersonAddress
        exclude = ['tenant', 'person', 'created_at', 'updated_at']
        read_only_fields = ['id']


class PersonContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = PersonContact
        exclude = ['tenant', 'person', 'created_at', 'updated_at']
        read_only_fields = ['id']


class ConsentRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = ConsentRecord
        exclude = ['tenant', 'person', 'created_at', 'updated_at']
        read_only_fields = ['id', 'recorded_at', 'revoked_at']


class PersonSerializer(serializers.ModelSerializer):
    roles = serializers.ListField(
        child=serializers.ChoiceField(choices=['customer', 'supplier', 'carrier', 'contact']),
        write_only=True,
        required=False,
    )
    role_values = serializers.SerializerMethodField()
    documents = PersonDocumentSerializer(many=True, required=False)

    class Meta:
        model = Person
        fields = [
            'id',
            'person_type',
            'name',
            'trade_name',
            'is_active',
            'roles',
            'role_values',
            'documents',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'is_active', 'created_at', 'updated_at']

    def get_role_values(self, obj):
        from .models import PersonRole

        return list(PersonRole.all_objects.filter(person=obj).values_list('role', flat=True))

    def create(self, validated_data):
        roles = validated_data.pop('roles', [])
        documents = validated_data.pop('documents', [])
        request = self.context['request']
        return create_person(
            tenant=request.tenant,
            actor=request.user,
            roles=roles,
            documents=documents,
            **validated_data,
        )

    def update(self, instance, validated_data):
        validated_data.pop('roles', None)
        validated_data.pop('documents', None)
        return super().update(instance, validated_data)
