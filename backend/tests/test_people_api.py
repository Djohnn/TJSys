"""Sprint 12 API scenarios (Given/When/Then)."""

import pytest

from people.models import Person


def _headers(tenant):
    return {'HTTP_X_TENANT_ID': str(tenant.id)}


@pytest.mark.django_db
def test_people_crud_nested_resources_and_filters(client, tenant_alpha, user_alpha):
    """Given an authenticated tenant, when managing people, then APIs persist data."""
    client.force_login(user_alpha)
    response = client.post(
        '/api/v1/people/',
        {
            'person_type': 'PJ',
            'name': 'Cliente ACME',
            'roles': ['customer'],
            'documents': [{'document_type': 'CNPJ', 'value': '12.345.678/0001-90'}],
        },
        content_type='application/json',
        **_headers(tenant_alpha),
    )
    assert response.status_code == 201, response.content
    person_id = response.json()['id']

    response = client.patch(
        f'/api/v1/people/{person_id}/',
        {'trade_name': 'ACME'},
        content_type='application/json',
        **_headers(tenant_alpha),
    )
    assert response.status_code == 200
    for endpoint, payload in [
        ('addresses', {'address_type': 'delivery', 'street': 'Rua B', 'city': 'SP', 'state': 'SP'}),
        ('contacts', {'contact_type': 'phone', 'value': '(11) 99999-0000'}),
        ('consents', {'purpose': 'marketing', 'granted': True, 'source': 'api'}),
    ]:
        created = client.post(
            f'/api/v1/people/{person_id}/{endpoint}/',
            payload,
            content_type='application/json',
            **_headers(tenant_alpha),
        )
        assert created.status_code == 201, created.content
        listed = client.get(f'/api/v1/people/{person_id}/{endpoint}/', **_headers(tenant_alpha))
        assert listed.status_code == 200
        assert len(listed.json()) == 1

    filtered = client.get(
        '/api/v1/people/?role=customer&document=12345678000190&active=true',
        **_headers(tenant_alpha),
    )
    assert filtered.status_code == 200
    assert len(filtered.json()['results']) == 1

    deactivated = client.post(
        f'/api/v1/people/{person_id}/deactivate/',
        {},
        content_type='application/json',
        **_headers(tenant_alpha),
    )
    assert deactivated.status_code == 200
    assert deactivated.json()['is_active'] is False


@pytest.mark.django_db
def test_people_detail_does_not_leak_across_tenants(
    client,
    tenant_alpha,
    tenant_beta,
    user_beta,
):
    """Given another tenant's person, when requested, then API returns 404."""
    person = Person.all_objects.create(tenant=tenant_alpha, person_type='PF', name='Segredo Alpha')
    client.force_login(user_beta)
    response = client.get(f'/api/v1/people/{person.id}/', **_headers(tenant_beta))
    assert response.status_code == 404
