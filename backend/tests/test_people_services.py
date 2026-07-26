"""Sprint 12 service scenarios (Given/When/Then)."""

import pytest


@pytest.mark.django_db
def test_create_customer_with_fiscal_address_emits_redacted_events(tenant_alpha, user_alpha):
    """Given customer data, when created, then history exists without raw PII."""
    from audit.models import AuditRecord
    from outbox.models import OutboxMessage
    from people.services import create_person

    person = create_person(
        tenant=tenant_alpha,
        actor=user_alpha,
        person_type='PF',
        name='Maria',
        roles=['customer'],
        documents=[{'document_type': 'CPF', 'value': '123.456.789-09'}],
        contacts=[{'contact_type': 'email', 'value': 'maria@example.com'}],
        addresses=[
            {
                'address_type': 'fiscal',
                'street': 'Rua A',
                'city': 'São Paulo',
                'state': 'SP',
                'postal_code': '01001-000',
            }
        ],
    )

    from people.models import PersonAddress

    assert PersonAddress.all_objects.get(person=person).postal_code == '01001000'
    audit = AuditRecord.objects.get(resource_id=str(person.id))
    event = OutboxMessage.objects.get(aggregate_id=str(person.id))
    serialized = f'{audit.detail}{event.payload}'
    assert '12345678909' not in serialized
    assert 'maria@example.com' not in serialized
    assert event.payload == {'person_id': str(person.id), 'roles': ['customer']}


@pytest.mark.django_db
def test_deactivate_person_preserves_related_history(tenant_alpha, user_alpha):
    """Given an active person, when deactivated, then records remain inactive."""
    from people.models import PersonDocument
    from people.services import create_person, deactivate_person

    person = create_person(
        tenant=tenant_alpha,
        actor=user_alpha,
        person_type='PJ',
        name='ACME',
        documents=[{'document_type': 'CNPJ', 'value': '12.345.678/0001-90'}],
    )

    deactivate_person(person=person, actor=user_alpha)
    person.refresh_from_db()
    document = PersonDocument.all_objects.get(person=person)
    assert person.is_active is False
    assert document.is_active is False
    assert PersonDocument.all_objects.filter(person=person).exists()
