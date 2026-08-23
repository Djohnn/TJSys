SENSITIVE_KEY_PARTS = (
    'password',
    'token',
    'secret',
    'certificate',
    'private_key',
    'otp',
    'mfa_code',
    'recovery_code',
)


def sanitize_audit_detail(value):
    if isinstance(value, dict):
        sanitized = {}
        for key, item in value.items():
            normalized = str(key).lower()
            if any(part in normalized for part in SENSITIVE_KEY_PARTS):
                sanitized[key] = '[REDACTED]'
            else:
                sanitized[key] = sanitize_audit_detail(item)
        return sanitized
    if isinstance(value, list):
        return [sanitize_audit_detail(item) for item in value]
    return value


def create_audit_record(
    *,
    action,
    resource_type,
    resource_id='',
    detail=None,
    actor=None,
    correlation_id='',
    tenant_id='',
):
    from audit.models import AuditRecord

    return AuditRecord.objects.create(
        actor=actor,
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id),
        detail=sanitize_audit_detail(detail or {}),
        correlation_id=correlation_id,
        tenant_id=str(tenant_id) if tenant_id else '',
    )
