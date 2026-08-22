from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ecommerce.models import Channel, Marketplace, OnlineOrder
from tenancy.permissions import HasActiveTenant, HasCapability


class ChannelSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField(max_length=100)
    slug = serializers.SlugField(max_length=60)
    channel_type = serializers.ChoiceField(
        choices=[
            ('ecommerce', 'E-commerce'),
            ('marketplace', 'Marketplace'),
            ('pos', 'PDV'),
            ('api', 'API'),
        ],
        default='ecommerce',
    )
    status = serializers.ChoiceField(
        choices=[
            ('active', 'Ativo'),
            ('inactive', 'Inativo'),
            ('pending', 'Pendente'),
        ],
        default='active',
    )
    description = serializers.CharField(required=False, allow_blank=True, default='')
    base_url = serializers.URLField(required=False, allow_blank=True, default='')
    api_key = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')
    api_secret = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')
    webhook_url = serializers.URLField(required=False, allow_blank=True, default='')
    config_json = serializers.DictField(default=dict)
    is_active = serializers.BooleanField(default=True)
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)


class ChannelViewSet(viewsets.ModelViewSet):
    serializer_class = ChannelSerializer
    permission_classes = [IsAuthenticated, HasActiveTenant, HasCapability]
    required_capability = 'ecommerce.view'

    def get_queryset(self):
        return Channel.objects.filter(tenant=self.request.tenant)

    def get_permissions(self):
        permissions = [IsAuthenticated(), HasActiveTenant()]
        write_actions = {'create', 'update', 'partial_update', 'destroy'}
        if self.action in write_actions:
            from tenancy.permissions import HasVerifiedMFA
            permissions.append(HasVerifiedMFA())
        permissions.append(HasCapability())
        return permissions

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.tenant)


class MarketplaceSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    channel = serializers.UUIDField()
    name = serializers.CharField(max_length=100)
    slug = serializers.SlugField(max_length=60)
    marketplace_id = serializers.CharField(
        max_length=100,
        required=False,
        allow_blank=True,
        default='',
    )
    status = serializers.ChoiceField(
        choices=[
            ('active', 'Ativo'),
            ('inactive', 'Inativo'),
            ('pending', 'Pendente'),
        ],
        default='active',
    )
    commission_type = serializers.ChoiceField(
        choices=[
            ('percentage', 'Porcentagem'),
            ('fixed', 'Fixo'),
        ],
        default='percentage',
    )
    commission_value = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0'),
    )
    fee_percentage = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('0'),
    )
    fee_fixed = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0'),
    )
    config_json = serializers.DictField(default=dict)
    is_active = serializers.BooleanField(default=True)
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)


class MarketplaceViewSet(viewsets.ModelViewSet):
    serializer_class = MarketplaceSerializer
    permission_classes = [IsAuthenticated, HasActiveTenant, HasCapability]
    required_capability = 'ecommerce.view'

    def get_queryset(self):
        return Marketplace.objects.select_related('channel').filter(tenant=self.request.tenant)

    def get_permissions(self):
        permissions = [IsAuthenticated(), HasActiveTenant()]
        write_actions = {'create', 'update', 'partial_update', 'destroy'}
        if self.action in write_actions:
            from tenancy.permissions import HasVerifiedMFA
            permissions.append(HasVerifiedMFA())
        permissions.append(HasCapability())
        return permissions

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.tenant)


class OnlineOrderSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    channel = serializers.UUIDField()
    marketplace = serializers.UUIDField(required=False, allow_null=True)
    sale = serializers.UUIDField(required=False, allow_null=True)
    external_order_id = serializers.CharField(max_length=100)
    status = serializers.ChoiceField(
        choices=[
            ('pending', 'Pendente'),
            ('confirmed', 'Confirmado'),
            ('processing', 'Processando'),
            ('shipped', 'Enviado'),
            ('delivered', 'Entregue'),
            ('cancelled', 'Cancelado'),
            ('refunded', 'Reembolsado'),
        ],
        default='pending',
    )
    payment_status = serializers.ChoiceField(
        choices=[
            ('pending', 'Pendente'),
            ('approved', 'Aprovado'),
            ('rejected', 'Rejeitado'),
            ('refunded', 'Reembolsado'),
        ],
        default='pending',
    )
    customer_name = serializers.CharField(max_length=200)
    customer_email = serializers.EmailField(required=False, allow_blank=True, default='')
    customer_phone = serializers.CharField(
        max_length=20,
        required=False,
        allow_blank=True,
        default='',
    )
    shipping_address = serializers.DictField(default=dict)
    billing_address = serializers.DictField(default=dict)
    subtotal = serializers.DecimalField(max_digits=18, decimal_places=2)
    shipping_cost = serializers.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=Decimal('0'),
    )
    discount_amount = serializers.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=Decimal('0'),
    )
    tax_amount = serializers.DecimalField(
        max_digits=18,
        decimal_places=2,
        default=Decimal('0'),
    )
    total_amount = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    currency = serializers.CharField(max_length=3, default='BRL')
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    shipped_at = serializers.DateTimeField(required=False, allow_null=True)
    delivered_at = serializers.DateTimeField(required=False, allow_null=True)
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)


class OnlineOrderViewSet(viewsets.ModelViewSet):
    serializer_class = OnlineOrderSerializer
    permission_classes = [IsAuthenticated, HasActiveTenant, HasCapability]
    required_capability = 'ecommerce.view'

    def get_queryset(self):
        return OnlineOrder.objects.select_related(
            'channel',
            'marketplace',
            'sale',
        ).filter(tenant=self.request.tenant)

    def get_permissions(self):
        permissions = [IsAuthenticated(), HasActiveTenant()]
        write_actions = {
            'create',
            'update',
            'partial_update',
            'destroy',
            'confirm',
            'ship',
            'deliver',
            'cancel',
        }
        if self.action in write_actions:
            from tenancy.permissions import HasVerifiedMFA
            permissions.append(HasVerifiedMFA())
        permissions.append(HasCapability())
        return permissions

    def perform_create(self, serializer):
        serializer.save(tenant=self.request.tenant)

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        order = self.get_object()
        if order.status != 'pending':
            return Response({'detail': 'Only pending orders can be confirmed.'}, status=400)
        order.status = 'confirmed'
        order.full_clean()
        order.save()
        return Response(OnlineOrderSerializer(order).data)

    @action(detail=True, methods=['post'])
    def ship(self, request, pk=None):
        order = self.get_object()
        if order.status != 'confirmed':
            return Response({'detail': 'Only confirmed orders can be shipped.'}, status=400)
        order.status = 'shipped'
        order.shipped_at = timezone.now()
        order.full_clean()
        order.save()
        return Response(OnlineOrderSerializer(order).data)

    @action(detail=True, methods=['post'])
    def deliver(self, request, pk=None):
        order = self.get_object()
        if order.status != 'shipped':
            return Response({'detail': 'Only shipped orders can be delivered.'}, status=400)
        order.status = 'delivered'
        order.delivered_at = timezone.now()
        order.full_clean()
        order.save()
        return Response(OnlineOrderSerializer(order).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        order = self.get_object()
        if order.status in ('cancelled', 'refunded', 'delivered'):
            return Response({'detail': 'Cannot cancel this order.'}, status=400)
        order.status = 'cancelled'
        order.full_clean()
        order.save()
        return Response(OnlineOrderSerializer(order).data)
