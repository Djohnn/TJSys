import hashlib
import uuid

from rest_framework import generics, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from audit.services import create_audit_record
from tenancy.capabilities import role_allows
from tenancy.models import Branch, Company, Device, TenantMembership
from tenancy.permissions import HasActiveTenant, HasVerifiedMFA
from tenancy.serializers import (
    BranchSerializer,
    CompanySerializer,
    DeviceListSerializer,
    DeviceRegisterSerializer,
    DeviceValidateSerializer,
)


class CompanyListCreateView(generics.ListCreateAPIView):
    serializer_class = CompanySerializer
    permission_classes = [IsAuthenticated, HasActiveTenant, HasVerifiedMFA]

    def get_queryset(self):
        return Company.objects.filter(tenant=self.request.tenant).order_by('name')

    def perform_create(self, serializer):
        company = serializer.save(tenant=self.request.tenant)
        create_audit_record(
            actor=self.request.user,
            action='company.created',
            resource_type='Company',
            resource_id=company.id,
            tenant_id=self.request.tenant.id,
            correlation_id=getattr(self.request, 'correlation_id', ''),
            detail={'name': company.name},
        )


class CompanyDetailView(generics.RetrieveAPIView):
    serializer_class = CompanySerializer
    permission_classes = [IsAuthenticated, HasActiveTenant, HasVerifiedMFA]

    def get_queryset(self):
        return Company.objects.filter(tenant=self.request.tenant)


class DeviceRegisterView(generics.CreateAPIView):
    serializer_class = DeviceRegisterSerializer
    permission_classes = [IsAuthenticated, HasActiveTenant, HasVerifiedMFA]

    def get_queryset(self):
        return Device.objects.filter(tenant=self.request.tenant)

    def perform_create(self, serializer):
        device = serializer.save()
        # Set a default key hash for now - will be updated when device validates
        device.key_hash = 'pending'
        device.save(update_fields=['key_hash'])
        # Create audit record
        create_audit_record(
            actor=self.request.user,
            action='device.registered',
            resource_type='Device',
            resource_id=device.id,
            tenant_id=self.request.tenant.id,
            correlation_id=getattr(self.request, 'correlation_id', ''),
            detail={'name': device.name, 'device_id': device.device_id},
        )


class DeviceValidateView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = DeviceValidateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        api_key = serializer.validated_data['api_key']

        from django.db import connection

        with connection.cursor() as cursor:
            cursor.execute(
                'SELECT id, tenant_id, branch_id, status FROM tenancy_device WHERE key_hash = %s',
                [hashlib.sha256(api_key.encode()).hexdigest()],
            )
            row = cursor.fetchone()

        if not row:
            return Response(
                {'detail': 'Invalid API key', 'code': 'invalid_api_key'},
                status=status.HTTP_401_UNAUTHORIZED,
                content_type='application/problem+json',
            )

        device_id, tenant_id, branch_id, device_status = row

        if device_status != 'active':
            return Response(
                {'detail': 'Device is not active', 'code': 'device_inactive'},
                status=status.HTTP_403_FORBIDDEN,
                content_type='application/problem+json',
            )

        # Generate JWT tokens
        refresh = RefreshToken()
        refresh['device_id'] = str(device_id)
        refresh['branch_id'] = str(branch_id) if branch_id else None
        refresh['tenant_id'] = str(tenant_id)

        return Response(
            {
                'token': str(refresh.access_token),
                'refresh_token': str(refresh),
                'device_id': str(device_id),
                'branch_id': str(branch_id) if branch_id else None,
                'tenant_id': str(tenant_id),
            }
        )


class DeviceRefreshView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        from rest_framework_simplejwt.tokens import RefreshToken

        refresh_token = request.data.get('refresh_token')
        if not refresh_token:
            return Response(
                {'detail': 'Refresh token required', 'code': 'refresh_token_required'},
                status=status.HTTP_400_BAD_REQUEST,
                content_type='application/problem+json',
            )

        try:
            refresh = RefreshToken(refresh_token)
            device_id_claim = refresh.get('device_id')
            tenant_id_claim = refresh.get('tenant_id')
            if not device_id_claim or not tenant_id_claim:
                raise TokenError('Refresh token scope is incomplete')

            try:
                device_id = uuid.UUID(str(device_id_claim))
                tenant_id = uuid.UUID(str(tenant_id_claim))
            except (TypeError, ValueError, AttributeError) as exc:
                raise TokenError('Refresh token scope is invalid') from exc

            device = Device.all_objects.filter(
                id=device_id,
                tenant_id=tenant_id,
                tenant__is_active=True,
                status='active',
            ).first()
            if not device:
                return Response(
                    {'detail': 'Device not found or inactive', 'code': 'device_not_found'},
                    status=status.HTTP_401_UNAUTHORIZED,
                    content_type='application/problem+json',
                )

            new_refresh = RefreshToken()
            new_refresh['device_id'] = str(device.id)
            new_refresh['branch_id'] = str(device.branch_id) if device.branch_id else None
            new_refresh['tenant_id'] = str(device.tenant_id)

            return Response(
                {
                    'token': str(new_refresh.access_token),
                    'refresh_token': str(new_refresh),
                    'device_id': str(device.id),
                    'branch_id': str(device.branch_id) if device.branch_id else None,
                    'tenant_id': str(device.tenant_id),
                }
            )
        except TokenError:
            return Response(
                {'detail': 'Invalid or expired refresh token', 'code': 'invalid_refresh_token'},
                status=status.HTTP_401_UNAUTHORIZED,
                content_type='application/problem+json',
            )


class BranchListCreateView(generics.ListCreateAPIView):
    serializer_class = BranchSerializer
    permission_classes = [IsAuthenticated, HasActiveTenant, HasVerifiedMFA]

    def get_queryset(self):
        return Branch.objects.filter(tenant=self.request.tenant).select_related('company')

    def perform_create(self, serializer):
        branch = serializer.save(tenant=self.request.tenant)
        create_audit_record(
            actor=self.request.user,
            action='branch.created',
            resource_type='Branch',
            resource_id=branch.id,
            tenant_id=self.request.tenant.id,
            correlation_id=getattr(self.request, 'correlation_id', ''),
            detail={'name': branch.name},
        )


class BranchDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = BranchSerializer
    permission_classes = [IsAuthenticated, HasActiveTenant, HasVerifiedMFA]
    http_method_names = ['get', 'patch']

    def get_queryset(self):
        return Branch.objects.filter(tenant=self.request.tenant).select_related('company')


class DeviceListView(generics.ListAPIView):
    serializer_class = DeviceListSerializer
    permission_classes = [IsAuthenticated, HasActiveTenant, HasVerifiedMFA]

    def get_queryset(self):
        return Device.objects.filter(tenant=self.request.tenant).select_related('branch')


class DeviceRevokeView(APIView):
    permission_classes = [IsAuthenticated, HasActiveTenant, HasVerifiedMFA]

    def post(self, request, pk):
        membership = TenantMembership.objects.get(
            user=request.user,
            tenant=request.tenant,
            is_active=True,
        )
        if not role_allows(membership.role, 'organization.manage'):
            raise PermissionDenied('Capability organization.manage is required.')
        device = Device.objects.filter(pk=pk, tenant=request.tenant).first()
        if device is None:
            return Response(
                {'detail': 'Device not found.', 'code': 'device_not_found'},
                status=status.HTTP_404_NOT_FOUND,
                content_type='application/problem+json',
            )
        device.status = 'inactive'
        device.save(update_fields=['status'])
        create_audit_record(
            actor=self.request.user,
            action='device.revoked',
            resource_type='Device',
            resource_id=device.id,
            tenant_id=self.request.tenant.id,
            correlation_id=getattr(self.request, 'correlation_id', ''),
            detail={'name': device.name, 'device_id': device.device_id},
        )
        return Response({'detail': 'Device revoked successfully.'})
