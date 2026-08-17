from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.serializers import EmailSerializer, PasswordResetSerializer
from accounts.services.email_delivery import send_password_reset_email
from accounts.services.sessions import revoke_user_sessions
from accounts.throttles import PasswordRecoveryThrottle
from accounts.tokens import consume_token, issue_token
from audit.services import create_audit_record

User = get_user_model()


class PasswordForgotView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [PasswordRecoveryThrottle]

    def post(self, request):
        serializer = EmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email'].strip().casefold()
        user = User.objects.filter(email=email, is_active=True).first()
        if user:
            token, _ = issue_token(purpose='password_reset', user=user)
            transaction.on_commit(lambda: send_password_reset_email(email, token))
        return Response(
            {'detail': 'If eligible, password reset instructions will be sent.'},
            status=202,
        )


class PasswordResetView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = PasswordResetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        record = consume_token(serializer.validated_data['token'], purpose='password_reset')
        if record is None:
            return Response({'detail': 'Invalid or expired token.'}, status=400)
        validate_password(serializer.validated_data['password'], user=record.user)
        record.user.set_password(serializer.validated_data['password'])
        record.user.save(update_fields=['password'])
        revoke_user_sessions(record.user_id)
        create_audit_record(
            actor=record.user,
            action='auth.password_reset',
            resource_type='User',
            resource_id=record.user_id,
            correlation_id=getattr(request, 'correlation_id', ''),
        )
        return Response(status=204)
