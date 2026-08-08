from django.conf import settings
from django.core.mail import send_mail


def send_confirmation_email(email, token):
    send_mail(
        'Confirme seu acesso ao TJSys',
        f'Confirme seu e-mail usando token={token}',
        settings.DEFAULT_FROM_EMAIL,
        [email],
    )


def send_password_reset_email(email, token):
    send_mail(
        'Redefina sua senha do TJSys',
        f'Redefina sua senha usando token={token}',
        settings.DEFAULT_FROM_EMAIL,
        [email],
    )


def send_mfa_code_email(email, code):
    send_mail(
        'Código de segurança do TJSys',
        f'Seu código de uso único é code={code}',
        settings.DEFAULT_FROM_EMAIL,
        [email],
    )


def send_invitation_email(email, token):
    send_mail(
        'Convite para o TJSys',
        f'Aceite seu convite usando token={token}',
        settings.DEFAULT_FROM_EMAIL,
        [email],
    )
