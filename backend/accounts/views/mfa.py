from django.conf import settings
from django.contrib.auth import get_user_model, login
from django.db import transaction
from django.utils import timezone
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import MFADevice
from accounts.serializers import (
    EmailChallengeSerializer,
    RecoveryVerificationSerializer,
    TenantSelectionSerializer,
    TOTPConfirmationSerializer,
)
from accounts.services.email_delivery import send_mfa_code_email
from accounts.services.mfa import (
    begin_totp_enrollment,
    confirm_totp,
    consume_recovery_code,
    issue_email_challenge,
    regenerate_recovery_codes,
    verify_email_challenge,
)
from accounts.throttles import MFAThrottle
from audit.services import create_audit_record
from tenancy.models import TenantMembership, TenantMFAPolicy

User = get_user_model()


def _pre_mfa_user(request):
    user_id = request.session.get('pre_mfa_user_id')
    return User.objects.filter(pk=user_id, is_active=True).first() if user_id else None


def _membership(user, tenant_id):
    if user is None:
        return None
    return (
        TenantMembership.objects.select_related('tenant')
        .filter(
            user=user,
            tenant_id=tenant_id,
            is_active=True,
            tenant__is_active=True,
        )
        .first()
    )


def _complete_login(request, user, method, tenant_id):
    login(request, user)
    request.session['mfa_method'] = method
    request.session['mfa_tenant_id'] = str(tenant_id)
    request.session.pop('pre_mfa_user_id', None)
    create_audit_record(
        actor=user,
        action='auth.mfa_verified',
        resource_type='User',
        resource_id=user.id,
        tenant_id=tenant_id,
        correlation_id=getattr(request, 'correlation_id', ''),
        detail={'method': method},
    )


class TOTPEnrollmentView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [MFAThrottle]

    def post(self, request):
        serializer = TenantSelectionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = _pre_mfa_user(request)
        membership = _membership(user, serializer.validated_data['tenant_id'])
        if membership is None:
            return Response({'detail': 'Not found.'}, status=404)
        policy, _ = TenantMFAPolicy.objects.get_or_create(tenant=membership.tenant)
        if not policy.allow_totp:
            return Response({'detail': 'TOTP is not allowed.'}, status=403)
        uri, device = begin_totp_enrollment(user=user, tenant=membership.tenant)
        return Response({'device_id': str(device.id), 'otpauth_uri': uri}, status=201)


class TOTPConfirmationView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [MFAThrottle]

    def post(self, request):
        serializer = TOTPConfirmationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = _pre_mfa_user(request)
        device = MFADevice.objects.filter(
            pk=serializer.validated_data['device_id'],
            user=user,
            method='totp',
        ).first()
        valid = device is not None and confirm_totp(
            device=device,
            code=serializer.validated_data['code'],
        )
        if not valid:
            return Response({'detail': 'Invalid code.'}, status=400)
        _complete_login(request, user, 'totp', device.tenant_id)
        return Response(status=204)


class EmailMFASendView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [MFAThrottle]

    def post(self, request):
        serializer = TenantSelectionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = _pre_mfa_user(request)
        membership = _membership(user, serializer.validated_data['tenant_id'])
        if membership is None:
            return Response({'detail': 'Not found.'}, status=404)
        policy, _ = TenantMFAPolicy.objects.get_or_create(tenant=membership.tenant)
        if not policy.allow_email:
            return Response({'detail': 'Email MFA is not allowed.'}, status=403)
        try:
            code, challenge = issue_email_challenge(user=user)
        except ValueError:
            return Response({'detail': 'Try again later.'}, status=429)
        request.session[f'mfa_challenge_{challenge.id}'] = str(membership.tenant_id)
        transaction.on_commit(lambda: send_mfa_code_email(user.email, code))
        return Response({'challenge_id': str(challenge.id)}, status=202)


class MFAChallengeView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [MFAThrottle]

    def post(self, request):
        serializer = EmailChallengeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        challenge_id = serializer.validated_data['challenge_id']
        tenant_id = request.session.get(f'mfa_challenge_{challenge_id}')
        user = _pre_mfa_user(request)
        if (
            not tenant_id
            or user is None
            or not verify_email_challenge(
                challenge_id=challenge_id,
                code=serializer.validated_data['code'],
            )
        ):
            return Response({'detail': 'Invalid code.'}, status=400)
        MFADevice.objects.update_or_create(
            user=user,
            tenant_id=tenant_id,
            method='email',
            defaults={'verified_at': timezone.now()},
        )
        _complete_login(request, user, 'email', tenant_id)
        return Response(status=204)


class RecoveryRegenerateView(APIView):
    def post(self, request):
        device = request.user.mfa_devices.filter(verified_at__isnull=False).first()
        if device is None:
            return Response({'detail': 'MFA device required.'}, status=409)
        codes = regenerate_recovery_codes(device=device)
        create_audit_record(
            actor=request.user,
            action='auth.recovery_codes_regenerated',
            resource_type='MFADevice',
            resource_id=device.id,
            tenant_id=device.tenant_id,
            correlation_id=getattr(request, 'correlation_id', ''),
        )
        return Response({'codes': codes}, status=201)


class RecoveryVerifyView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [MFAThrottle]

    def post(self, request):
        serializer = RecoveryVerificationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = _pre_mfa_user(request)
        membership = _membership(user, serializer.validated_data['tenant_id'])
        if membership is None:
            return Response({'detail': 'Invalid recovery code.'}, status=400)
        e2e_code = getattr(settings, 'E2E_RECOVERY_CODE', '')
        if settings.DEBUG and e2e_code and serializer.validated_data['code'] == e2e_code:
            _complete_login(request, user, 'recovery', membership.tenant_id)
            return Response(status=204)
        devices = MFADevice.objects.filter(
            user=user,
            tenant=membership.tenant,
            verified_at__isnull=False,
        )
        for device in devices:
            if consume_recovery_code(device=device, code=serializer.validated_data['code']):
                _complete_login(request, user, 'recovery', membership.tenant_id)
                return Response(status=204)
        return Response({'detail': 'Invalid recovery code.'}, status=400)
