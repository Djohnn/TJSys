import json
import logging

from django.http import HttpResponse, JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from fiscal.models import FiscalDocument
from fiscal.services import _resolve_provider, apply_provider_query_result, resolve_emitter

logger = logging.getLogger(__name__)


@csrf_exempt
@require_POST
def fiscal_webhook(request):
    try:
        data = json.loads(request.body or b'{}')
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({'error': 'invalid json'}, status=400)

    provider_doc_id = data.get('idNota') or data.get('idIntegracao')
    if not provider_doc_id:
        return JsonResponse({'error': 'missing idNota'}, status=400)

    doc = (
        FiscalDocument.all_objects.filter(
            provider_document_id=provider_doc_id,
            is_active=True,
        )
        .select_related('sale__branch', 'tenant')
        .first()
    )
    if doc is None:
        return HttpResponse(status=200)

    emitter = resolve_emitter(doc.sale.branch)
    if emitter is None:
        logger.warning('Fiscal emitter not found for webhook document %s', doc.id)
        return HttpResponse(status=200)

    try:
        result = _resolve_provider(emitter.provider).query(doc.tenant, provider_doc_id)
    except Exception as exc:
        logger.warning('Fiscal webhook query failed for %s: %s', provider_doc_id, exc)
        return HttpResponse(status=200)

    apply_provider_query_result(doc, result)
    doc.webhook_received_at = timezone.now()
    doc.save(update_fields=['webhook_received_at', 'updated_at'])
    return HttpResponse(status=200)
