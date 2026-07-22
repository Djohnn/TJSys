from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from audit.services import create_audit_record
from outbox.services import create_outbox_message
from tenancy.permissions import HasActiveTenant

from .models import ConsentRecord, Person, PersonAddress, PersonContact
from .serializers import (
    ConsentRecordSerializer,
    PersonAddressSerializer,
    PersonContactSerializer,
    PersonSerializer,
)
from .services import deactivate_person


class PersonViewSet(viewsets.ModelViewSet):
    serializer_class = PersonSerializer
    permission_classes = [IsAuthenticated, HasActiveTenant]

    def get_queryset(self):
        queryset = Person.all_objects.filter(tenant=self.request.tenant)
        active = self.request.query_params.get('active')
        if active in {'true', 'false'}:
            queryset = queryset.filter(is_active=active == 'true')
        role = self.request.query_params.get('role')
        if role:
            queryset = queryset.filter(roles__role=role)
        document = self.request.query_params.get('document')
        if document:
            from .models import digits_only
            queryset = queryset.filter(documents__value=digits_only(document))
        q = self.request.query_params.get('q')
        if q:
            from django.db.models import Q
            queryset = queryset.filter(
                Q(name__icontains=q)
                | Q(trade_name__icontains=q)
                | Q(documents__value__icontains=q)
            )
        return queryset.distinct()

    def perform_update(self, serializer):
        person = serializer.save()
        payload = {'person_id': str(person.id), 'changed_fields': sorted(serializer.validated_data)}
        create_audit_record(
            action='people.person.updated', resource_type='Person', resource_id=person.id,
            detail=payload, actor=self.request.user, tenant_id=person.tenant_id,
        )
        create_outbox_message(
            event_type='people.person.updated', aggregate_type='Person',
            aggregate_id=person.id, payload=payload, tenant_id=str(person.tenant_id),
        )

    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        person = deactivate_person(person=self.get_object(), actor=request.user)
        return Response(self.get_serializer(person).data)

    def _nested(self, request, model, serializer_class):
        person = self.get_object()
        queryset = model.all_objects.filter(tenant=request.tenant, person=person)
        if request.method == 'GET':
            return Response(serializer_class(queryset, many=True).data)
        serializer = serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(tenant=request.tenant, person=person)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get', 'post'])
    def addresses(self, request, pk=None):
        return self._nested(request, PersonAddress, PersonAddressSerializer)

    @action(detail=True, methods=['get', 'post'])
    def contacts(self, request, pk=None):
        return self._nested(request, PersonContact, PersonContactSerializer)

    @action(detail=True, methods=['get', 'post'])
    def consents(self, request, pk=None):
        return self._nested(request, ConsentRecord, ConsentRecordSerializer)
