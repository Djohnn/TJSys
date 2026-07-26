"""Sprint 12 model scenarios (Given/When/Then)."""

import pytest
from django.db import IntegrityError, transaction


@pytest.mark.django_db
def test_person_normalizes_pf_document_email_and_phone(tenant_alpha):
    """Given raw PF data, when saved, then identifiers are normalized."""
    from people.models import Person, PersonContact, PersonDocument

    person = Person.all_objects.create(
        tenant=tenant_alpha, person_type='PF', name='  Maria Silva  '
    )
    document = PersonDocument.all_objects.create(
        tenant=tenant_alpha, person=person, document_type='CPF', value='123.456.789-09'
    )
    contact = PersonContact.all_objects.create(
        tenant=tenant_alpha,
        person=person,
        contact_type='email',
        value='  MARIA@EXAMPLE.COM ',
    )
    phone = PersonContact.all_objects.create(
        tenant=tenant_alpha,
        person=person,
        contact_type='phone',
        value='+55 (11) 99999-0000',
    )

    assert person.name == 'Maria Silva'
    assert document.value == '12345678909'
    assert contact.value == 'maria@example.com'
    assert phone.value == '5511999990000'


@pytest.mark.django_db(transaction=True)
def test_active_document_is_unique_only_inside_tenant(tenant_alpha, tenant_beta):
    """Given an active CPF, when reused, then only the same tenant is blocked."""
    from people.models import Person, PersonDocument

    alpha = Person.all_objects.create(tenant=tenant_alpha, person_type='PF', name='Alpha')
    PersonDocument.all_objects.create(
        tenant=tenant_alpha, person=alpha, document_type='CPF', value='12345678909'
    )
    beta = Person.all_objects.create(tenant=tenant_beta, person_type='PF', name='Beta')
    PersonDocument.all_objects.create(
        tenant=tenant_beta, person=beta, document_type='CPF', value='123.456.789-09'
    )
    duplicate = Person.all_objects.create(tenant=tenant_alpha, person_type='PF', name='Duplicate')

    with pytest.raises(IntegrityError), transaction.atomic():
        PersonDocument.all_objects.create(
            tenant=tenant_alpha,
            person=duplicate,
            document_type='CPF',
            value='12345678909',
        )


@pytest.mark.django_db
def test_person_accepts_multiple_distinct_roles(tenant_alpha):
    """Given one person, when roles are assigned, then roles accumulate."""
    from people.models import Person, PersonRole

    person = Person.all_objects.create(tenant=tenant_alpha, person_type='PJ', name='ACME')
    PersonRole.all_objects.create(tenant=tenant_alpha, person=person, role='customer')
    PersonRole.all_objects.create(tenant=tenant_alpha, person=person, role='supplier')

    assert set(PersonRole.all_objects.filter(person=person).values_list('role', flat=True)) == {
        'customer',
        'supplier',
    }
