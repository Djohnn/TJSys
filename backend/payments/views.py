from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from sales.models import Sale
from tenancy.permissions import HasActiveTenant, HasCapability, HasVerifiedMFA

from .models import (
    PaymentIntent,
    PaymentProviderConfig,
    PaymentReconciliationBatch,
    PaymentTransaction,
)
from .serializers import (
    PaymentIntentInputSerializer,
    PaymentIntentSerializer,
    PaymentProviderConfigReadSerializer,
    PaymentProviderConfigWriteSerializer,
    PaymentReconciliationBatchSerializer,
    PaymentTransactionSerializer,
    PaymentWebhookEventSerializer,
    ReconciliationBatchInputSerializer,
)
from .services import (
    InvalidWebhookSignature,
    ReconciliationDivergence,
    confirm_reconciliation,
    create_payment_intent,
    import_reconciliation_batch,
    process_webhook,
)


def _problem(detail, code, status_code):
    return Response({
        'type': f'https://docs.zyrp.local/errors/{code}',
        'title': code.replace('_', ' ').title(),
        'status': status_code,
        'detail': str(detail),
        'code': code,
    }, status=status_code, content_type='application/problem+json')


class PaymentIntentCreateView(APIView):
    permission_classes = [IsAuthenticated, HasActiveTenant]

    def post(self, request):
        serializer = PaymentIntentInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        sale = Sale.all_objects.filter(tenant=request.tenant, id=data['sale']).first()
        config = PaymentProviderConfig.all_objects.filter(
            tenant=request.tenant, id=data['provider_config'], is_active=True,
        ).first()
        if sale is None or config is None:
            return _problem('Sale or provider config not found.', 'not_found', 404)
        intent = create_payment_intent(
            tenant=request.tenant, sale=sale, provider_config=config,
            idempotency_key=data['idempotency_key'], actor=request.user,
        )
        return Response(PaymentIntentSerializer(intent).data, status=status.HTTP_201_CREATED)


class PaymentTransactionViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = PaymentTransactionSerializer
    permission_classes = [IsAuthenticated, HasActiveTenant, HasCapability]
    required_capability = 'payments.view'
    filterset_fields = ['intent', 'transaction_type', 'status']

    def get_queryset(self):
        return PaymentTransaction.all_objects.filter(tenant=self.request.tenant)


class PaymentIntentViewSet(viewsets.ModelViewSet):
    """List, detail and create payment intents. Only create is mutable."""
    permission_classes = [IsAuthenticated, HasActiveTenant, HasCapability]
    required_capability = 'payments.view'
    filterset_fields = ['sale', 'provider_config', 'status']

    def get_queryset(self):
        return PaymentIntent.all_objects.filter(tenant=self.request.tenant).order_by('-created_at')

    def get_serializer_class(self):
        if self.action == 'create':
            return PaymentIntentInputSerializer
        return PaymentIntentSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        sale = Sale.all_objects.filter(tenant=request.tenant, id=data['sale']).first()
        config = PaymentProviderConfig.all_objects.filter(
            tenant=request.tenant, id=data['provider_config'], is_active=True,
        ).first()
        if sale is None or config is None:
            return _problem('Sale or provider config not found.', 'not_found', 404)
        intent = create_payment_intent(
            tenant=request.tenant, sale=sale, provider_config=config,
            idempotency_key=data['idempotency_key'], actor=request.user,
        )
        return Response(PaymentIntentSerializer(intent).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        return _problem('Intents are immutable.', 'intent_immutable', 405)

    def partial_update(self, request, *args, **kwargs):
        return _problem('Intents are immutable.', 'intent_immutable', 405)

    def destroy(self, request, *args, **kwargs):
        return _problem('Intents are immutable.', 'intent_immutable', 405)


class PaymentProviderConfigViewSet(viewsets.ModelViewSet):
    """Provider config with write-only secret — never returns the stored value."""

    permission_classes = [IsAuthenticated, HasActiveTenant, HasVerifiedMFA, HasCapability]
    required_capability = 'payments.manage'
    serializer_class = PaymentProviderConfigReadSerializer
    filterset_fields = ['provider', 'is_active']

    def get_queryset(self):
        return PaymentProviderConfig.all_objects.filter(tenant=self.request.tenant).order_by('-created_at')

    def get_serializer_class(self):
        if self.action in {'create', 'update', 'partial_update'}:
            return PaymentProviderConfigWriteSerializer
        return PaymentProviderConfigReadSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        config = serializer.save(tenant=request.tenant)
        body = PaymentProviderConfigReadSerializer(config).data
        body['configured'] = True
        return Response(body, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        config = serializer.save()
        body = PaymentProviderConfigReadSerializer(config).data
        body['configured'] = True
        return Response(body)


class PaymentReconciliationBatchViewSet(viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated, HasActiveTenant, HasCapability]
    required_capability = 'payments.view'
    serializer_class = PaymentReconciliationBatchSerializer
    filterset_fields = ['provider', 'status']

    def get_queryset(self):
        return PaymentReconciliationBatch.all_objects.filter(tenant=self.request.tenant).order_by('-created_at')

    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    def retrieve(self, request, pk=None):
        batch = self.get_object()
        serializer = self.get_serializer(batch)
        return Response(serializer.data)

    def create(self, request):
        serializer = ReconciliationBatchInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        batch = import_reconciliation_batch(
            tenant=request.tenant, **serializer.validated_data,
        )
        return Response(self.get_serializer(batch).data, status=201)

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        try:
            batch = confirm_reconciliation(batch=self.get_object(), actor=request.user)
        except ReconciliationDivergence as exc:
            return _problem(exc, 'reconciliation_divergence', 409)
        return Response(self.get_serializer(batch).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated, HasActiveTenant])
def payment_webhook(request, provider):
    try:
        event = process_webhook(
            tenant=request.tenant, provider=provider, payload=request.body,
            signature=request.headers.get('X-Payment-Signature', ''),
        )
    except InvalidWebhookSignature as exc:
        return _problem(exc, 'invalid_webhook_signature', 400)
    except PaymentProviderConfig.DoesNotExist:
        return _problem('Provider not configured.', 'provider_not_found', 404)
    return Response(PaymentWebhookEventSerializer(event).data)
