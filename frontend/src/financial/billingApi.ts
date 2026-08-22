import { apiRequest } from '@/api/client'

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface Billing {
  id: string
  sale?: string | null
  purchase_order?: string | null
  branch: string
  customer_name: string
  supplier_name: string
  code: string
  status: 'draft' | 'pending' | 'issued' | 'paid' | 'overdue' | 'cancelled'
  payment_method: 'cash' | 'credit_card' | 'debit_card' | 'bank_transfer' | 'boleto' | 'pix' | 'other'
  amount: string
  discount_amount: string
  tax_amount: string
  total_amount: string
  due_date?: string | null
  paid_at?: string | null
  notes: string
  fiscal_document?: string | null
  created_at: string
  updated_at: string
}

export interface BillingListParams {
  page?: number
  status?: string
  date_from?: string
  date_to?: string
  branch?: string
}

export async function fetchBillings(
  tenantId: string,
  params: BillingListParams = {},
  signal?: AbortSignal,
): Promise<PaginatedResponse<Billing>> {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  if (params.status) searchParams.set('status', params.status)
  if (params.date_from) searchParams.set('date_from', params.date_from)
  if (params.date_to) searchParams.set('date_to', params.date_to)
  if (params.branch) searchParams.set('branch', params.branch)

  const qs = searchParams.toString()
  return apiRequest<PaginatedResponse<Billing>>(
    `/billings/${qs ? `?${qs}` : ''}`,
    { tenantId, signal },
  ) as Promise<PaginatedResponse<Billing>>
}

export async function fetchBillingById(
  tenantId: string,
  id: string,
  signal?: AbortSignal,
): Promise<Billing> {
  return apiRequest<Billing>(`/billings/${id}/`, { tenantId, signal }) as Promise<Billing>
}

export async function createBilling(
  tenantId: string,
  data: Partial<Billing>,
  signal?: AbortSignal,
): Promise<Billing> {
  return apiRequest<Billing>('/billings/', {
    method: 'POST',
    tenantId,
    body: JSON.stringify(data),
    signal,
  }) as Promise<Billing>
}

export async function updateBilling(
  tenantId: string,
  id: string,
  data: Partial<Billing>,
  signal?: AbortSignal,
): Promise<Billing> {
  return apiRequest<Billing>(`/billings/${id}/`, {
    method: 'PATCH',
    tenantId,
    body: JSON.stringify(data),
    signal,
  }) as Promise<Billing>
}

export async function issueBilling(
  tenantId: string,
  id: string,
  signal?: AbortSignal,
): Promise<Billing> {
  return apiRequest<Billing>(`/billings/${id}/issue/`, {
    method: 'POST',
    tenantId,
    signal,
  }) as Promise<Billing>
}

export async function payBilling(
  tenantId: string,
  id: string,
  signal?: AbortSignal,
): Promise<Billing> {
  return apiRequest<Billing>(`/billings/${id}/pay/`, {
    method: 'POST',
    tenantId,
    signal,
  }) as Promise<Billing>
}

export async function cancelBilling(
  tenantId: string,
  id: string,
  signal?: AbortSignal,
): Promise<Billing> {
  return apiRequest<Billing>(`/billings/${id}/cancel/`, {
    method: 'POST',
    tenantId,
    signal,
  }) as Promise<Billing>
}
