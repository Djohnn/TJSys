import { apiRequest } from '@/api/client'

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

// =============================================================================
// StorageType
// =============================================================================

export interface StorageType {
  id: string
  name: string
  description: string
  temperature_min: number | null
  temperature_max: number | null
  requires_refrigeration: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export function fetchStorageTypes(
  tenantId: string,
  params: { page?: number; is_active?: boolean } = {},
  signal?: AbortSignal,
): Promise<PaginatedResponse<StorageType>> {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  if (params.is_active !== undefined) searchParams.set('is_active', String(params.is_active))
  const qs = searchParams.toString()
  return apiRequest<PaginatedResponse<StorageType>>(`/inventory/storage-types/${qs ? `?${qs}` : ''}`, {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<StorageType>>
}

// =============================================================================
// MovementReason
// =============================================================================

export interface MovementReason {
  id: string
  name: string
  description: string
  direction: string
  requires_authorization: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export function fetchMovementReasons(
  tenantId: string,
  params: { page?: number; is_active?: boolean; direction?: string } = {},
  signal?: AbortSignal,
): Promise<PaginatedResponse<MovementReason>> {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  if (params.is_active !== undefined) searchParams.set('is_active', String(params.is_active))
  if (params.direction) searchParams.set('direction', params.direction)
  const qs = searchParams.toString()
  return apiRequest<PaginatedResponse<MovementReason>>(`/inventory/movement-reasons/${qs ? `?${qs}` : ''}`, {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<MovementReason>>
}

// =============================================================================
// Replenishment
// =============================================================================

export interface ReplenishmentRule {
  id: string
  product: string
  product_name: string
  location: string
  location_name: string
  trigger_type: string
  min_quantity: string
  max_quantity: string
  reorder_quantity: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ReplenishmentOrder {
  id: string
  rule: string
  rule_name: string
  status: string
  quantity: string
  notes: string
  approved_by: string | null
  approved_by_name: string
  approved_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export function fetchReplenishmentRules(
  tenantId: string,
  params: { page?: number; is_active?: boolean } = {},
  signal?: AbortSignal,
): Promise<PaginatedResponse<ReplenishmentRule>> {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  if (params.is_active !== undefined) searchParams.set('is_active', String(params.is_active))
  const qs = searchParams.toString()
  return apiRequest<PaginatedResponse<ReplenishmentRule>>(`/inventory/replenishment-rules/${qs ? `?${qs}` : ''}`, {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<ReplenishmentRule>>
}

export function fetchReplenishmentOrders(
  tenantId: string,
  params: { page?: number; status?: string } = {},
  signal?: AbortSignal,
): Promise<PaginatedResponse<ReplenishmentOrder>> {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  if (params.status) searchParams.set('status', params.status)
  const qs = searchParams.toString()
  return apiRequest<PaginatedResponse<ReplenishmentOrder>>(`/inventory/replenishment-orders/${qs ? `?${qs}` : ''}`, {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<ReplenishmentOrder>>
}

// =============================================================================
// InventoryCount
// =============================================================================

export interface InventoryCount {
  id: string
  location: string
  location_name: string
  status: string
  notes: string
  started_at: string | null
  completed_at: string | null
  counted_by: string | null
  counted_by_name: string
  created_at: string
  updated_at: string
}

export interface InventoryCountItem {
  id: string
  count: string
  product: string
  product_name: string
  system_quantity: string
  counted_quantity: string | null
  difference: string | null
  notes: string
  created_at: string
  updated_at: string
}

export function fetchInventoryCounts(
  tenantId: string,
  params: { page?: number; status?: string; location?: string } = {},
  signal?: AbortSignal,
): Promise<PaginatedResponse<InventoryCount>> {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  if (params.status) searchParams.set('status', params.status)
  if (params.location) searchParams.set('location', params.location)
  const qs = searchParams.toString()
  return apiRequest<PaginatedResponse<InventoryCount>>(`/inventory/inventory-counts/${qs ? `?${qs}` : ''}`, {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<InventoryCount>>
}

export function fetchInventoryCountItems(
  tenantId: string,
  params: { page?: number; count?: string } = {},
  signal?: AbortSignal,
): Promise<PaginatedResponse<InventoryCountItem>> {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  if (params.count) searchParams.set('count', params.count)
  const qs = searchParams.toString()
  return apiRequest<PaginatedResponse<InventoryCountItem>>(`/inventory/inventory-count-items/${qs ? `?${qs}` : ''}`, {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<InventoryCountItem>>
}
