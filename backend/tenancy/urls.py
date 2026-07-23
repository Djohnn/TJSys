from django.urls import path

from tenancy.views import (
    BranchDetailView,
    BranchListCreateView,
    CompanyDetailView,
    CompanyListCreateView,
    DeviceListView,
    DeviceRefreshView,
    DeviceRegisterView,
    DeviceRevokeView,
    DeviceValidateView,
)
from tenancy.views_access import (
    InvitationAcceptView,
    InvitationListCreateView,
    InvitationResendView,
    MembershipDetailView,
    MembershipListView,
    MFAPolicyView,
)

app_name = 'tenancy'

urlpatterns = [
    path('companies/', CompanyListCreateView.as_view(), name='company-list'),
    path('companies/<uuid:pk>/', CompanyDetailView.as_view(), name='company-detail'),
    path('invitations/', InvitationListCreateView.as_view(), name='invitation-list'),
    path('invitations/accept/', InvitationAcceptView.as_view(), name='invitation-accept'),
    path('invitations/<uuid:pk>/resend/', InvitationResendView.as_view(), name='invitation-resend'),
    path('memberships/', MembershipListView.as_view(), name='membership-list'),
    path('memberships/<int:pk>/', MembershipDetailView.as_view(), name='membership-detail'),
    path('security/mfa-policy/', MFAPolicyView.as_view(), name='mfa-policy'),
    path('branches/', BranchListCreateView.as_view(), name='branch-list'),
    path('branches/<uuid:pk>/', BranchDetailView.as_view(), name='branch-detail'),
    path('devices/', DeviceRegisterView.as_view(), name='device-register'),
    path('devices/list/', DeviceListView.as_view(), name='device-list'),
    path('devices/validate/', DeviceValidateView.as_view(), name='device-validate'),
    path('devices/refresh/', DeviceRefreshView.as_view(), name='device-refresh'),
    path('devices/<uuid:pk>/revoke/', DeviceRevokeView.as_view(), name='device-revoke'),
]
