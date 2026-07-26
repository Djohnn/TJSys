"""Sprint 12 integration scenarios (Given/When/Then)."""

import pytest
from django.core.exceptions import ValidationError


@pytest.mark.django_db
def test_sale_supports_identified_customer_without_breaking_counter_sale(sale_context):
    """Given a counter sale, when customer is identified, then reference is optional."""
    from people.models import Person, PersonRole

    ctx = sale_context
    customer = Person.all_objects.create(
        tenant=ctx['tenant'], person_type='PF', name='Cliente Identificado'
    )
    PersonRole.all_objects.create(tenant=ctx['tenant'], person=customer, role='customer')
    sale = ctx['sale']
    assert sale.customer is None
    sale.customer = customer
    sale.full_clean()
    sale.save(update_fields=['customer'])
    assert sale.customer == customer


@pytest.mark.django_db
def test_supplier_can_link_only_to_same_tenant_person(tenant_alpha, tenant_beta):
    """Given suppliers, when linked, then cross-tenant Person is rejected."""
    from people.models import Person
    from purchasing.models import Supplier

    person = Person.all_objects.create(tenant=tenant_alpha, person_type='PJ', name='ACME')
    supplier = Supplier.all_objects.create(tenant=tenant_alpha, name='ACME', person=person)
    assert supplier.person == person
    foreign = Person.all_objects.create(tenant=tenant_beta, person_type='PJ', name='Beta')
    supplier.person = foreign
    with pytest.raises(ValidationError):
        supplier.full_clean()


@pytest.mark.django_db
def test_fiscal_recipient_is_loaded_from_person(tenant_alpha):
    """Given customer data, when fiscal recipient is built, then normalized data is used."""
    from fiscal.services import build_recipient_dict
    from people.models import Person, PersonAddress, PersonDocument

    person = Person.all_objects.create(tenant=tenant_alpha, person_type='PF', name='Maria')
    PersonDocument.all_objects.create(
        tenant=tenant_alpha, person=person, document_type='CPF', value='123.456.789-09'
    )
    PersonAddress.all_objects.create(
        tenant=tenant_alpha,
        person=person,
        address_type='fiscal',
        street='Rua A',
        city='São Paulo',
        state='sp',
        postal_code='01001-000',
        is_primary=True,
    )

    recipient = build_recipient_dict(person)
    assert recipient['cpf_cnpj'] == '12345678909'
    assert recipient['address']['postal_code'] == '01001000'
