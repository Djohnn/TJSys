import { apiRequest } from '@/api/client'

export interface Supplier {
  id: string
  name: string
  cnpj: string
  ie: string
  is_active: boolean
  created_at: string
}

export interface PurchaseOrderItem {
  id: string
  product: string
  product_name: string
  quantity: string
  unit_price: string
  total: string
}

export interface PurchaseOrder {
  id: string
  number: string
  supplier: string
  supplier_name: string
  branch: string
  branch_name: string
  status: string
  total: string
  items: PurchaseOrderItem[]
  created_at: string
  created_by_name: string
}

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export function fetchSuppliers(
  tenantId: string,
  params: { page?: number; q?: string; active?: string } = {},
  signal?: AbortSignal,
): Promise<PaginatedResponse<Supplier>> {
  const search = new URLSearchParams()
  if (params.page) search.set('page', String(params.page))
  if (params.q) search.set('q', params.q)
  if (params.active !== undefined) search.set('active', params.active)
  const qs = search.toString()
  return apiRequest<PaginatedResponse<Supplier>>(`/purchasing/suppliers/${qs ? `?${qs}` : ''}`, {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<Supplier>>
}

export function createSupplier(
  tenantId: string,
  body: { name: string; cnpj?: string; ie?: string; is_active?: boolean },
  idempotencyKey?: string,
): Promise<Supplier> {
  return apiRequest<Supplier>('/purchasing/suppliers/', {
    method: 'POST',
    tenantId,
    body,
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
  }) as Promise<Supplier>
}

export function updateSupplier(
  tenantId: string,
  id: string,
  body: { name: string; cnpj?: string; ie?: string; is_active?: boolean },
): Promise<Supplier> {
  return apiRequest<Supplier>(`/purchasing/suppliers/${id}/`, {
    method: 'PATCH',
    tenantId,
    body,
  }) as Promise<Supplier>
}

export function fetchPurchaseOrders(
  tenantId: string,
  params: { page?: number; status?: string; supplier?: string; branch?: string } = {},
  signal?: AbortSignal,
): Promise<PaginatedResponse<PurchaseOrder>> {
  const search = new URLSearchParams()
  if (params.page) search.set('page', String(params.page))
  if (params.status) search.set('status', params.status)
  if (params.supplier) search.set('supplier', params.supplier)
  if (params.branch) search.set('branch', params.branch)
  const qs = search.toString()
  return apiRequest<PaginatedResponse<PurchaseOrder>>(`/purchasing/orders/${qs ? `?${qs}` : ''}`, {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<PurchaseOrder>>
}

export function fetchPurchaseOrder(
  tenantId: string,
  id: string,
  signal?: AbortSignal,
): Promise<PurchaseOrder> {
  return apiRequest<PurchaseOrder>(`/purchasing/orders/${id}/`, {
    tenantId,
    signal,
  }) as Promise<PurchaseOrder>
}

export function createPurchaseOrder(
  tenantId: string,
  body: {
    supplier: string
    branch: string
    items: { product: string; quantity: string; unit_price: string }[]
  },
  idempotencyKey?: string,
): Promise<PurchaseOrder> {
  return apiRequest<PurchaseOrder>('/purchasing/orders/', {
    method: 'POST',
    tenantId,
    body,
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
  }) as Promise<PurchaseOrder>
}

export function updatePurchaseOrder(
  tenantId: string,
  id: string,
  body: {
    supplier: string
    branch: string
    items: { product: string; quantity: string; unit_price: string }[]
  },
): Promise<PurchaseOrder> {
  return apiRequest<PurchaseOrder>(`/purchasing/orders/${id}/`, {
    method: 'PATCH',
    tenantId,
    body,
  }) as Promise<PurchaseOrder>
}

export function approvePurchaseOrder(
  tenantId: string,
  id: string,
): Promise<PurchaseOrder> {
  return apiRequest<PurchaseOrder>(`/purchasing/orders/${id}/approve/`, {
    method: 'POST',
    tenantId,
  }) as Promise<PurchaseOrder>
}
