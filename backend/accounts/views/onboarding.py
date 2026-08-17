from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.serializers import RegistrationSerializer, TokenSerializer
from accounts.services.onboarding import register_organization
from accounts.throttles import RegistrationThrottle
from accounts.tokens import consume_token
from audit.services import create_audit_record


class RegistrationView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [RegistrationThrottle]

    def post(self, request):
        serializer = RegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = register_organization(**serializer.validated_data)
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
        record = consume_token(
            serializer.validated_data['token'],
            purpose='email_confirmation',
        )
        if record is None:
            return Response({'detail': 'Invalid or expired token.'}, status=400)
        record.user.email_verified_at = timezone.now()
        record.user.save(update_fields=['email_verified_at'])
        create_audit_record(
            actor=record.user,
            action='auth.email_confirmed',
            resource_type='User',
            resource_id=record.user_id,
            correlation_id=getattr(request, 'correlation_id', ''),
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
