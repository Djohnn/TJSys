from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from audit.services import create_audit_record
from tenancy.capabilities import role_allows
from tenancy.models import Branch, Invitation, TenantMembership, TenantMFAPolicy, UserBranch
from tenancy.permissions import HasActiveTenant, HasVerifiedMFA
from tenancy.serializers_access import (
    InvitationAcceptSerializer,
    InvitationSerializer,
    MembershipSerializer,
    MFAPolicySerializer,
)
from tenancy.services.invitations import (
    accept_invitation,
    create_invitation,
    resend_invitation,
)


class InvitationListCreateView(generics.ListCreateAPIView):
    serializer_class = InvitationSerializer
    permission_classes = [IsAuthenticated, HasActiveTenant, HasVerifiedMFA]

    def get_queryset(self):
        return Invitation.objects.filter(tenant=self.request.tenant)

    def perform_create(self, serializer):
        membership = TenantMembership.objects.get(
            user=self.request.user,
            tenant=self.request.tenant,
            is_active=True,
        )
        if not role_allows(membership.role, 'users.manage'):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied('Capability users.manage is required.')
        branch_ids = serializer.validated_data.pop('branch_ids', [])
        branches = list(Branch.objects.filter(pk__in=branch_ids))
        if len(branches) != len(set(branch_ids)):
            from rest_framework.exceptions import ValidationError

            raise ValidationError('Every branch must belong to the active tenant.')
        invitation = create_invitation(
            tenant=self.request.tenant,
            invited_by=self.request.user,
            email=serializer.validated_data['email'],
            role=serializer.validated_data['role'],
            branches=branches,
        )
        serializer.instance = invitation
        create_audit_record(
            actor=self.request.user,
            action='invitation.created',
            resource_type='Invitation',
            resource_id=invitation.id,
            tenant_id=self.request.tenant.id,
            correlation_id=getattr(self.request, 'correlation_id', ''),
            detail={'role': invitation.role},
        )


class InvitationAcceptView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = InvitationAcceptSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        invitation = accept_invitation(raw=serializer.validated_data['token'], user=request.user)
        if invitation is None:
            return Response({'detail': 'Invalid or expired invitation.'}, status=400)
        create_audit_record(
            actor=request.user,
            action='invitation.accepted',
            resource_type='Invitation',
            resource_id=invitation.id,
            tenant_id=invitation.tenant_id,
            correlation_id=getattr(request, 'correlation_id', ''),
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class InvitationResendView(APIView):
    permission_classes = [IsAuthenticated, HasActiveTenant, HasVerifiedMFA]

    def post(self, request, pk):
        membership = TenantMembership.objects.get(
            user=request.user,
            tenant=request.tenant,
            is_active=True,
        )
        if not role_allows(membership.role, 'users.manage'):
            return Response({'detail': 'Forbidden.'}, status=403)
        invitation = Invitation.objects.filter(pk=pk, tenant=request.tenant).first()
        if invitation is None:
            return Response({'detail': 'Not found.'}, status=404)
        try:
            resend_invitation(invitation)
        except ValueError:
            return Response({'detail': 'Accepted invitations cannot be resent.'}, status=409)
        create_audit_record(
            actor=request.user,
            action='invitation.resent',
            resource_type='Invitation',
            resource_id=invitation.id,
            tenant_id=request.tenant.id,
            correlation_id=getattr(request, 'correlation_id', ''),
        )
        return Response(status=202)


class MembershipListView(generics.ListAPIView):
    serializer_class = MembershipSerializer
    permission_classes = [IsAuthenticated, HasActiveTenant, HasVerifiedMFA]

    def get_queryset(self):
        return (
            TenantMembership.objects.filter(tenant=self.request.tenant)
            .select_related('user')
            .order_by('id')
        )


class MembershipDetailView(generics.UpdateAPIView):
    serializer_class = MembershipSerializer
    permission_classes = [IsAuthenticated, HasActiveTenant, HasVerifiedMFA]
    http_method_names = ['patch']

    def get_queryset(self):
        membership = TenantMembership.objects.get(
            user=self.request.user,
            tenant=self.request.tenant,
            is_active=True,
        )
        if not role_allows(membership.role, 'users.manage'):
            return TenantMembership.objects.none()
        return TenantMembership.objects.filter(tenant=self.request.tenant)

    def perform_update(self, serializer):
        target = self.get_object()
        new_role = serializer.validated_data.get('role', target.role)
        new_active = serializer.validated_data.get('is_active', target.is_active)
        if target.role == 'admin' and (new_role != 'admin' or not new_active):
            admins = TenantMembership.objects.filter(
                tenant=self.request.tenant,
                role='admin',
                is_active=True,
            ).count()
            if admins <= 1:
                from rest_framework.exceptions import ValidationError

                raise ValidationError('The last active administrator cannot be removed.')
        branch_ids = serializer.validated_data.pop('branch_ids', None)
        branches = None
        if branch_ids is not None:
            branches = list(Branch.objects.filter(pk__in=branch_ids))
            if len(branches) != len(set(branch_ids)):
                from rest_framework.exceptions import ValidationError

                raise ValidationError('Every branch must belong to the active tenant.')
        membership = serializer.save()
        if branches is not None:
            UserBranch.objects.filter(
                user=membership.user,
                branch__tenant=self.request.tenant,
            ).exclude(branch__in=branches).delete()
            for branch in branches:
                UserBranch.objects.get_or_create(user=membership.user, branch=branch)
        create_audit_record(
            actor=self.request.user,
            action='membership.updated',
            resource_type='TenantMembership',
            resource_id=membership.id,
            tenant_id=self.request.tenant.id,
            correlation_id=getattr(self.request, 'correlation_id', ''),
            detail={'role': membership.role, 'is_active': membership.is_active},
        )


class MFAPolicyView(generics.RetrieveUpdateAPIView):
    serializer_class = MFAPolicySerializer
    permission_classes = [IsAuthenticated, HasActiveTenant, HasVerifiedMFA]
    http_method_names = ['get', 'patch']

    def get_object(self):
        membership = TenantMembership.objects.get(
            user=self.request.user,
            tenant=self.request.tenant,
            is_active=True,
        )
        if self.request.method == 'PATCH' and not role_allows(
            membership.role,
            'organization.manage',
        ):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied('Capability organization.manage is required.')
        return TenantMFAPolicy.objects.get_or_create(tenant=self.request.tenant)[0]

    def perform_update(self, serializer):
        policy = serializer.save()
        create_audit_record(
            actor=self.request.user,
            action='mfa_policy.updated',
            resource_type='TenantMFAPolicy',
            resource_id=policy.pk,
            tenant_id=self.request.tenant.id,
            correlation_id=getattr(self.request, 'correlation_id', ''),
            detail={
                'allow_totp': policy.allow_totp,
                'allow_email': policy.allow_email,
            },
        )
