from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.serializers import PublicPlanSerializer, RegistrationSerializer, TokenSerializer
from accounts.services.onboarding import (
    InvalidSignupPlan,
    InvalidSignupToken,
    confirm_signup,
    register_organization,
)
from accounts.throttles import RegistrationThrottle
from audit.services import create_audit_record
from platform_admin.models import Plan


class PublicPlanListView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        plans = Plan.objects.filter(
            is_active=True,
            is_public=True,
            trial_days__gt=0,
        )
        return Response(PublicPlanSerializer(plans, many=True).data)


class RegistrationView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [RegistrationThrottle]

    def post(self, request):
        serializer = RegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            user = register_organization(**serializer.validated_data)
        except InvalidSignupPlan as exc:
            return Response(
                {'detail': str(exc), 'code': 'invalid_plan'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if user:
            create_audit_record(
                actor=user,
                action='auth.registered',
                resource_type='User',
                resource_id=user.id,
                correlation_id=getattr(request, 'correlation_id', ''),
            )
        return Response(
            {'detail': 'If eligible, confirmation instructions will be sent.'},
            status=status.HTTP_202_ACCEPTED,
        )


class EmailConfirmationView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = TokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            confirm_signup(serializer.validated_data['token'])
        except InvalidSignupToken as exc:
            return Response(
                {'detail': str(exc), 'code': 'invalid_or_expired_token'},
                status=status.HTTP_400_BAD_REQUEST,
                content_type='application/problem+json',
            )
        return Response(status=status.HTTP_204_NO_CONTENT)
