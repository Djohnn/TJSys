import { apiRequest } from '@/api/client'
import type { PaginatedResponse } from '@/catalog/catalogApi'

export type { PaginatedResponse }

export interface PersonListItem {
  id: string
  person_type: 'PF' | 'PJ'
  name: string
  document: string
  role: 'customer' | 'supplier' | 'employee'
  is_active: boolean
}

export interface Address {
  id: string
  street: string
  number: string
  complement: string
  neighborhood: string
  city: string
  state: string
  zip: string
  is_primary: boolean
}

export interface Contact {
  id: string
  type: 'phone' | 'email'
  value: string
  is_primary: boolean
}

export interface Consent {
  id: string
  type: string
  granted_at: string
  revoked_at: string | null
}

export interface PersonDetail {
  id: string
  person_type: 'PF' | 'PJ'
  name: string
  cpf: string | null
  rg: string | null
  company_name: string | null
  trade_name: string | null
  cnpj: string | null
  ie: string | null
  role: 'customer' | 'supplier' | 'employee'
  is_active: boolean
  created_at: string
  updated_at: string
  addresses: Address[]
  contacts: Contact[]
  consents: Consent[]
}

export interface PersonListParams {
  page?: number
  q?: string
  role?: string
  active?: string
}

export function fetchPeople(
  tenantId: string,
  params: PersonListParams,
  signal?: AbortSignal,
): Promise<PaginatedResponse<PersonListItem>> {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  if (params.q) searchParams.set('q', params.q)
  if (params.role) searchParams.set('role', params.role)
  if (params.active) searchParams.set('active', params.active)
  const qs = searchParams.toString()
  return apiRequest<PaginatedResponse<PersonListItem>>(`/people/${qs ? `?${qs}` : ''}`, {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<PersonListItem>>
}

export function createPerson(
  tenantId: string,
  body: Record<string, unknown>,
): Promise<PersonDetail> {
  return apiRequest<PersonDetail>('/people/', {
    method: 'POST',
    tenantId,
    body,
  }) as Promise<PersonDetail>
}

export function fetchPerson(
  tenantId: string,
  id: string,
  signal?: AbortSignal,
): Promise<PersonDetail> {
  return apiRequest<PersonDetail>(`/people/${id}/`, {
    tenantId,
    signal,
  }) as Promise<PersonDetail>
}

export function updatePerson(
  tenantId: string,
  id: string,
  body: Record<string, unknown>,
): Promise<PersonDetail> {
  return apiRequest<PersonDetail>(`/people/${id}/`, {
    method: 'PATCH',
    tenantId,
    body,
  }) as Promise<PersonDetail>
}

export function deactivatePerson(
  tenantId: string,
  id: string,
): Promise<{ detail: string }> {
  return apiRequest<{ detail: string }>(`/people/${id}/deactivate/`, {
    method: 'POST',
    tenantId,
  }) as Promise<{ detail: string; }>
}

export function grantConsent(
  tenantId: string,
  personId: string,
  type: string,
): Promise<Consent> {
  return apiRequest<Consent>(`/people/${personId}/consents/`, {
    method: 'POST',
    tenantId,
    body: { type },
  }) as Promise<Consent>
}

export function revokeConsent(
  tenantId: string,
  personId: string,
  consentId: string,
): Promise<Consent> {
  return apiRequest<Consent>(`/people/${personId}/consents/${consentId}/revoke/`, {
    method: 'POST',
    tenantId,
  }) as Promise<Consent>
}

export function createAddress(
  tenantId: string,
  personId: string,
  body: Record<string, unknown>,
): Promise<Address> {
  return apiRequest<Address>(`/people/${personId}/addresses/`, {
    method: 'POST',
    tenantId,
    body,
  }) as Promise<Address>
}

export function updateAddress(
  tenantId: string,
  personId: string,
  addressId: string,
  body: Record<string, unknown>,
): Promise<Address> {
  return apiRequest<Address>(`/people/${personId}/addresses/${addressId}/`, {
    method: 'PATCH',
    tenantId,
    body,
  }) as Promise<Address>
}

export function createContact(
  tenantId: string,
  personId: string,
  body: Record<string, unknown>,
): Promise<Contact> {
  return apiRequest<Contact>(`/people/${personId}/contacts/`, {
    method: 'POST',
    tenantId,
    body,
  }) as Promise<Contact>
}

export function updateContact(
  tenantId: string,
  personId: string,
  contactId: string,
  body: Record<string, unknown>,
): Promise<Contact> {
  return apiRequest<Contact>(`/people/${personId}/contacts/${contactId}/`, {
    method: 'PATCH',
    tenantId,
    body,
  }) as Promise<Contact>
}
