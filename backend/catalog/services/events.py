from audit.services import create_audit_record
from outbox.services import create_outbox_message


def _safe_payload(instance, fields):
    return {f: str(getattr(instance, f, '')) for f in fields}


def emit_catalog_event(
    *,
    action,
    event_type,
    instance,
    request,
    detail_fields=None,
):
    tenant_id = str(request.tenant.id) if request.tenant else ''
    correlation_id = getattr(request, 'correlation_id', '')
    resource_id = str(instance.id)
    resource_type = instance.__class__.__name__

    detail = _safe_payload(instance, detail_fields or ['id', 'name', 'sku'])

    create_audit_record(
        actor=request.user,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        detail=detail,
        correlation_id=correlation_id,
        tenant_id=tenant_id,
    )
    create_outbox_message(
        event_type=event_type,
        aggregate_type=resource_type,
        aggregate_id=resource_id,
        payload=detail,
        correlation_id=correlation_id,
        tenant_id=tenant_id,
        event_version='1',
    )
