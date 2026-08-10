import { apiRequest } from '@/api/client'

export interface User {
  id: number
  email: string
  name: string
  is_active: boolean
  is_mfa_enabled: boolean
}

export interface Membership {
  id: number
  tenant_id: string
  tenant_name: string
  role: string
}

export interface MeResponse {
  user: User
  memberships: Membership[]
}

export interface LoginResponse {
  requires_mfa?: boolean
  mfa_session?: string
  mfa_tenant_id?: string
  access?: string
  refresh?: string
}

let csrfRequest: Promise<void> | null = null

export function fetchCsrf(): Promise<void> {
  if (!csrfRequest) {
    csrfRequest = apiRequest('/auth/csrf/')
      .then(() => undefined)
      .finally(() => {
        csrfRequest = null
      })
  }
  return csrfRequest
}

export async function loginApi(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const result = await apiRequest<LoginResponse>('/auth/login/', {
    method: 'POST',
    body: { email, password },
  })
  return result as LoginResponse
}

export async function challengeMfaApi(
  temporaryToken: string,
  code: string,
): Promise<void> {
  await apiRequest('/auth/mfa/challenge/', {
    method: 'POST',
    body: { mfa_session: temporaryToken, code },
  })
}

export async function verifyRecoveryApi(
  tenantId: string,
  code: string,
): Promise<void> {
  await apiRequest('/auth/mfa/recovery/verify/', {
    method: 'POST',
    body: { tenant_id: tenantId, code },
  })
}

export async function fetchMe(): Promise<MeResponse> {
  const result = await apiRequest<MeResponse>('/auth/me/')
  return result as MeResponse
}

export async function logoutApi(): Promise<void> {
  await apiRequest('/auth/logout/', { method: 'POST' })
}
