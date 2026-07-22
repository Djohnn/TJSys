import { apiRequest } from '@/api/client'

export interface Company {
  id: string
  name: string
  cnpj: string
  ie: string
  address_json: Record<string, unknown>
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Branch {
  id: string
  company: string
  company_name: string
  name: string
  is_active: boolean
  ie: string
  address_json: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export function fetchCompanies(
  tenantId: string,
  signal?: AbortSignal,
): Promise<PaginatedResponse<Company>> {
  return apiRequest<PaginatedResponse<Company>>('/companies/', {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<Company>>
}

export function fetchBranches(
  tenantId: string,
  signal?: AbortSignal,
): Promise<PaginatedResponse<Branch>> {
  return apiRequest<PaginatedResponse<Branch>>('/branches/', {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<Branch>>
}

export function fetchBranchDetail(
  tenantId: string,
  branchId: string,
  signal?: AbortSignal,
): Promise<Branch> {
  return apiRequest<Branch>(`/branches/${branchId}/`, {
    tenantId,
    signal,
  }) as Promise<Branch>
}

export function healthCheck(signal?: AbortSignal): Promise<{ status: string }> {
  return apiRequest<{ status: string }>('/health/', {
    signal,
  }) as Promise<{ status: string }>
}
