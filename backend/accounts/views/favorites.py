from django.db import transaction
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import UserFavorite
from accounts.serializers import (
    UserFavoriteCreateSerializer,
    UserFavoriteReorderSerializer,
    UserFavoriteSerializer,
)


class UserFavoriteViewSet(viewsets.ModelViewSet):
    serializer_class = UserFavoriteSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        tenant_id = self.request.headers.get('X-Tenant-ID')
        if not tenant_id:
            return UserFavorite.objects.none()
        return UserFavorite.objects.filter(
            user=self.request.user,
            tenant_id=tenant_id,
        ).order_by('position')

    def perform_create(self, serializer):
        tenant_id = self.request.headers.get('X-Tenant-ID')
        if not tenant_id:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'tenant_id': 'Tenant ID is required.'})
        serializer.save(user=self.request.user, tenant_id=tenant_id)

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        serializer = UserFavoriteCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        tenant_id = request.headers.get('X-Tenant-ID')
        if not tenant_id:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'tenant_id': 'Tenant ID is required.'})

        # Check for duplicate
        existing = UserFavorite.objects.filter(
            user=request.user,
            tenant_id=tenant_id,
            entity_type=data['entity_type'],
            entity_id=data.get('entity_id'),
        ).first()
        if existing:
            return Response(
                {'detail': 'This item is already in your favorites.'},
                status=status.HTTP_409_CONFLICT,
            )

        # Auto-assign position if not provided
        position = data.get('position', 0)
        if position == 0:
            max_pos = UserFavorite.objects.filter(
                user=request.user,
                tenant_id=tenant_id,
            ).order_by('-position').values_list('position', flat=True).first()
            position = (max_pos or 0) + 1

        favorite = UserFavorite.objects.create(
            user=request.user,
            tenant_id=tenant_id,
            entity_type=data['entity_type'],
            entity_id=data.get('entity_id'),
            label=data['label'],
            route=data['route'],
            position=position,
            icon=data.get('icon', ''),
        )

        return Response(
            UserFavoriteSerializer(favorite).data,
            status=status.HTTP_201_CREATED,
        )


class UserFavoriteReorderView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def put(self, request):
        serializer = UserFavoriteReorderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        favorite_ids = serializer.validated_data['favorite_ids']

        tenant_id = request.headers.get('X-Tenant-ID')
        if not tenant_id:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'tenant_id': 'Tenant ID is required.'})

        # Update positions
        for idx, fav_id in enumerate(favorite_ids):
            UserFavorite.objects.filter(
                id=fav_id,
                user=request.user,
                tenant_id=tenant_id,
            ).update(position=idx)

        return Response({'detail': 'Reorder successful.'}, status=status.HTTP_200_OK)
