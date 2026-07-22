import { apiRequest } from '@/api/client'

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface SaleItem {
  id: string
  product: string
  product_name: string
  quantity: string
  unit_price: string
  total: string
}

export interface SalePayment {
  id: string
  method: string
  method_name: string
  amount: string
  status: string
  status_label: string
}

export interface Sale {
  id: string
  created_at: string
  customer: string
  customer_name: string
  operator: string
  operator_name: string
  branch: string
  branch_name: string
  device: string
  device_name: string
  total: string
  status: string
  status_label: string
  items: SaleItem[]
  payments: SalePayment[]
  linked_stock_movement: string | null
  linked_fiscal_document: string | null
  linked_financial_entries: string[]
}

export interface SalesQuery {
  page?: number
  date_from?: string
  date_to?: string
  branch?: string
  operator?: string
  device?: string
  customer?: string
  status?: string
}

export interface CashMovement {
  id: string
  type: string
  type_label: string
  amount: string
  description: string
  created_at: string
}

export interface CashSession {
  id: string
  date: string
  branch: string
  branch_name: string
  operator: string
  operator_name: string
  opened_at: string
  closed_at: string | null
  expected_balance: string
  actual_balance: string
  difference: string
  status: string
  movements: CashMovement[]
}

export interface CashSessionsQuery {
  page?: number
  date_from?: string
  date_to?: string
  branch?: string
  operator?: string
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

export function fetchSales(
  tenantId: string,
  query: SalesQuery,
  signal?: AbortSignal,
): Promise<PaginatedResponse<Sale>> {
  const qs = buildSearchParams(query as Record<string, string | number | undefined>)
  return apiRequest<PaginatedResponse<Sale>>(`/sales/${qs}`, {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<Sale>>
}

export function fetchSale(
  tenantId: string,
  id: string,
  signal?: AbortSignal,
): Promise<Sale> {
  return apiRequest<Sale>(`/sales/${id}/`, {
    tenantId,
    signal,
  }) as Promise<Sale>
}

export function fetchCashSessions(
  tenantId: string,
  query: CashSessionsQuery,
  signal?: AbortSignal,
): Promise<PaginatedResponse<CashSession>> {
  const qs = buildSearchParams(query as Record<string, string | number | undefined>)
  return apiRequest<PaginatedResponse<CashSession>>(`/cash-sessions/${qs}`, {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<CashSession>>
}

export function fetchCashSession(
  tenantId: string,
  id: string,
  signal?: AbortSignal,
): Promise<CashSession> {
  return apiRequest<CashSession>(`/cash-sessions/${id}/`, {
    tenantId,
    signal,
  }) as Promise<CashSession>
}
