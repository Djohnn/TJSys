from django.db import models
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import CursorPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog.models import (
    BranchPrice,
    Brand,
    Category,
    ComboItem,
    CommercialCombo,
    LabelTemplate,
    Product,
    ProductChannelProfile,
    ProductCode,
    ProductComposition,
    ProductFiscalData,
    ProductImage,
    ProductPrice,
    ProductPriceTier,
    ProductUnit,
    Unit,
)
from catalog.permissions import CatalogCapabilityPermission, PricingCapabilityPermission
from catalog.serializers import (
    BranchPriceSerializer,
    BrandSerializer,
    CategorySerializer,
    ComboItemSerializer,
    CommercialComboSerializer,
    LabelGenerateSerializer,
    LabelTemplateSerializer,
    ProductChannelProfileSerializer,
    ProductCodeSerializer,
    ProductCompositionSerializer,
    ProductFiscalDataSerializer,
    ProductImageSerializer,
    ProductPriceSerializer,
    ProductPriceTierSerializer,
    ProductSerializer,
    ProductUnitSerializer,
    UnitSerializer,
)
from catalog.services.events import emit_catalog_event
from catalog.services.label_pdf import generate_label_pdf
from catalog.services.pricing import PriceNotAvailable, resolve_effective_price
from outbox.models import OutboxMessage
from tenancy.permissions import HasActiveTenant, HasVerifiedMFA


def _resolve_effective_price_response(request, product):
    branch_id = request.query_params.get('branch_id')
    if not branch_id:
        return Response(
            {
                'type': 'about:blank',
                'title': 'Bad Request',
                'status': 400,
                'detail': 'branch_id is required.',
                'code': 'VALIDATION_FAILED',
            },
            status=400,
            content_type='application/problem+json',
        )
    from tenancy.models import Branch

    branch = get_object_or_404(Branch, id=branch_id, tenant=request.tenant)
    at = request.query_params.get('at')
    if at:
        from django.utils.dateparse import parse_datetime

        at_dt = parse_datetime(at)
        if at_dt is None:
            return Response(
                {
                    'type': 'about:blank',
                    'title': 'Bad Request',
                    'status': 400,
                    'detail': 'Invalid "at" datetime.',
                    'code': 'VALIDATION_FAILED',
                },
                status=400,
                content_type='application/problem+json',
            )
    else:
        from django.utils import timezone

        at_dt = timezone.now()
    try:
        price = resolve_effective_price(
            product=product,
            branch=branch,
            at=at_dt,
        )
    except PriceNotAvailable:
        return Response(
            {
                'type': 'about:blank',
                'title': 'Not Found',
                'status': 404,
                'detail': 'No active price for this product.',
                'code': 'CATALOG_PRICE_NOT_AVAILABLE',
            },
            status=404,
            content_type='application/problem+json',
        )
    source = 'branch' if isinstance(price, BranchPrice) else 'tenant'
    data = {
        'id': str(price.id),
        'amount': str(price.amount),
        'currency': 'BRL',
        'source': source,
        'valid_from': price.valid_from.isoformat() if price.valid_from else None,
        'valid_to': price.valid_to.isoformat() if price.valid_to else None,
    }
    return Response(data)


class CatalogCursorPagination(CursorPagination):
    ordering = '-created_at'
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 100


class CatalogViewSetBase(viewsets.ModelViewSet):
    pagination_class = CatalogCursorPagination
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
        HasVerifiedMFA,
        CatalogCapabilityPermission,
    ]

    def get_queryset(self):
        qs = self.queryset.model.objects.filter(tenant=self.request.tenant)
        search = self.request.query_params.get('search')
        if search and hasattr(qs.model, 'name'):
            qs = qs.filter(name__icontains=search)
        q = self.request.query_params.get('q')
        if q:
            qs = self._apply_q_filter(qs, q)
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == 'true')
        return qs

    def _apply_q_filter(self, qs, q):
        if hasattr(qs.model, 'name'):
            return qs.filter(name__icontains=q)
        return qs

    def perform_create(self, serializer):
        instance = serializer.save(tenant=self.request.tenant)
        emit_catalog_event(
            action=f'catalog.{instance._meta.model_name}.created',
            event_type=f'catalog.{instance._meta.model_name}.created',
            instance=instance,
            request=self.request,
        )
        return instance

    def perform_destroy(self, instance):
        emit_catalog_event(
            action=f'catalog.{instance._meta.model_name}.deactivated',
            event_type=f'catalog.{instance._meta.model_name}.deactivated',
            instance=instance,
            request=self.request,
        )
        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if_match = request.headers.get('If-Match')
        if if_match is not None and str(instance.version) != if_match:
            return Response(
                {
                    'type': 'about:blank',
                    'title': 'Conflict',
                    'status': 409,
                    'detail': 'Version mismatch.',
                    'code': 'CONFLICT_VERSION_MISMATCH',
                },
                status=status.HTTP_409_CONFLICT,
                content_type='application/problem+json',
            )
        return super().update(request, *args, **kwargs)

    def perform_update(self, serializer):
        instance = serializer.save()
        instance.version += 1
        instance.save(update_fields=['version'])
        emit_catalog_event(
            action=f'catalog.{instance._meta.model_name}.updated',
            event_type=f'catalog.{instance._meta.model_name}.updated',
            instance=instance,
            request=self.request,
        )
        return instance


class UnitViewSet(CatalogViewSetBase):
    queryset = Unit.objects.all()
    serializer_class = UnitSerializer


class CategoryViewSet(CatalogViewSetBase):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer


class ProductViewSet(CatalogViewSetBase):
    queryset = Product.objects.select_related('category', 'base_unit')
    serializer_class = ProductSerializer

    def _apply_q_filter(self, qs, q):
        return qs.filter(models.Q(name__icontains=q) | models.Q(sku__icontains=q))

    def get_queryset(self):
        qs = super().get_queryset()
        category = self.request.query_params.get('category')
        if category:
            qs = qs.filter(category_id=category)
        return qs


class ProductUnitViewSet(CatalogViewSetBase):
    queryset = ProductUnit.objects.select_related('product', 'unit')
    serializer_class = ProductUnitSerializer

    def get_queryset(self):
        return super().get_queryset().filter(product_id=self.kwargs.get('product_pk'))

    def perform_create(self, serializer):
        product = get_object_or_404(
            Product,
            id=self.kwargs.get('product_pk'),
            tenant=self.request.tenant,
        )
        instance = serializer.save(tenant=self.request.tenant, product=product)
        emit_catalog_event(
            action='catalog.productunit.created',
            event_type='catalog.productunit.created',
            instance=instance,
            request=self.request,
        )
        return instance


class ProductCodeViewSet(CatalogViewSetBase):
    queryset = ProductCode.objects.select_related('product')
    serializer_class = ProductCodeSerializer

    def get_queryset(self):
        return super().get_queryset().filter(product_id=self.kwargs.get('product_pk'))

    def perform_create(self, serializer):
        product = get_object_or_404(
            Product,
            id=self.kwargs.get('product_pk'),
            tenant=self.request.tenant,
        )
        instance = serializer.save(tenant=self.request.tenant, product=product)
        emit_catalog_event(
            action='catalog.productcode.created',
            event_type='catalog.productcode.created',
            instance=instance,
            request=self.request,
        )
        return instance


class ProductPriceViewSet(CatalogViewSetBase):
    queryset = ProductPrice.objects.select_related('product')
    serializer_class = ProductPriceSerializer
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
        HasVerifiedMFA,
        PricingCapabilityPermission,
    ]

    def get_queryset(self):
        return super().get_queryset().filter(product_id=self.kwargs.get('product_pk'))

    def perform_create(self, serializer):
        product = get_object_or_404(
            Product,
            id=self.kwargs.get('product_pk'),
            tenant=self.request.tenant,
        )
        instance = serializer.save(tenant=self.request.tenant, product=product)
        emit_catalog_event(
            action='catalog.price.changed',
            event_type='catalog.price.changed',
            instance=instance,
            request=self.request,
        )
        return instance

    def perform_update(self, serializer):
        instance = serializer.save()
        instance.version += 1
        instance.save(update_fields=['version'])
        emit_catalog_event(
            action='catalog.price.changed',
            event_type='catalog.price.changed',
            instance=instance,
            request=self.request,
        )
        return instance


class BranchPriceViewSet(CatalogViewSetBase):
    queryset = BranchPrice.objects.select_related('product', 'branch')
    serializer_class = BranchPriceSerializer
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
        HasVerifiedMFA,
        PricingCapabilityPermission,
    ]

    def get_queryset(self):
        return super().get_queryset().filter(product_id=self.kwargs.get('product_pk'))

    def perform_create(self, serializer):
        product = get_object_or_404(
            Product,
            id=self.kwargs.get('product_pk'),
            tenant=self.request.tenant,
        )
        instance = serializer.save(tenant=self.request.tenant, product=product)
        emit_catalog_event(
            action='catalog.price.changed',
            event_type='catalog.price.changed',
            instance=instance,
            request=self.request,
        )
        return instance

    def perform_update(self, serializer):
        instance = serializer.save()
        instance.version += 1
        instance.save(update_fields=['version'])
        emit_catalog_event(
            action='catalog.price.changed',
            event_type='catalog.price.changed',
            instance=instance,
            request=self.request,
        )
        return instance


# =========================================================================
# Sprint 22 — ProductFiscalData (1:1 nested under product)
# =========================================================================


class ProductFiscalDataView(APIView):
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
        HasVerifiedMFA,
        CatalogCapabilityPermission,
    ]

    def get(self, request, product_pk):
        product = get_object_or_404(
            Product,
            id=product_pk,
            tenant=request.tenant,
        )
        fd = get_object_or_404(
            ProductFiscalData,
            product=product,
            tenant=request.tenant,
        )
        serializer = ProductFiscalDataSerializer(fd)
        return Response(serializer.data)

    def post(self, request, product_pk):
        product = get_object_or_404(
            Product,
            id=product_pk,
            tenant=request.tenant,
        )
        existing = ProductFiscalData.objects.filter(
            product=product,
            tenant=request.tenant,
        ).first()

        if existing is not None:
            serializer = ProductFiscalDataSerializer(
                existing,
                data=request.data,
                partial=True,
            )
            serializer.is_valid(raise_exception=True)
            serializer.save(tenant=request.tenant, product=product)
            emit_catalog_event(
                action='catalog.productfiscaldata.updated',
                event_type='catalog.productfiscaldata.updated',
                instance=existing,
                request=request,
            )
            return Response(serializer.data, status=status.HTTP_200_OK)

        serializer = ProductFiscalDataSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(tenant=request.tenant, product=product)
        emit_catalog_event(
            action='catalog.productfiscaldata.created',
            event_type='catalog.productfiscaldata.created',
            instance=serializer.instance,
            request=request,
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)


# =========================================================================
# Sprint 22 — ProductPriceTier (collection nested under product)
# =========================================================================


class ProductPriceTierViewSet(CatalogViewSetBase):
    queryset = ProductPriceTier.objects.select_related('product', 'price')
    serializer_class = ProductPriceTierSerializer
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
        HasVerifiedMFA,
        PricingCapabilityPermission,
    ]

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(
                product_id=self.kwargs.get('product_pk'),
            )
        )

    def perform_create(self, serializer):
        product = get_object_or_404(
            Product,
            id=self.kwargs.get('product_pk'),
            tenant=self.request.tenant,
        )
        instance = serializer.save(
            tenant=self.request.tenant,
            product=product,
        )
        emit_catalog_event(
            action='catalog.productpricetier.created',
            event_type='catalog.productpricetier.created',
            instance=instance,
            request=self.request,
        )
        return instance

    def perform_destroy(self, instance):
        emit_catalog_event(
            action='catalog.productpricetier.deactivated',
            event_type='catalog.productpricetier.deactivated',
            instance=instance,
            request=self.request,
        )
        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])


class EffectivePriceView(APIView):
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
        HasVerifiedMFA,
        PricingCapabilityPermission,
    ]

    def get(self, request, product_id):
        product = get_object_or_404(
            Product,
            id=product_id,
            tenant=request.tenant,
        )
        return _resolve_effective_price_response(request, product)


class BrandViewSet(CatalogViewSetBase):
    queryset = Brand.objects.all()
    serializer_class = BrandSerializer
    filterset_fields = ['is_active']

    def get_queryset(self):
        return Brand.objects.filter(tenant=self.request.tenant).order_by('name')


class ProductImageViewSet(viewsets.ModelViewSet):
    serializer_class = ProductImageSerializer
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
        HasVerifiedMFA,
        CatalogCapabilityPermission,
    ]

    def get_queryset(self):
        product_id = self.kwargs['product_pk']
        return ProductImage.all_objects.filter(tenant=self.request.tenant, product_id=product_id)

    def perform_create(self, serializer):
        product = get_object_or_404(
            Product,
            id=self.kwargs.get('product_pk'),
            tenant=self.request.tenant,
        )
        instance = serializer.save(tenant=self.request.tenant, product=product)
        emit_catalog_event(
            action='catalog.productimage.created',
            event_type='catalog.productimage.created',
            instance=instance,
            request=self.request,
        )
        return instance

    def perform_destroy(self, instance):
        emit_catalog_event(
            action='catalog.productimage.deleted',
            event_type='catalog.productimage.deleted',
            instance=instance,
            request=self.request,
        )
        super().perform_destroy(instance)


class ProductCompositionViewSet(viewsets.ModelViewSet):
    serializer_class = ProductCompositionSerializer
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
        HasVerifiedMFA,
        CatalogCapabilityPermission,
    ]

    def get_queryset(self):
        product_id = self.kwargs['product_pk']
        return ProductComposition.all_objects.filter(tenant=self.request.tenant, kit_id=product_id)

    def perform_create(self, serializer):
        kit = get_object_or_404(
            Product,
            id=self.kwargs.get('product_pk'),
            tenant=self.request.tenant,
        )
        instance = serializer.save(tenant=self.request.tenant, kit=kit)
        emit_catalog_event(
            action='catalog.productcomposition.created',
            event_type='catalog.productcomposition.created',
            instance=instance,
            request=self.request,
        )
        return instance


# =============================================================================
# Sprint 29 — ProductChannelProfile (CRUD + publish)
# =============================================================================


class ProductChannelProfileViewSet(CatalogViewSetBase):
    queryset = ProductChannelProfile.objects.select_related('product')
    serializer_class = ProductChannelProfileSerializer
    lookup_field = 'channel_slug'
    lookup_url_kwarg = 'slug'
    pagination_class = None

    def get_queryset(self):
        product_pk = self.kwargs.get('product_pk') or self.kwargs.get('product_id')
        return ProductChannelProfile.all_objects.filter(
            tenant=self.request.tenant,
            product_id=product_pk,
        )

    def perform_create(self, serializer):
        product = get_object_or_404(
            Product,
            id=self.kwargs.get('product_pk', self.kwargs.get('product_id')),
            tenant=self.request.tenant,
        )
        instance = serializer.save(tenant=self.request.tenant, product=product)
        emit_catalog_event(
            action='catalog.channelprofile.created',
            event_type='catalog.channelprofile.created',
            instance=instance,
            request=self.request,
        )
        return instance

    def perform_update(self, serializer):
        instance = serializer.save()
        instance.version += 1
        instance.save(update_fields=['version'])
        emit_catalog_event(
            action='catalog.channelprofile.updated',
            event_type='catalog.channelprofile.updated',
            instance=instance,
            request=self.request,
        )
        return instance


class ChannelProfilePublishView(APIView):
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
        HasVerifiedMFA,
        CatalogCapabilityPermission,
    ]

    def post(self, request, product_id, slug):
        product = get_object_or_404(
            Product,
            id=product_id,
            tenant=request.tenant,
        )
        profile = get_object_or_404(
            ProductChannelProfile,
            product=product,
            channel_slug=slug,
            tenant=request.tenant,
        )

        idempotency_key = request.headers.get('Idempotency-Key', '')

        if idempotency_key:
            existing = OutboxMessage.objects.filter(
                event_type='catalog.channel.publication_requested',
                tenant_id=str(request.tenant.id),
                correlation_id=idempotency_key,
            ).first()
            if existing is not None:
                profile.status = 'published'
                profile.published_at = timezone.now()
                profile.save(update_fields=['status', 'published_at', 'updated_at'])
                return Response(
                    ProductChannelProfileSerializer(profile).data,
                    status=status.HTTP_200_OK,
                )

        from outbox.services import create_outbox_message

        tenant_id_str = str(request.tenant.id)
        create_outbox_message(
            event_type='catalog.channel.publication_requested',
            aggregate_type='ProductChannelProfile',
            aggregate_id=str(profile.id),
            payload={
                'id': str(profile.id),
                'channel_slug': profile.channel_slug,
                'status': profile.status,
            },
            correlation_id=idempotency_key,
            tenant_id=tenant_id_str,
            event_version='1',
        )

        profile.status = 'ready'
        profile.save(update_fields=['status', 'updated_at'])

        return Response(
            ProductChannelProfileSerializer(profile).data,
            status=status.HTTP_200_OK,
        )


class CommercialComboViewSet(CatalogViewSetBase):
    queryset = CommercialCombo.objects.prefetch_related('items__item')
    serializer_class = CommercialComboSerializer

    def _apply_q_filter(self, qs, q):
        return qs.filter(
            models.Q(name__icontains=q) | models.Q(sku__icontains=q),
        )

    @action(detail=False, methods=['post'], url_path='(?P<combo_pk>[^/.]+)/items')
    def add_item(self, request, combo_pk=None):
        combo = get_object_or_404(
            CommercialCombo,
            id=combo_pk,
            tenant=request.tenant,
        )
        serializer = ComboItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save(tenant=request.tenant, combo=combo)
        emit_catalog_event(
            action='catalog.comboitem.created',
            event_type='catalog.comboitem.created',
            instance=instance,
            request=request,
        )
        return Response(ComboItemSerializer(instance).data, status=status.HTTP_201_CREATED)

    @action(
        detail=False, methods=['delete'], url_path='(?P<combo_pk>[^/.]+)/items/(?P<item_pk>[^/.]+)'
    )
    def remove_item(self, request, combo_pk=None, item_pk=None):
        combo_item = get_object_or_404(
            ComboItem,
            id=item_pk,
            combo_id=combo_pk,
            tenant=request.tenant,
        )
        emit_catalog_event(
            action='catalog.comboitem.deactivated',
            event_type='catalog.comboitem.deactivated',
            instance=combo_item,
            request=request,
        )
        combo_item.is_active = False
        combo_item.save(update_fields=['is_active', 'updated_at'])
        return Response(status=status.HTTP_204_NO_CONTENT)


# =============================================================================
# Sprint 28 — LabelTemplate (CRUD) + Label Generate (PDF)
# =============================================================================


class LabelTemplateViewSet(CatalogViewSetBase):
    queryset = LabelTemplate.objects.all()
    serializer_class = LabelTemplateSerializer


class LabelGenerateView(APIView):
    permission_classes = [
        IsAuthenticated,
        HasActiveTenant,
        HasVerifiedMFA,
        CatalogCapabilityPermission,
    ]

    def post(self, request):
        serializer = LabelGenerateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        template_id = serializer.validated_data['template_id']
        template = get_object_or_404(
            LabelTemplate,
            id=template_id,
            tenant=request.tenant,
            is_active=True,
        )

        items_data = serializer.validated_data['items']
        product_ids = [item['product_id'] for item in items_data]
        products = Product.objects.filter(
            id__in=product_ids,
            tenant=request.tenant,
            is_active=True,
        ).select_related('base_unit')

        product_map = {p.id: p for p in products}

        label_items: list[dict] = []
        for item in items_data:
            product = product_map.get(item['product_id'])
            if product is None:
                continue

            ean_code = ProductCode.objects.filter(
                product=product,
                tenant=request.tenant,
                code_type='ean',
                is_active=True,
            ).first()

            price = (
                ProductPrice.objects.filter(
                    product=product,
                    tenant=request.tenant,
                    is_active=True,
                )
                .order_by('-valid_from')
                .first()
            )

            label_items.append(
                {
                    'sku': product.sku,
                    'name': product.name,
                    'ean': ean_code.value if ean_code else '',
                    'price': str(price.amount) if price else '0',
                }
            )

        pdf_bytes = generate_label_pdf(
            items=label_items,
            width_mm=template.width_mm,
            height_mm=template.height_mm,
            margin_mm=template.margin_mm,
            columns=template.columns,
            rows=template.rows,
            show_sku=template.show_sku,
            show_barcode=template.show_barcode,
            show_price=template.show_price,
            show_name=template.show_name,
        )

        return Response(
            pdf_bytes,
            status=status.HTTP_200_OK,
            content_type='application/pdf',
            headers={
                'Content-Disposition': 'attachment; filename="labels.pdf"',
            },
        )
