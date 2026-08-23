import { apiRequest } from '@/api/client'

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

// =============================================================================
// ProductionOrder
// =============================================================================

export interface ProductionOrder {
  id: string
  code: string
  product: string
  product_name: string
  quantity: string
  unit: string
  unit_name: string
  location: string
  location_name: string
  status: string
  priority: string
  planned_start_date: string | null
  planned_end_date: string | null
  actual_start_date: string | null
  actual_end_date: string | null
  notes: string
  created_by: string | null
  created_by_name: string
  confirmed_by: string | null
  confirmed_by_name: string
  created_at: string
  updated_at: string
}

export function fetchProductionOrders(
  tenantId: string,
  params: { page?: number; status?: string; priority?: string } = {},
  signal?: AbortSignal,
): Promise<PaginatedResponse<ProductionOrder>> {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  if (params.status) searchParams.set('status', params.status)
  if (params.priority) searchParams.set('priority', params.priority)
  const qs = searchParams.toString()
  return apiRequest<PaginatedResponse<ProductionOrder>>(`/inventory/production-orders/${qs ? `?${qs}` : ''}`, {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<ProductionOrder>>
}

export function createProductionOrder(
  tenantId: string,
  data: Partial<ProductionOrder>,
): Promise<ProductionOrder> {
  return apiRequest<ProductionOrder>('/inventory/production-orders/', {
    tenantId,
    method: 'POST',
    body: JSON.stringify(data),
  }) as Promise<ProductionOrder>
}

export function confirmProductionOrder(
  tenantId: string,
  orderId: string,
): Promise<ProductionOrder> {
  return apiRequest<ProductionOrder>(`/inventory/production-orders/${orderId}/confirm/`, {
    tenantId,
    method: 'POST',
  }) as Promise<ProductionOrder>
}

export function startProductionOrder(
  tenantId: string,
  orderId: string,
): Promise<ProductionOrder> {
  return apiRequest<ProductionOrder>(`/inventory/production-orders/${orderId}/start/`, {
    tenantId,
    method: 'POST',
  }) as Promise<ProductionOrder>
}

export function completeProductionOrder(
  tenantId: string,
  orderId: string,
): Promise<ProductionOrder> {
  return apiRequest<ProductionOrder>(`/inventory/production-orders/${orderId}/complete/`, {
    tenantId,
    method: 'POST',
  }) as Promise<ProductionOrder>
}

export function cancelProductionOrder(
  tenantId: string,
  orderId: string,
): Promise<ProductionOrder> {
  return apiRequest<ProductionOrder>(`/inventory/production-orders/${orderId}/cancel/`, {
    tenantId,
    method: 'POST',
  }) as Promise<ProductionOrder>
}

// =============================================================================
// StockMap
// =============================================================================

export interface StockMapEntry {
  id: string
  product: {
    id: string
    sku: string
    name: string
  }
  location: {
    id: string
    code: string
    name: string
    branch: {
      id: string
      name: string
    }
  }
  lot: {
    id: string
    lot_number: string
  } | null
  quantity: string
  reserved: string
  available: string
}

export function fetchStockMap(
  tenantId: string,
  params: { location?: string; product?: string; lot?: string } = {},
  signal?: AbortSignal,
): Promise<StockMapEntry[]> {
  const searchParams = new URLSearchParams()
  if (params.location) searchParams.set('location', params.location)
  if (params.product) searchParams.set('product', params.product)
  if (params.lot) searchParams.set('lot', params.lot)
  const qs = searchParams.toString()
  return apiRequest<StockMapEntry[]>(`/inventory/stock-map/${qs ? `?${qs}` : ''}`, {
    tenantId,
    signal,
  }) as Promise<StockMapEntry[]>
}
