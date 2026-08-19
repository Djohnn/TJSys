import { apiRequest } from '@/api/client'

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface FiscalCompensation {
  id: string
  fiscal_document?: string | null
  branch: string
  customer_name: string
  supplier_name: string
  code: string
  compensation_type: 'credit' | 'debit' | 'both'
  status: 'pending' | 'approved' | 'rejected' | 'processed' | 'cancelled'
  amount: string
  compensated_amount: string
  remaining_amount: string
  due_date?: string | null
  compensated_at?: string | null
  notes: string
  created_at: string
  updated_at: string
}

export interface FiscalCompensationListParams {
  page?: number
  status?: string
  date_from?: string
  date_to?: string
  branch?: string
}

export async function fetchFiscalCompensations(
  tenantId: string,
  params: FiscalCompensationListParams = {},
  signal?: AbortSignal,
): Promise<PaginatedResponse<FiscalCompensation>> {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  if (params.status) searchParams.set('status', params.status)
  if (params.date_from) searchParams.set('date_from', params.date_from)
  if (params.date_to) searchParams.set('date_to', params.date_to)
  if (params.branch) searchParams.set('branch', params.branch)

  const qs = searchParams.toString()
  return apiRequest<PaginatedResponse<FiscalCompensation>>(
    `/fiscal-compensations/${qs ? `?${qs}` : ''}`,
    { tenantId, signal },
  )
}

export async function fetchFiscalCompensationById(
  tenantId: string,
  id: string,
  signal?: AbortSignal,
): Promise<FiscalCompensation> {
  return apiRequest<FiscalCompensation>(`/fiscal-compensations/${id}/`, { tenantId, signal })
}

export async function createFiscalCompensation(
  tenantId: string,
  data: Partial<FiscalCompensation>,
  signal?: AbortSignal,
): Promise<FiscalCompensation> {
  return apiRequest<FiscalCompensation>('/fiscal-compensations/', {
    method: 'POST',
    tenantId,
    body: JSON.stringify(data),
    signal,
  })
}

export async function updateFiscalCompensation(
  tenantId: string,
  id: string,
  data: Partial<FiscalCompensation>,
  signal?: AbortSignal,
): Promise<FiscalCompensation> {
  return apiRequest<FiscalCompensation>(`/fiscal-compensations/${id}/`, {
    method: 'PATCH',
    tenantId,
    body: JSON.stringify(data),
    signal,
  })
}

export async function approveFiscalCompensation(
  tenantId: string,
  id: string,
  signal?: AbortSignal,
): Promise<FiscalCompensation> {
  return apiRequest<FiscalCompensation>(`/fiscal-compensations/${id}/approve/`, {
    method: 'POST',
    tenantId,
    signal,
  })
}

export async function processFiscalCompensation(
  tenantId: string,
  id: string,
  signal?: AbortSignal,
): Promise<FiscalCompensation> {
  return apiRequest<FiscalCompensation>(`/fiscal-compensations/${id}/process/`, {
    method: 'POST',
    tenantId,
    signal,
  })
}

export async function cancelFiscalCompensation(
  tenantId: string,
  id: string,
  signal?: AbortSignal,
): Promise<FiscalCompensation> {
  return apiRequest<FiscalCompensation>(`/fiscal-compensations/${id}/cancel/`, {
    method: 'POST',
    tenantId,
    signal,
  })
}
