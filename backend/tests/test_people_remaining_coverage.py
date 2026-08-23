"""Targeted tests to close remaining coverage gaps in people/services.py.

Lines uncovered (19.0%, 24 missing):
- create_person: consents loop (44-45), no-optionals path (36-45), trade_name (34),
  audit/outbox payloads (47-65)
- deactivate_person: address/contact cascades (74-75), audit/outbox payloads (76-91)
"""

import pytest

from audit.models import AuditRecord
from outbox.models import OutboxMessage
from people.models import (
    ConsentRecord,
    PersonAddress,
    PersonContact,
    PersonDocument,
    PersonRole,
)
from people.services import create_person, deactivate_person

# ── create_person ──────────────────────────────────────────────────────


@pytest.mark.django_db
def test_create_person_minimal_no_optionals(tenant_alpha, user_alpha):
    """Given no optional args, when created, then person has no related records."""
    person = create_person(
        tenant=tenant_alpha,
        actor=user_alpha,
        person_type='PF',
        name='Minimal Person',
    )

    assert person.name == 'Minimal Person'
    assert person.person_type == 'PF'
    assert person.trade_name == ''
    assert person.is_active is True
    assert PersonRole.all_objects.filter(person=person).count() == 0
    assert PersonDocument.all_objects.filter(person=person).count() == 0
    assert PersonAddress.all_objects.filter(person=person).count() == 0
    assert PersonContact.all_objects.filter(person=person).count() == 0
    assert ConsentRecord.all_objects.filter(person=person).count() == 0

    audit = AuditRecord.objects.get(resource_id=str(person.id))
    assert audit.action == 'people.person.created'
    assert audit.detail == {'person_id': str(person.id), 'roles': []}

    outbox = OutboxMessage.objects.get(aggregate_id=str(person.id))
    assert outbox.event_type == 'people.person.created'
    assert outbox.payload == {'person_id': str(person.id), 'roles': []}


@pytest.mark.django_db
def test_create_person_with_trade_name(tenant_alpha, user_alpha):
    """Given trade_name, when created, then it is persisted."""
    person = create_person(
        tenant=tenant_alpha,
        actor=user_alpha,
        person_type='PJ',
        name='Corp Legal',
        trade_name='Corp',
    )

    assert person.trade_name == 'Corp'


@pytest.mark.django_db
def test_create_person_with_consents(tenant_alpha, user_alpha):
    """Given consents, when created, then ConsentRecord rows exist."""
    person = create_person(
        tenant=tenant_alpha,
        actor=user_alpha,
        person_type='PF',
        name='Consent User',
        consents=[
            {'purpose': 'marketing', 'granted': True, 'source': 'web'},
            {'purpose': 'analytics', 'granted': False, 'source': 'app'},
        ],
    )

    consents = ConsentRecord.all_objects.filter(person=person)
    assert consents.count() == 2
    purposes = set(consents.values_list('purpose', flat=True))
    assert purposes == {'marketing', 'analytics'}


@pytest.mark.django_db
def test_create_person_with_all_related(tenant_alpha, user_alpha):
    """Given all optional params, when created, then every join table has rows."""
    person = create_person(
        tenant=tenant_alpha,
        actor=user_alpha,
        person_type='PJ',
        name='Full Corp',
        trade_name='Full',
        roles=['customer', 'supplier'],
        documents=[{'document_type': 'CNPJ', 'value': '12345678000199'}],
        addresses=[
            {
                'address_type': 'fiscal',
                'street': 'Rua X',
                'city': 'SP',
                'state': 'SP',
            }
        ],
        contacts=[{'contact_type': 'email', 'value': 'full@test.com'}],
        consents=[{'purpose': 'lgpd', 'granted': True}],
    )

    assert PersonRole.all_objects.filter(person=person).count() == 2
    assert PersonDocument.all_objects.filter(person=person).count() == 1
    assert PersonAddress.all_objects.filter(person=person).count() == 1
    assert PersonContact.all_objects.filter(person=person).count() == 1
    assert ConsentRecord.all_objects.filter(person=person).count() == 1

    audit = AuditRecord.objects.get(resource_id=str(person.id))
    assert audit.detail == {'person_id': str(person.id), 'roles': ['customer', 'supplier']}

    outbox = OutboxMessage.objects.get(aggregate_id=str(person.id))
    assert outbox.tenant_id == str(tenant_alpha.id)
    assert outbox.aggregate_type == 'Person'


@pytest.mark.django_db
def test_create_person_audit_has_actor(tenant_alpha, user_alpha):
    """Given an actor, when person created, then audit record includes actor."""
    person = create_person(
        tenant=tenant_alpha,
        actor=user_alpha,
        person_type='PF',
        name='Actor Test',
    )

    audit = AuditRecord.objects.get(resource_id=str(person.id))
    assert audit.actor_id == user_alpha.id


@pytest.mark.django_db
def test_create_person_audit_without_actor(tenant_alpha):
    """Given no actor, when person created, then audit record has no actor."""
    person = create_person(
        tenant=tenant_alpha,
        person_type='PF',
        name='No Actor',
    )

    audit = AuditRecord.objects.get(resource_id=str(person.id))
    assert audit.actor_id is None


# ── deactivate_person ──────────────────────────────────────────────────


@pytest.mark.django_db
def test_deactivate_person_cascades_addresses_and_contacts(tenant_alpha, user_alpha):
    """Given person with addresses + contacts, when deactivated, then all inactive."""
    person = create_person(
        tenant=tenant_alpha,
        actor=user_alpha,
        person_type='PF',
        name='Cascade Test',
        addresses=[
            {'address_type': 'fiscal', 'street': 'A', 'city': 'SP', 'state': 'SP'},
            {'address_type': 'delivery', 'street': 'B', 'city': 'RJ', 'state': 'RJ'},
        ],
        contacts=[
            {'contact_type': 'email', 'value': 'a@test.com'},
            {'contact_type': 'phone', 'value': '11999990000'},
        ],
    )

    deactivate_person(person=person, actor=user_alpha)
    person.refresh_from_db()

    assert person.is_active is False

    for addr in PersonAddress.all_objects.filter(person=person):
        assert addr.is_active is False

    for contact in PersonContact.all_objects.filter(person=person):
        assert contact.is_active is False


@pytest.mark.django_db
def test_deactivate_person_audit_record(tenant_alpha, user_alpha):
    """Given person, when deactivated, then audit record is created."""
    person = create_person(
        tenant=tenant_alpha,
        actor=user_alpha,
        person_type='PF',
        name='Audit Deact',
    )

    deactivate_person(person=person, actor=user_alpha)

    audit = AuditRecord.objects.get(
        resource_id=str(person.id),
        action='people.person.deactivated',
    )
    assert audit.detail == {'person_id': str(person.id)}
    assert audit.actor_id == user_alpha.id
    assert audit.tenant_id == str(tenant_alpha.id)


@pytest.mark.django_db
def test_deactivate_person_outbox_message(tenant_alpha, user_alpha):
    """Given person, when deactivated, then outbox message is created."""
    person = create_person(
        tenant=tenant_alpha,
        actor=user_alpha,
        person_type='PF',
        name='Outbox Deact',
    )

    deactivate_person(person=person, actor=user_alpha)

    outbox = OutboxMessage.objects.get(
        aggregate_id=str(person.id),
        event_type='people.person.deactivated',
    )
    assert outbox.aggregate_type == 'Person'
    assert outbox.payload == {'person_id': str(person.id)}
    assert outbox.tenant_id == str(tenant_alpha.id)


@pytest.mark.django_db
def test_deactivate_person_without_actor(tenant_alpha, user_alpha):
    """Given no actor, when deactivated, then audit record has no actor."""
    person = create_person(
        tenant=tenant_alpha,
        actor=user_alpha,
        person_type='PF',
        name='No Actor Deact',
    )

    deactivate_person(person=person)

    audit = AuditRecord.objects.get(
        resource_id=str(person.id),
        action='people.person.deactivated',
    )
    assert audit.actor_id is None


@pytest.mark.django_db
def test_deactivate_preserves_documents_active_false(tenant_alpha, user_alpha):
    """Given person with documents, when deactivated, then documents inactive."""
    person = create_person(
        tenant=tenant_alpha,
        actor=user_alpha,
        person_type='PJ',
        name='Doc Cascade',
        documents=[
            {'document_type': 'CNPJ', 'value': '11111111000111'},
            {'document_type': 'IE', 'value': '123456'},
        ],
    )

    deactivate_person(person=person, actor=user_alpha)

    docs = PersonDocument.all_objects.filter(person=person)
    assert docs.count() == 2
    assert all(d.is_active is False for d in docs)


@pytest.mark.django_db
def test_deactivate_idempotent_second_call_no_error(tenant_alpha, user_alpha):
    """Given already inactive person, when deactivated again, then no error."""
    person = create_person(
        tenant=tenant_alpha,
        actor=user_alpha,
        person_type='PF',
        name='Double Deact',
    )

    deactivate_person(person=person, actor=user_alpha)
    person.refresh_from_db()
    assert person.is_active is False

    deactivate_person(person=person, actor=user_alpha)
    person.refresh_from_db()
    assert person.is_active is False
