import { apiRequest } from '@/api/client'

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

// =============================================================================
// SupplierQuote
// =============================================================================

export interface SupplierQuote {
  id: string
  supplier: string
  supplier_name: string
  branch: string
  branch_name: string
  code: string
  status: string
  valid_until: string | null
  notes: string
  total_amount: string
  created_by: string | null
  created_by_name: string
  created_at: string
  updated_at: string
}

export function fetchSupplierQuotes(
  tenantId: string,
  params: { page?: number; status?: string; supplier?: string } = {},
  signal?: AbortSignal,
): Promise<PaginatedResponse<SupplierQuote>> {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  if (params.status) searchParams.set('status', params.status)
  if (params.supplier) searchParams.set('supplier', params.supplier)
  const qs = searchParams.toString()
  return apiRequest<PaginatedResponse<SupplierQuote>>(`/purchasing/supplier-quotes/${qs ? `?${qs}` : ''}`, {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<SupplierQuote>>
}

export function createSupplierQuote(
  tenantId: string,
  data: Partial<SupplierQuote>,
): Promise<SupplierQuote> {
  return apiRequest<SupplierQuote>('/purchasing/supplier-quotes/', {
    tenantId,
    method: 'POST',
    body: JSON.stringify(data),
  }) as Promise<SupplierQuote>
}

export function sendSupplierQuote(
  tenantId: string,
  quoteId: string,
): Promise<SupplierQuote> {
  return apiRequest<SupplierQuote>(`/purchasing/supplier-quotes/${quoteId}/send/`, {
    tenantId,
    method: 'POST',
  }) as Promise<SupplierQuote>
}

export function approveSupplierQuote(
  tenantId: string,
  quoteId: string,
): Promise<SupplierQuote> {
  return apiRequest<SupplierQuote>(`/purchasing/supplier-quotes/${quoteId}/approve/`, {
    tenantId,
    method: 'POST',
  }) as Promise<SupplierQuote>
}

export function rejectSupplierQuote(
  tenantId: string,
  quoteId: string,
): Promise<SupplierQuote> {
  return apiRequest<SupplierQuote>(`/purchasing/supplier-quotes/${quoteId}/reject/`, {
    tenantId,
    method: 'POST',
  }) as Promise<SupplierQuote>
}

export function cancelSupplierQuote(
  tenantId: string,
  quoteId: string,
): Promise<SupplierQuote> {
  return apiRequest<SupplierQuote>(`/purchasing/supplier-quotes/${quoteId}/cancel/`, {
    tenantId,
    method: 'POST',
  }) as Promise<SupplierQuote>
}

// =============================================================================
// OpenPurchase
// =============================================================================

export interface OpenPurchase {
  id: string
  supplier: string
  supplier_name: string
  branch: string
  branch_name: string
  status: string
  notes: string
  items_total: string
  created_at: string
  updated_at: string
}

export function fetchOpenPurchases(
  tenantId: string,
  params: { page?: number; status?: string; supplier?: string } = {},
  signal?: AbortSignal,
): Promise<PaginatedResponse<OpenPurchase>> {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  if (params.status) searchParams.set('status', params.status)
  if (params.supplier) searchParams.set('supplier', params.supplier)
  const qs = searchParams.toString()
  return apiRequest<PaginatedResponse<OpenPurchase>>(`/purchasing/open-purchases/${qs ? `?${qs}` : ''}`, {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<OpenPurchase>>
}

// =============================================================================
// PurchaseReturn
// =============================================================================

export interface PurchaseReturn {
  id: string
  receipt: string
  receipt_code: string
  purchase_order_code: string
  supplier_name: string
  reason: string
  status: string
  idempotency_key: string
  created_at: string
  updated_at: string
}

export function fetchPurchaseReturns(
  tenantId: string,
  params: { page?: number; status?: string } = {},
  signal?: AbortSignal,
): Promise<PaginatedResponse<PurchaseReturn>> {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  if (params.status) searchParams.set('status', params.status)
  const qs = searchParams.toString()
  return apiRequest<PaginatedResponse<PurchaseReturn>>(`/purchasing/supplier-returns/${qs ? `?${qs}` : ''}`, {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<PurchaseReturn>>
}

export function createPurchaseReturn(
  tenantId: string,
  data: Partial<PurchaseReturn>,
): Promise<PurchaseReturn> {
  return apiRequest<PurchaseReturn>('/purchasing/supplier-returns/', {
    tenantId,
    method: 'POST',
    body: JSON.stringify(data),
  }) as Promise<PurchaseReturn>
}

export function completePurchaseReturn(
  tenantId: string,
  returnId: string,
): Promise<PurchaseReturn> {
  return apiRequest<PurchaseReturn>(`/purchasing/supplier-returns/${returnId}/complete/`, {
    tenantId,
    method: 'POST',
  }) as Promise<PurchaseReturn>
}

export function cancelPurchaseReturn(
  tenantId: string,
  returnId: string,
): Promise<PurchaseReturn> {
  return apiRequest<PurchaseReturn>(`/purchasing/supplier-returns/${returnId}/cancel/`, {
    tenantId,
    method: 'POST',
  }) as Promise<PurchaseReturn>
}
