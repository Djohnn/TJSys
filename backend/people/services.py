from django.db import transaction

from audit.services import create_audit_record
from outbox.services import create_outbox_message

from .models import (
    ConsentRecord,
    Person,
    PersonAddress,
    PersonContact,
    PersonDocument,
    PersonRole,
)


@transaction.atomic
def create_person(
    *,
    tenant,
    person_type,
    name,
    actor=None,
    trade_name='',
    roles=None,
    documents=None,
    addresses=None,
    contacts=None,
    consents=None,
):
    person = Person.all_objects.create(
        tenant=tenant,
        person_type=person_type,
        name=name,
        trade_name=trade_name,
    )
    for role in roles or []:
        PersonRole.all_objects.create(tenant=tenant, person=person, role=role)
    for data in documents or []:
        PersonDocument.all_objects.create(tenant=tenant, person=person, **data)
    for data in addresses or []:
        PersonAddress.all_objects.create(tenant=tenant, person=person, **data)
    for data in contacts or []:
        PersonContact.all_objects.create(tenant=tenant, person=person, **data)
    for data in consents or []:
        ConsentRecord.all_objects.create(tenant=tenant, person=person, **data)

    safe_payload = {
        'person_id': str(person.id),
        'roles': sorted(roles or []),
    }
    create_audit_record(
        action='people.person.created',
        resource_type='Person',
        resource_id=person.id,
        detail=safe_payload,
        actor=actor,
        tenant_id=tenant.id,
    )
    create_outbox_message(
        event_type='people.person.created',
        aggregate_type='Person',
        aggregate_id=person.id,
        payload=safe_payload,
        tenant_id=str(tenant.id),
    )
    return person


@transaction.atomic
def deactivate_person(*, person, actor=None):
    person.is_active = False
    person.save(update_fields=['is_active', 'updated_at'])
    PersonDocument.all_objects.filter(person=person).update(is_active=False)
    PersonAddress.all_objects.filter(person=person).update(is_active=False)
    PersonContact.all_objects.filter(person=person).update(is_active=False)
    safe_payload = {'person_id': str(person.id)}
    create_audit_record(
        action='people.person.deactivated',
        resource_type='Person',
        resource_id=person.id,
        detail=safe_payload,
        actor=actor,
        tenant_id=person.tenant_id,
    )
    create_outbox_message(
        event_type='people.person.deactivated',
        aggregate_type='Person',
        aggregate_id=person.id,
        payload=safe_payload,
        tenant_id=str(person.tenant_id),
    )
    return person
