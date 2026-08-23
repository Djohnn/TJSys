import logging

from django.db import IntegrityError, transaction
from django.http import Http404, HttpResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.generics import CreateAPIView, RetrieveAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from fiscal.models import FiscalDocument, FiscalEmitter, FiscalProductConfig
from fiscal.ocr import parse_nfe_xml
from fiscal.serializers import (
    FiscalDocumentDetailSerializer,
    FiscalDocumentSerializer,
    FiscalEmitterSerializer,
    FiscalEmitterWriteSerializer,
    FiscalProductConfigSerializer,
    FiscalRequestSerializer,
    FiscalStatusSerializer,
)
from fiscal.services import emit_document, reconcile_receipt_fiscal, resolve_emitter
from tenancy.permissions import HasActiveTenant, HasCapability, HasVerifiedMFA

logger = logging.getLogger(__name__)


def _get_or_create_active_fiscal_document(sale, tenant):
    """Return one active document, recovering when a concurrent request wins."""
    try:
        with transaction.atomic():
            return FiscalDocument.all_objects.get_or_create(
                sale=sale,
                is_active=True,
                defaults={'tenant': tenant, 'status': FiscalDocument.STATUS_QUEUED},
            )
    except IntegrityError:
        return (
            FiscalDocument.all_objects.filter(sale=sale, is_active=True)
            .order_by('-attempt_number')
            .first(),
            False,
        )


# =============================================================================
# Sprint 7 — existing endpoints (unchanged)
# =============================================================================


class FiscalStatusView(RetrieveAPIView):
    permission_classes = [IsAuthenticated, HasActiveTenant, HasVerifiedMFA]
    serializer_class = FiscalStatusSerializer

    def get_object(self):
        doc = (
            FiscalDocument.all_objects.filter(
                sale_id=self.kwargs['sale_id'],
                tenant=self.request.tenant,
            )
            .order_by('-attempt_number')
            .first()
        )
        if doc is None:
            raise Http404('Fiscal document not found.')
        return doc


class RequestFiscalView(CreateAPIView):
    permission_classes = [IsAuthenticated, HasActiveTenant, HasVerifiedMFA]
    serializer_class = FiscalRequestSerializer

    def create(self, request, *args, **kwargs):
        from fiscal.tasks import handle_sale_completed
        from sales.models import Sale

        sale_id = self.kwargs.get('sale_id') or request.data.get('sale_id')
        try:
            sale = Sale.all_objects.select_related('branch', 'tenant').get(
                id=sale_id,
                tenant=request.tenant,
            )
        except Sale.DoesNotExist:
            return Response(
                {'detail': 'Venda não encontrada.'},
                status=404,
            )

        if sale.status != 'confirmed':
            return Response(
                {'detail': 'Apenas vendas confirmadas podem solicitar emissão fiscal.'},
                status=400,
            )

        doc, created = _get_or_create_active_fiscal_document(sale, request.tenant)
        if not created and doc.status != FiscalDocument.STATUS_QUEUED:
            return Response(
                FiscalStatusSerializer(doc).data,
                status=201,
            )

        try:
            handle_sale_completed.delay(str(sale.id), tenant_id=str(request.tenant.id))
        except Exception:
            logger.exception('Could not enqueue fiscal emission for sale %s', sale.id)
            return Response(
                {'detail': 'Emissão fiscal aguardando nova tentativa de publicação.'},
                status=503,
            )

        return Response(
            FiscalStatusSerializer(doc).data,
            status=201,
        )


class FiscalConfigView(APIView):
    permission_classes = [IsAuthenticated, HasActiveTenant]

    def get(self, request):
        from tenancy.models import Branch

        branch_id = request.query_params.get('branch')
        if not branch_id:
            return Response({'detail': 'branch query parameter is required.'}, status=400)
        try:
            branch = Branch.all_objects.get(id=branch_id, tenant=request.tenant)
        except Branch.DoesNotExist:
            return Response({'detail': 'Branch not found.'}, status=404)

        emitter = resolve_emitter(branch)
        return Response(
            {
                'has_fiscal_config': emitter is not None,
                'emitter_id': str(emitter.id) if emitter else None,
            }
        )


class OCRNFeView(APIView):
    permission_classes = [IsAuthenticated, HasActiveTenant, HasVerifiedMFA]

    def post(self, request):
        xml_content = request.data.get('xml_content', '')
        if not xml_content:
            return Response({'detail': 'xml_content is required.'}, status=400)
        try:
            result = parse_nfe_xml(xml_content)
        except Exception as exc:
            return Response(
                {'detail': f'Falha ao processar XML: {exc}'},
                status=400,
            )
        return Response(result)


class ReceiptFiscalValidateView(APIView):
    permission_classes = [IsAuthenticated, HasActiveTenant, HasVerifiedMFA]

    def post(self, request, receipt_id):
        from purchasing.models import PurchaseReceipt

        try:
            receipt = PurchaseReceipt.all_objects.select_related(
                'purchase_order__supplier',
                'purchase_order__branch',
            ).get(id=receipt_id, tenant=request.tenant)
        except PurchaseReceipt.DoesNotExist:
            return Response({'detail': 'Recebimento não encontrado.'}, status=404)

        cfop = request.data.get('cfop', '')
        result = reconcile_receipt_fiscal(receipt, request.tenant, cfop=cfop or None)

        return Response(
            {
                'receipt_id': str(receipt.id),
                'cfop': result['document'].cfop if result['document'] else (cfop or ''),
                'issues': result['issues'],
                'warnings': result['warnings'],
                'requires_attention': bool(result['issues']),
                'created': result['document'] is not None,
                'document_id': str(result['document'].id) if result['document'] else None,
            }
        )


# =============================================================================
# Sprint 20 — management endpoints (write-only secret, paginated, filters)
# =============================================================================


def _problem(detail, code, status_code):
    return Response(
        {
            'type': f'https://docs.tjsys.local/errors/{code}',
            'title': code.replace('_', ' ').title(),
            'status': status_code,
            'detail': str(detail),
            'code': code,
        },
        status=status_code,
        content_type='application/problem+json',
    )


class FiscalEmitterViewSet(viewsets.ModelViewSet):
    """CRUD for fiscal emitters. Write-only api_key — never returned."""

    permission_classes = [IsAuthenticated, HasActiveTenant, HasVerifiedMFA, HasCapability]
    required_capability = 'fiscal.manage'
    queryset = FiscalEmitter.all_objects.all()
    filterset_fields = ['branch', 'provider', 'is_active']

    def get_serializer_class(self):
        if self.action in {'create', 'update', 'partial_update'}:
            return FiscalEmitterWriteSerializer
        return FiscalEmitterSerializer

    def get_queryset(self):
        return FiscalEmitter.all_objects.filter(tenant=self.request.tenant).order_by('-created_at')

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        emitter = serializer.save(tenant=request.tenant)
        # Write-only secret — return only `configured: true`
        body = FiscalEmitterSerializer(emitter).data
        body['configured'] = True
        return Response(body, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        emitter = serializer.save()
        body = FiscalEmitterSerializer(emitter).data
        body['configured'] = True
        return Response(body)


class FiscalDocumentViewSet(viewsets.ReadOnlyModelViewSet):
    """List/detail fiscal documents, retry, cancel and authorized downloads."""

    permission_classes = [IsAuthenticated, HasActiveTenant, HasVerifiedMFA, HasCapability]
    required_capability = 'fiscal.view'
    filterset_fields = ['status', 'direction', 'sale', 'purchase_order', 'receipt']

    def get_queryset(self):
        return FiscalDocument.all_objects.filter(tenant=self.request.tenant).order_by('-created_at')

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return FiscalDocumentDetailSerializer
        return FiscalDocumentSerializer

    def _problem(self, detail, code, status_code):
        return _problem(detail, code, status_code)

    @action(detail=True, methods=['post'])
    def retry(self, request, pk=None):
        doc = self.get_object()
        prev_status = doc.status
        if prev_status in {FiscalDocument.STATUS_CONCLUDED, FiscalDocument.STATUS_CANCELLED}:
            return self._problem(
                'Documento concluído ou cancelado não permite retry.',
                'fiscal_retry_conflict',
                409,
            )
        reason = request.data.get('reason', '')
        if not reason:
            return self._problem('Motivo é obrigatório.', 'reason_required', 422)
        try:
            new_doc = emit_document(doc)
        except Exception as exc:  # pragma: no cover — defensive
            return self._problem(str(exc), 'fiscal_retry_failed', 500)
        serializer = self.get_serializer(new_doc)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        doc = self.get_object()
        if doc.status == FiscalDocument.STATUS_CANCELLED:
            return self._problem(
                'Documento já está cancelado.',
                'fiscal_already_cancelled',
                409,
            )
        reason = request.data.get('reason', '')
        if not reason:
            return self._problem('Motivo é obrigatório.', 'reason_required', 422)
        new_doc = FiscalDocument.all_objects.create(
            tenant=request.tenant,
            sale=doc.sale,
            purchase_order=doc.purchase_order,
            receipt=doc.receipt,
            direction=doc.direction,
            status=FiscalDocument.STATUS_CANCELLED,
            attempt_number=FiscalDocument.all_objects.filter(
                tenant=request.tenant,
                sale=doc.sale,
            ).count()
            + 1,
            is_active=False,
            error_detail=reason,
        )
        serializer = self.get_serializer(new_doc)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'])
    def xml(self, request, pk=None):
        doc = self.get_object()
        if doc.status != FiscalDocument.STATUS_CONCLUDED:
            return self._problem(
                'Documento não permite download enquanto não concluído.',
                'xml_download_forbidden',
                403,
            )
        # For Sprint 20 the XML is stubbed — real provider integration returns bytes here.
        return HttpResponse(
            '<?xml version="1.0" encoding="UTF-8"?><nfe></nfe>',
            content_type='application/xml',
        )

    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        doc = self.get_object()
        if doc.status not in {FiscalDocument.STATUS_CONCLUDED, FiscalDocument.STATUS_PROCESSING}:
            return self._problem(
                'Documento não permite download de PDF neste estado.',
                'pdf_download_forbidden',
                403,
            )
        return HttpResponse(
            b'%PDF-1.4 stub',
            content_type='application/pdf',
        )


class FiscalProductConfigViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, HasActiveTenant, HasVerifiedMFA, HasCapability]
    required_capability = 'fiscal.manage'
    serializer_class = FiscalProductConfigSerializer
    filterset_fields = ['product']

    def get_queryset(self):
        return FiscalProductConfig.all_objects.filter(tenant=self.request.tenant).order_by(
            '-created_at'
        )

    def create(self, request, *args, **kwargs):
        # Upsert semantics — if a config exists for the same product, update it.
        product_id = request.data.get('product')
        existing = None
        if product_id:
            existing = FiscalProductConfig.all_objects.filter(
                tenant=request.tenant,
                product_id=product_id,
            ).first()
        if existing is not None:
            serializer = self.get_serializer(existing, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        config = serializer.save(tenant=request.tenant)
        return Response(self.get_serializer(config).data, status=status.HTTP_201_CREATED)
