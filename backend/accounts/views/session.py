from django.contrib.auth import authenticate, logout
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.serializers import LoginSerializer
from accounts.throttles import LoginThrottle
from audit.services import create_audit_record
from tenancy.models import TenantMembership


@method_decorator(ensure_csrf_cookie, name='dispatch')
@method_decorator(csrf_protect, name='dispatch')
class LoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [LoginThrottle]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email'].strip().casefold()
        user = authenticate(
            request,
            username=email,
            password=serializer.validated_data['password'],
        )
        if user is None:
            return Response({'detail': 'Invalid credentials.'}, status=401)
        if not user.is_active or user.email_verified_at is None:
            return Response({'detail': 'Account is not available.'}, status=403)
        request.session.flush()
        request.session['pre_mfa_user_id'] = str(user.id)
        request.session.create()
        mfa_session = request.session.session_key
        request.session.cycle_key()
        membership = (
            TenantMembership.objects.filter(user=user, is_active=True)
            .order_by(
                'invited_at',
                'id',
            )
            .first()
        )
        return Response(
            {
                'detail': 'MFA required.',
                'requires_mfa': True,
                'mfa_session': mfa_session,
                'mfa_tenant_id': str(membership.tenant_id) if membership else None,
            },
            status=status.HTTP_202_ACCEPTED,
        )


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        create_audit_record(
            actor=request.user,
            action='auth.logout',
            resource_type='User',
            resource_id=request.user.id,
            correlation_id=getattr(request, 'correlation_id', ''),
        )
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from tenancy.models import TenantMembership

        memberships_qs = TenantMembership.objects.select_related('tenant').filter(
            user=request.user,
            is_active=True,
            tenant__is_active=True,
        )
        memberships = [
            {
                'id': str(m.id),
                'tenant_id': str(m.tenant_id),
                'tenant_name': m.tenant.name,
                'role': m.role,
            }
            for m in memberships_qs
        ]
        return Response(
            {
                'id': str(request.user.id),
                'email': request.user.email,
                'memberships': memberships,
            }
        )


class CSRFView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @method_decorator(ensure_csrf_cookie)
    def get(self, request):
        return Response({'csrf_token': get_token(request)})
