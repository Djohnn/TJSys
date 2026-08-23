from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from pdv.serializers import SyncBatchSerializer
from pdv.services.sync_batches import ingest_batch
from tenancy.models import Device
from tenancy.permissions import HasActiveTenant


class SyncBatchesView(APIView):
    permission_classes = [IsAuthenticated, HasActiveTenant]

    def post(self, request):
        serializer = SyncBatchSerializer(data=request.data)
        if not serializer.is_valid():
            if 'events' in serializer.errors:
                return Response(
                    {'code': 'invalid_batch_size', 'detail': serializer.errors['events']},
                    status=400,
                )
            return Response({'code': 'invalid_batch', 'detail': serializer.errors}, status=400)
        tenant = getattr(request, 'tenant', None)
        raw_device_id = request.auth.get('device_id') if request.auth else None
        device = Device.all_objects.filter(id=raw_device_id, tenant=tenant, status='active').first()
        if tenant is None or device is None:
            return Response({'code': 'device_context_required'}, status=status.HTTP_403_FORBIDDEN)
        try:
            batch, events = ingest_batch(
                tenant=tenant,
                device=device,
                events=serializer.validated_data['events'],
                batch_hash=serializer.validated_data.get('batch_hash'),
            )
        except ValueError as exc:
            return Response({'code': 'invalid_batch_hash', 'detail': str(exc)}, status=400)
        return Response(
            {
                'batch_id': str(batch.id),
                'batch_hash': batch.batch_hash,
                'results': [
                    {
                        'event_id': str(event.event_id),
                        'status': event.status,
                        'result': event.result,
                        'error_code': event.error_code or None,
                        'error_detail': event.error_detail or None,
                    }
                    for event in events
                ],
            }
        )
