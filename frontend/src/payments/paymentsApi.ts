import { apiRequest } from '@/api/client'

export interface PaymentProviderConfig {
  id: string
  provider: string
  is_active: boolean
  configured: boolean
  created_at: string
  updated_at: string
}

export interface PaymentIntent {
  id: string
  sale: string
  amount: string
  currency: string
  status: string
  provider_reference: string
  idempotency_key: string
  created_at: string
}

export interface PaymentTransaction {
  id: string
  intent: string
  transaction_type: string
  status: string
  gross_amount: string
  fee_amount: string
  net_amount: string
  provider_reference: string
  created_at: string
}

export interface PaymentReconciliationBatch {
  id: string
  provider: string
  status: string
  confirmed_at?: string
  items: PaymentReconciliationItem[]
  created_at: string
}

export interface PaymentReconciliationItem {
  id: string
  provider_reference: string
  gross_amount: string
  fee_amount: string
  settled_amount: string
  status: string
  difference_amount: string
}

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

function buildQs(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== '') {
      search.set(key, String(val))
    }
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

export function listProviderConfigs(
  params: { page?: number; tenantId?: string | number } = {},
): Promise<PaginatedResponse<PaymentProviderConfig>> {
  const qs = buildQs({ page: params.page })
  return apiRequest<PaginatedResponse<PaymentProviderConfig>>(`/payments/provider-configs/${qs}`, {
    tenantId: params.tenantId,
  }) as Promise<PaginatedResponse<PaymentProviderConfig>>
}

export function createProviderConfig(
  data: { provider: string; secret?: string },
  tenantId?: string | number,
): Promise<PaymentProviderConfig> {
  return apiRequest<PaymentProviderConfig>('/payments/provider-configs/', {
    method: 'POST',
    body: data,
    tenantId,
  }) as Promise<PaymentProviderConfig>
}

export function updateProviderConfig(
  id: string,
  data: { secret?: string },
  tenantId?: string | number,
): Promise<PaymentProviderConfig> {
  return apiRequest<PaymentProviderConfig>(`/payments/provider-configs/${id}/`, {
    method: 'PATCH',
    body: data,
    tenantId,
  }) as Promise<PaymentProviderConfig>
}

export function listIntents(
  params: { sale?: string; status?: string; page?: number; tenantId?: string | number } = {},
): Promise<PaginatedResponse<PaymentIntent>> {
  const qs = buildQs({ sale: params.sale, status: params.status, page: params.page })
  return apiRequest<PaginatedResponse<PaymentIntent>>(`/payments/intents/${qs}`, {
    tenantId: params.tenantId,
  }) as Promise<PaginatedResponse<PaymentIntent>>
}

export function listTransactions(
  params: { intent?: string; transaction_type?: string; page?: number; tenantId?: string | number } = {},
): Promise<PaginatedResponse<PaymentTransaction>> {
  const qs = buildQs({ intent: params.intent, transaction_type: params.transaction_type, page: params.page })
  return apiRequest<PaginatedResponse<PaymentTransaction>>(`/payments/transactions/${qs}`, {
    tenantId: params.tenantId,
  }) as Promise<PaginatedResponse<PaymentTransaction>>
}

export function listReconciliationBatches(
  params: { page?: number; tenantId?: string | number } = {},
): Promise<PaginatedResponse<PaymentReconciliationBatch>> {
  const qs = buildQs({ page: params.page })
  return apiRequest<PaginatedResponse<PaymentReconciliationBatch>>(`/payments/reconciliation-batches/${qs}`, {
    tenantId: params.tenantId,
  }) as Promise<PaginatedResponse<PaymentReconciliationBatch>>
}

export function getReconciliationBatch(
  id: string,
  tenantId?: string | number,
): Promise<PaymentReconciliationBatch> {
  return apiRequest<PaymentReconciliationBatch>(`/payments/reconciliation-batches/${id}/`, {
    tenantId,
  }) as Promise<PaymentReconciliationBatch>
}

export function confirmReconciliationBatch(
  id: string,
  tenantId?: string | number,
): Promise<PaymentReconciliationBatch> {
  return apiRequest<PaymentReconciliationBatch>(`/payments/reconciliation-batches/${id}/confirm/`, {
    method: 'POST',
    tenantId,
  }) as Promise<PaymentReconciliationBatch>
}