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
  unit_symbol?: string
  unit_precision?: number
  updated_at: string
}

export interface StockMovement {
  id: string
  product: string
  product_name: string
  branch: string
  branch_name: string
  location_name?: string
  type: 'in' | 'out' | 'transfer' | 'adjust'
  quantity: string
  unit_symbol?: string
  unit_precision?: number
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
  unit_symbol?: string
  unit_precision?: number
  expiry_date: string | null
  branch: string
  branch_name: string
  created_at: string
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
  q?: string
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

export interface ProductStockPolicy {
  id: string
  product: string
  branch: string
  location: string
  minimum_quantity: string
  maximum_quantity: string | null
  reorder_point: string
  allow_negative: boolean
  is_active: boolean
  version: number
}

export interface ProductStockSummary {
  product: string
  branch: string | null
  branch_name: string
  location: string | null
  location_name: string
  quantity: string
  reserved: string
  available: string
  status: 'negative' | 'zero' | 'low' | 'normal'
  minimum_quantity: string
  maximum_quantity: string | null
  reorder_point: string
  unit_name?: string
  unit_symbol?: string
  unit_precision?: number
}

export function fetchBranches(
  tenantId: string,
  signal?: AbortSignal,
): Promise<PaginatedResponse<Branch>> {
  return apiRequest<PaginatedResponse<Branch>>('/branches/', { tenantId, signal }) as Promise<PaginatedResponse<Branch>>
}

export function fetchStockLocations(
  tenantId: string,
  query: { branch?: string },
  signal?: AbortSignal,
): Promise<PaginatedResponse<StockLocation>> {
  const qs = buildSearchParams(query as Record<string, string | number | undefined>)
  return apiRequest<PaginatedResponse<StockLocation>>(`/inventory/stock-locations/${qs}`, {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<StockLocation>>
}

export function fetchProductStockSummary(
  tenantId: string,
  productId: string,
  signal?: AbortSignal,
): Promise<ProductStockSummary[] | ProductStockSummary | null> {
  return apiRequest<ProductStockSummary[] | ProductStockSummary | null>(`/inventory/product-summary/${productId}/`, {
    tenantId,
    signal,
  }) as Promise<ProductStockSummary[] | ProductStockSummary | null>
}

export function fetchProductStockPolicies(
  tenantId: string,
  productId: string,
): Promise<PaginatedResponse<ProductStockPolicy>> {
  return apiRequest<PaginatedResponse<ProductStockPolicy>>(
    `/inventory/product-policies/?product=${productId}`,
    { tenantId },
  ) as Promise<PaginatedResponse<ProductStockPolicy>>
}

export function updateProductStockPolicy(
  tenantId: string,
  policyId: string,
  body: Record<string, unknown>,
  version: number,
): Promise<ProductStockPolicy> {
  return apiRequest<ProductStockPolicy>(`/inventory/product-policies/${policyId}/`, {
    method: 'PATCH',
    tenantId,
    body,
    headers: { 'If-Match': String(version) },
  }) as Promise<ProductStockPolicy>
}
