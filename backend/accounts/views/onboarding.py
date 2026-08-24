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
from platform_admin.models import Plan


def _problem_response(detail, code, status_code, *, request, errors=None):
    titles = {
        'invalid_plan': 'Invalid signup plan',
        'invalid_or_expired_token': 'Invalid or expired confirmation token',
        'validation_error': 'Invalid request',
    }
    payload = {
        'type': f'https://docs.zyrp.local/errors/{code}',
        'title': titles.get(code, 'Request error'),
        'status': status_code,
        'detail': detail if isinstance(detail, str) else 'Request validation failed.',
        'instance': request.path,
        'code': code,
        'correlation_id': getattr(request, 'correlation_id', ''),
        'errors': errors if errors is not None else {},
    }
    return Response(
        payload,
        status=status_code,
        content_type='application/problem+json',
    )


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
        if not serializer.is_valid():
            return _problem_response(
                'Request validation failed.',
                'validation_error',
                status.HTTP_400_BAD_REQUEST,
                request=request,
                errors=serializer.errors,
            )
        try:
            register_organization(
                **serializer.validated_data,
                correlation_id=getattr(request, 'correlation_id', ''),
            )
        except InvalidSignupPlan as exc:
            return _problem_response(
                str(exc),
                'invalid_plan',
                status.HTTP_400_BAD_REQUEST,
                request=request,
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
        if not serializer.is_valid():
            return _problem_response(
                'Request validation failed.',
                'validation_error',
                status.HTTP_400_BAD_REQUEST,
                request=request,
                errors=serializer.errors,
            )
        try:
            confirm_signup(serializer.validated_data['token'])
        except InvalidSignupPlan as exc:
            return _problem_response(
                str(exc),
                'invalid_plan',
                status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        except InvalidSignupToken as exc:
            return _problem_response(
                str(exc),
                'invalid_or_expired_token',
                status.HTTP_400_BAD_REQUEST,
                request=request,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)
