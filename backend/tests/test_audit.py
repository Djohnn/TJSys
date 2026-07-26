import pytest
from django.contrib import admin
from django.core.exceptions import ValidationError
from django.db import DatabaseError, transaction
from django.test import RequestFactory

from audit.admin import AuditRecordAdmin
from audit.models import AuditRecord
from audit.services import create_audit_record


@pytest.mark.django_db(transaction=True)
class TestAuditImmutability:
    def test_service_sanitizes_sensitive_fields_recursively(self):
        record = create_audit_record(
            action='tenant.updated',
            resource_type='Tenant',
            resource_id='123',
            detail={
                'name': 'Safe',
                'password': 'never-store-me',
                'nested': {'access_token': 'hidden', 'value': 10},
                'otp': '123456',
                'mfa_code': '654321',
                'recovery_code': 'recovery',
            },
        )

        assert record.detail == {
            'name': 'Safe',
            'password': '[REDACTED]',
            'nested': {'access_token': '[REDACTED]', 'value': 10},
            'otp': '[REDACTED]',
            'mfa_code': '[REDACTED]',
            'recovery_code': '[REDACTED]',
        }

    def test_persisted_record_cannot_be_saved_again(self):
        record = create_audit_record(
            action='created',
            resource_type='Test',
            resource_id='1',
            detail={},
        )
        record.action = 'tampered'
        with pytest.raises(ValidationError):
            record.save()

    def test_persisted_record_cannot_be_deleted(self):
        record = create_audit_record(
            action='created',
            resource_type='Test',
            resource_id='1',
            detail={},
        )
        with pytest.raises(ValidationError):
            record.delete()

    def test_database_blocks_bulk_update(self):
        record = create_audit_record(
            action='created',
            resource_type='Test',
            resource_id='1',
            detail={},
        )
        with pytest.raises(DatabaseError), transaction.atomic():
            AuditRecord.objects.filter(pk=record.pk).update(action='tampered')

    def test_admin_is_read_only(self):
        model_admin = AuditRecordAdmin(AuditRecord, admin.site)
        request = RequestFactory().get('/admin/audit/auditrecord/')
        assert model_admin.has_add_permission(request) is False
        assert model_admin.has_change_permission(request) is False
        assert model_admin.has_delete_permission(request) is False
