from django.db import models
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.pagination import CursorPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog.models import (
    BranchPrice,
    Category,
    Product,
    ProductCode,
    ProductFiscalData,
    ProductPrice,
    ProductPriceTier,
    ProductUnit,
    Unit,
)
from catalog.permissions import CatalogCapabilityPermission, PricingCapabilityPermission
from catalog.serializers import (
    BranchPriceSerializer,
    CategorySerializer,
    ProductCodeSerializer,
    ProductFiscalDataSerializer,
    ProductPriceSerializer,
    ProductPriceTierSerializer,
    ProductSerializer,
    ProductUnitSerializer,
    UnitSerializer,
)
from catalog.services.events import emit_catalog_event
from catalog.services.pricing import PriceNotAvailable, resolve_effective_price
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
