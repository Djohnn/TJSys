import { apiRequest } from '@/api/client'

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface StockBalance {
  id: string
  product: string
  product_name: string
  product_sku: string
  branch: string
  branch_name: string
  location: string
  location_name: string
  quantity: string
  unit_name: string
  updated_at: string
}

export interface StockMovement {
  id: string
  product: string
  product_name: string
  branch: string
  branch_name: string
  type: 'in' | 'out' | 'transfer' | 'adjust'
  quantity: string
  reason: string
  reference_id: string | null
  created_at: string
  created_by_name: string
}

export interface InventoryLot {
  id: string
  product: string
  product_name: string
  product_sku: string
  lot_number: string
  quantity: string
  expiry_date: string | null
  branch: string
  branch_name: string
  created_at: string
}

export interface Branch {
  id: string
  name: string
  code: string
  is_active: boolean
}

export interface StockLocation {
  id: string
  branch: string
  branch_name: string
  code: string
  name: string
  location_type: string
  is_primary: boolean
  is_active: boolean
}

export interface ReceiptPayload {
  product: string
  branch: string
  location: string
  quantity: string
  reference: string
}

export interface TransferPayload {
  product: string
  source_branch: string
  destination_branch: string
  quantity: string
  reason: string
}

export interface AdjustmentPayload {
  product: string
  branch: string
  location: string
  quantity: string
  reason: string
}

export interface BalancesQuery {
  page?: number
  branch?: string
  location?: string
  product?: string
}

export interface MovementsQuery {
  page?: number
  date_from?: string
  date_to?: string
  type?: string
  branch?: string
  product?: string
}

export interface LotsQuery {
  page?: number
  branch?: string
  product?: string
  expiring_before?: string
}

function buildSearchParams(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      search.set(key, String(value))
    }
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

export function fetchBalances(
  tenantId: string,
  query: BalancesQuery,
  signal?: AbortSignal,
): Promise<PaginatedResponse<StockBalance>> {
  const qs = buildSearchParams(query as Record<string, string | number | undefined>)
  return apiRequest<PaginatedResponse<StockBalance>>(`/inventory/balances/${qs}`, {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<StockBalance>>
}

export function fetchMovements(
  tenantId: string,
  query: MovementsQuery,
  signal?: AbortSignal,
): Promise<PaginatedResponse<StockMovement>> {
  const qs = buildSearchParams(query as Record<string, string | number | undefined>)
  return apiRequest<PaginatedResponse<StockMovement>>(`/inventory/movements/${qs}`, {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<StockMovement>>
}

export function createMovement(
  tenantId: string,
  body: ReceiptPayload | TransferPayload | AdjustmentPayload,
  idempotencyKey?: string,
): Promise<StockMovement> {
  const headers: Record<string, string> = {}
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey
  }
  return apiRequest<StockMovement>('/inventory/movements/', {
    method: 'POST',
    tenantId,
    body,
    headers,
  }) as Promise<StockMovement>
}

export function fetchLots(
  tenantId: string,
  query: LotsQuery,
  signal?: AbortSignal,
): Promise<PaginatedResponse<InventoryLot>> {
  const qs = buildSearchParams(query as Record<string, string | number | undefined>)
  return apiRequest<PaginatedResponse<InventoryLot>>(`/inventory/lots/${qs}`, {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<InventoryLot>>
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

export function fetchStockLocations(
  tenantId: string,
  query: { branch?: string },
  signal?: AbortSignal,
): Promise<PaginatedResponse<StockLocation>> {
  const qs = buildSearchParams(query)
  return apiRequest<PaginatedResponse<StockLocation>>(`/inventory/stock-locations/${qs}`, {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<StockLocation>>
}
