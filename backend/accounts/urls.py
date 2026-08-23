from django.urls import include, path
from rest_framework.routers import DefaultRouter

from accounts.views.favorites import UserFavoriteReorderView, UserFavoriteViewSet
from accounts.views.mfa import (
    EmailMFASendView,
    MFAChallengeView,
    RecoveryRegenerateView,
    RecoveryVerifyView,
    TOTPConfirmationView,
    TOTPEnrollmentView,
)
from accounts.views.onboarding import EmailConfirmationView, PublicPlanListView, RegistrationView
from accounts.views.password import PasswordForgotView, PasswordResetView
from accounts.views.search import GlobalSearchView
from accounts.views.session import CSRFView, LoginView, LogoutView, MeView, UserShortcutsView

app_name = 'accounts'

router = DefaultRouter()
router.register('favorites', UserFavoriteViewSet, basename='favorite')

urlpatterns = [
    path('auth/plans/', PublicPlanListView.as_view(), name='public-plans'),
    path('auth/register/', RegistrationView.as_view(), name='register'),
    path('auth/email/confirm/', EmailConfirmationView.as_view(), name='email-confirm'),
    path('auth/login/', LoginView.as_view(), name='login'),
    path('auth/csrf/', CSRFView.as_view(), name='csrf'),
    path('auth/logout/', LogoutView.as_view(), name='logout'),
    path('auth/me/', MeView.as_view(), name='me'),
    path('auth/password/forgot/', PasswordForgotView.as_view(), name='password-forgot'),
    path('auth/password/reset/', PasswordResetView.as_view(), name='password-reset'),
    path('auth/mfa/totp/enroll/', TOTPEnrollmentView.as_view(), name='totp-enroll'),
    path('auth/mfa/totp/confirm/', TOTPConfirmationView.as_view(), name='totp-confirm'),
    path('auth/mfa/email/send/', EmailMFASendView.as_view(), name='email-mfa-send'),
    path('auth/mfa/challenge/', MFAChallengeView.as_view(), name='mfa-challenge'),
    path(
        'auth/mfa/recovery/regenerate/',
        RecoveryRegenerateView.as_view(),
        name='recovery-regenerate',
    ),
    path('auth/mfa/recovery/verify/', RecoveryVerifyView.as_view(), name='recovery-verify'),
    path('auth/shortcuts/', UserShortcutsView.as_view(), name='user-shortcuts'),
    path('favorites/reorder/', UserFavoriteReorderView.as_view(), name='favorite-reorder'),
    path('search/', GlobalSearchView.as_view(), name='global-search'),
    path('', include(router.urls)),
]
