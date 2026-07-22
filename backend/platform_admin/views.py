from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response

from platform_admin.models import (
    FeatureFlag,
    Plan,
    PlatformAdminAudit,
    Subscription,
    SupportAccessRequest,
    TenantEntitlement,
)
from platform_admin.serializers import (
    FeatureFlagSerializer,
    PlanSerializer,
    PlatformAdminAuditSerializer,
    SubscriptionSerializer,
    SupportAccessRequestSerializer,
    TenantEntitlementSerializer,
)
from platform_admin.services import (
    approve_support_access,
    reactivate_tenant,
    request_support_access,
    revoke_support_access,
    set_feature_flag,
    suspend_tenant,
    tenant_active_subscription,
)
from tenancy.permissions import HasActiveTenant


class PlatformAdminPermission(IsAdminUser):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_staff)


def _contains_unique_error(detail):
    if isinstance(detail, dict):
        return any(_contains_unique_error(value) for value in detail.values())
    if isinstance(detail, list):
        return any(_contains_unique_error(value) for value in detail)
    return getattr(detail, 'code', None) == 'unique'


def _problem_response(detail, code, status_code):
    return Response(
        {
            'type': f'https://docs.zyrp.local/errors/{code}',
            'title': code.replace('_', ' ').title(),
            'status': status_code,
            'detail': detail,
            'code': code,
        },
        status=status_code,
        content_type='application/problem+json',
    )


class PlatformProblemDetailsMixin:
    def handle_exception(self, exc):
        response = super().handle_exception(exc)
        status_code = response.status_code
        code = 'validation_error' if isinstance(exc, ValidationError) else 'request_error'
        if status_code == status.HTTP_403_FORBIDDEN:
            code = 'permission_denied'
        elif status_code == status.HTTP_401_UNAUTHORIZED:
            code = 'authentication_required'
        elif isinstance(exc, ValidationError) and _contains_unique_error(exc.detail):
            status_code = status.HTTP_409_CONFLICT
            code = 'conflict'
        detail = response.data.get('detail', response.data) if isinstance(
            response.data, dict,
        ) else response.data
        return _problem_response(detail, code, status_code)


class PlanViewSet(PlatformProblemDetailsMixin, viewsets.ModelViewSet):
    queryset = Plan.objects.all()
    serializer_class = PlanSerializer
    permission_classes = [IsAuthenticated, PlatformAdminPermission]

    def perform_create(self, serializer):
        plan = serializer.save()
        PlatformAdminAudit.objects.create(
            actor=self.request.user,
            action='plan.created',
            detail={'plan_id': str(plan.id), 'plan_code': plan.code},
        )

    def perform_update(self, serializer):
        plan = serializer.save()
        PlatformAdminAudit.objects.create(
            actor=self.request.user,
            action='plan.updated',
            detail={'plan_id': str(plan.id), 'plan_code': plan.code},
        )

    def perform_destroy(self, instance):
        detail = {'plan_id': str(instance.id), 'plan_code': instance.code}
        instance.delete()
        PlatformAdminAudit.objects.create(
            actor=self.request.user, action='plan.deleted', detail=detail,
        )


class SubscriptionViewSet(PlatformProblemDetailsMixin, viewsets.ModelViewSet):
    queryset = Subscription.objects.select_related('tenant', 'plan').all()
    serializer_class = SubscriptionSerializer
    permission_classes = [IsAuthenticated, PlatformAdminPermission]

    def perform_create(self, serializer):
        subscription = serializer.save()
        PlatformAdminAudit.objects.create(
            actor=self.request.user,
            action='subscription.created',
            target_tenant=subscription.tenant,
            detail={
                'subscription_id': str(subscription.id),
                'plan_code': subscription.plan.code,
            },
        )

    def perform_update(self, serializer):
        subscription = serializer.save()
        PlatformAdminAudit.objects.create(
            actor=self.request.user,
            action='subscription.updated',
            target_tenant=subscription.tenant,
            detail={'subscription_id': str(subscription.id)},
        )

    def perform_destroy(self, instance):
        tenant = instance.tenant
        detail = {'subscription_id': str(instance.id)}
        instance.delete()
        PlatformAdminAudit.objects.create(
            actor=self.request.user,
            action='subscription.deleted',
            target_tenant=tenant,
            detail=detail,
        )

    @action(detail=True, methods=['post'])
    def suspend(self, request, pk=None):
        sub = self.get_object()
        reason = request.data.get('reason', '')
        try:
            result = suspend_tenant(sub.tenant, reason=reason, actor=request.user)
        except ValueError as exc:
            return _problem_response(str(exc), 'conflict', status.HTTP_409_CONFLICT)
        serializer = self.get_serializer(result)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def reactivate(self, request, pk=None):
        sub = self.get_object()
        try:
            result = reactivate_tenant(sub.tenant, actor=request.user)
        except ValueError as exc:
            return _problem_response(str(exc), 'conflict', status.HTTP_409_CONFLICT)
        serializer = self.get_serializer(result)
        return Response(serializer.data)


class TenantEntitlementViewSet(PlatformProblemDetailsMixin, viewsets.ModelViewSet):
    queryset = TenantEntitlement.objects.all()
    serializer_class = TenantEntitlementSerializer
    permission_classes = [IsAuthenticated, PlatformAdminPermission]

    def get_queryset(self):
        qs = TenantEntitlement.objects.all()
        tenant_id = self.request.query_params.get('tenant')
        if tenant_id:
            qs = qs.filter(tenant_id=tenant_id)
        return qs

    def _record_update(self, entitlement):
        PlatformAdminAudit.objects.create(
            actor=self.request.user,
            action='entitlement.updated',
            target_tenant=entitlement.tenant,
            detail={
                'entitlement_id': str(entitlement.id),
                'capability': entitlement.capability,
            },
        )

    def perform_create(self, serializer):
        self._record_update(serializer.save())

    def perform_update(self, serializer):
        self._record_update(serializer.save())

    def perform_destroy(self, instance):
        tenant = instance.tenant
        detail = {
            'entitlement_id': str(instance.id),
            'capability': instance.capability,
        }
        instance.delete()
        PlatformAdminAudit.objects.create(
            actor=self.request.user,
            action='entitlement.deleted',
            target_tenant=tenant,
            detail=detail,
        )


class FeatureFlagViewSet(PlatformProblemDetailsMixin, viewsets.ModelViewSet):
    queryset = FeatureFlag.objects.all()
    serializer_class = FeatureFlagSerializer
    permission_classes = [IsAuthenticated, PlatformAdminPermission]

    def perform_create(self, serializer):
        data = serializer.validated_data
        serializer.instance = set_feature_flag(
            code=data['code'],
            globally_enabled=data.get('is_globally_enabled', False),
            rollout_percentage=data.get('rollout_percentage', 0),
            description=data.get('description', ''),
            tenant_overrides=data.get('tenant_overrides', {}),
            actor=self.request.user,
        )

    def perform_update(self, serializer):
        current = serializer.instance
        data = serializer.validated_data
        serializer.instance = set_feature_flag(
            code=data.get('code', current.code),
            globally_enabled=data.get('is_globally_enabled', current.is_globally_enabled),
            rollout_percentage=data.get('rollout_percentage', current.rollout_percentage),
            description=data.get('description', current.description),
            tenant_overrides=data.get('tenant_overrides', current.tenant_overrides),
            actor=self.request.user,
        )

    def perform_destroy(self, instance):
        detail = {'flag_id': str(instance.id), 'flag_code': instance.code}
        instance.delete()
        PlatformAdminAudit.objects.create(
            actor=self.request.user,
            action='feature_flag.deleted',
            detail=detail,
        )


class SupportAccessViewSet(PlatformProblemDetailsMixin, viewsets.ModelViewSet):
    queryset = SupportAccessRequest.objects.select_related(
        'requester', 'approved_by', 'target_tenant',
    ).all()
    serializer_class = SupportAccessRequestSerializer
    permission_classes = [IsAuthenticated, HasActiveTenant]

    def get_queryset(self):
        qs = SupportAccessRequest.objects.select_related(
            'requester', 'approved_by', 'target_tenant',
        )
        user = self.request.user
        if not user.is_staff:
            qs = qs.filter(requester=user)
        return qs

    def perform_create(self, serializer):
        data = serializer.validated_data
        serializer.instance = request_support_access(
            requester=self.request.user,
            target_tenant=data['target_tenant'],
            reason=data['reason'],
            expires_at=data.get('expires_at'),
        )

    def perform_destroy(self, instance):
        tenant = instance.target_tenant
        detail = {'request_id': str(instance.id), 'reason': instance.reason}
        instance.delete()
        PlatformAdminAudit.objects.create(
            actor=self.request.user,
            action='support_access.deleted',
            target_tenant=tenant,
            detail=detail,
        )

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        if not request.user.is_staff:
            return _problem_response(
                'Only admins can approve.', 'permission_denied',
                status.HTTP_403_FORBIDDEN,
            )
        try:
            approve_support_access(pk, request.user)
        except ValueError as exc:
            code = 'not_found' if 'not found' in str(exc).lower() else 'conflict'
            status_code = (
                status.HTTP_404_NOT_FOUND
                if code == 'not_found'
                else status.HTTP_409_CONFLICT
            )
            return _problem_response(str(exc), code, status_code)
        return Response({'status': 'approved'})

    @action(detail=True, methods=['post'])
    def revoke(self, request, pk=None):
        if not request.user.is_staff:
            return _problem_response(
                'Only admins can revoke.', 'permission_denied',
                status.HTTP_403_FORBIDDEN,
            )
        try:
            revoke_support_access(pk, request.user)
        except ValueError as exc:
            code = 'not_found' if 'not found' in str(exc).lower() else 'conflict'
            status_code = (
                status.HTTP_404_NOT_FOUND
                if code == 'not_found'
                else status.HTTP_409_CONFLICT
            )
            return _problem_response(str(exc), code, status_code)
        return Response({'status': 'revoked'})


class PlatformAdminAuditViewSet(PlatformProblemDetailsMixin, viewsets.ReadOnlyModelViewSet):
    queryset = PlatformAdminAudit.objects.select_related('actor').all()
    serializer_class = PlatformAdminAuditSerializer
    permission_classes = [IsAuthenticated, PlatformAdminPermission]

    def get_queryset(self):
        qs = PlatformAdminAudit.objects.select_related('actor').all()
        tenant_id = self.request.query_params.get('tenant')
        if tenant_id:
            qs = qs.filter(target_tenant_id=tenant_id)
        action_filter = self.request.query_params.get('action')
        if action_filter:
            qs = qs.filter(action=action_filter)
        return qs


class TenantCapabilitiesView(viewsets.ViewSet):
    permission_classes = [IsAuthenticated, HasActiveTenant]

    def list(self, request):
        tenant = request.tenant
        sub = tenant_active_subscription(tenant)
        capabilities = {}
        if sub and sub.plan and sub.plan.capabilities:
            capabilities = sub.plan.capabilities.copy()
        from platform_admin.models import TenantEntitlement
        entitlements = TenantEntitlement.objects.filter(tenant=tenant)
        for ent in entitlements:
            capabilities[ent.capability] = ent.is_enabled
        return Response({
            'tenant': tenant.slug,
            'subscription_status': sub.status if sub else 'none',
            'capabilities': capabilities,
            'is_restricted': sub.status in ('suspended', 'cancelled') if sub else True,
        })
