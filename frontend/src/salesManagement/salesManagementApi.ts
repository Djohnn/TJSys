import { apiRequest } from '@/api/client'
import { isApiProblemError } from '@/api/problem'

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
  unit_precision?: number
}

export interface SalePayment {
  id: string
  method: string
  method_name: string
  amount: string
  status: string
  status_label: string
}

export type RefundMethod = 'cash' | 'pix' | 'card_external'

export function normalizeRefundMethod(method: string | undefined): RefundMethod | null {
  switch (method?.trim().toLowerCase()) {
    case 'cash':
      return 'cash'
    case 'pix':
      return 'pix'
    case 'card':
    case 'card_external':
    case 'card_integrated':
    case 'card_debit':
    case 'card_credit':
      return 'card_external'
    default:
      return null
  }
}

export function getDefaultRefundMethod(payments: SalePayment[]): RefundMethod {
  for (const payment of payments) {
    const method = normalizeRefundMethod(payment.method)
    if (method) return method
  }
  return 'cash'
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
  refundable_balance: string
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

interface CanonicalSaleItem extends Partial<SaleItem> {
  product?: string
  line_total?: string
  unit_precision?: number
}

interface CanonicalSalePayment extends Partial<SalePayment> {
  method?: string
  amount?: string
}

interface CanonicalSale extends Omit<Partial<Sale>, 'items' | 'payments'> {
  gross_total?: string
  net_total?: string
  refundable_balance?: string
  items?: CanonicalSaleItem[]
  payments?: CanonicalSalePayment[]
}

function normalizeSale(raw: CanonicalSale): Sale {
  const status = raw.status === 'confirmed' ? 'completed' : (raw.status ?? '')
  return {
    id: raw.id ?? '',
    created_at: raw.created_at ?? '',
    customer: raw.customer ?? '',
    customer_name: raw.customer_name ?? 'Consumidor não identificado',
    operator: raw.operator ?? '',
    operator_name: raw.operator_name ?? raw.operator ?? '-',
    branch: raw.branch ?? '',
    branch_name: raw.branch_name ?? raw.branch ?? '-',
    device: raw.device ?? '',
    device_name: raw.device_name ?? '-',
    total: raw.total ?? raw.net_total ?? raw.gross_total ?? '0.00',
    refundable_balance:
      raw.refundable_balance ?? raw.net_total ?? raw.total ?? raw.gross_total ?? '0.00',
    status,
    status_label:
      raw.status_label ?? (status === 'completed' ? 'Concluída' : status),
    items: (raw.items ?? []).map((item) => ({
      id: item.id ?? '',
      product: item.product ?? '',
      product_name:
        item.product_name ??
        (item.product
          ? `Produto ${item.product}`
          : 'Produto sem identificação'),
      quantity: item.quantity ?? '0',
      unit_price: item.unit_price ?? '0.00',
      total: item.total ?? item.line_total ?? '0.00',
      unit_precision: item.unit_precision ?? 6,
    })),
    payments: (raw.payments ?? []).map((payment) => ({
      id: payment.id ?? '',
      method: payment.method ?? '',
      method_name:
        payment.method_name ??
        (
          {
            cash: 'Dinheiro',
            pix: 'PIX',
            card_external: 'Cartão externo',
          } as Record<string, string>
        )[payment.method ?? ''] ??
        payment.method ??
        'Método não informado',
      amount: payment.amount ?? '0.00',
      status: payment.status ?? 'completed',
      status_label: payment.status_label ?? 'Concluído',
    })),
    linked_stock_movement: raw.linked_stock_movement ?? null,
    linked_fiscal_document: raw.linked_fiscal_document ?? null,
    linked_financial_entries: raw.linked_financial_entries ?? [],
  }
}

function buildSearchParams(
  params: Record<string, string | number | undefined>,
): string {
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
  const qs = buildSearchParams(
    query as Record<string, string | number | undefined>,
  )
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
  return (
    apiRequest<CanonicalSale>(`/sales/${id}/`, {
      tenantId,
      signal,
    }) as Promise<CanonicalSale>
  ).then(normalizeSale)
}

export function getSaleQueryErrorMessage(error: unknown): string {
  if (isApiProblemError(error)) {
    if (error.problem.status === 404) {
      return 'Venda não encontrada ou não está disponível neste tenant.'
    }
    return (
      error.problem.detail || 'Não foi possível carregar os dados da venda.'
    )
  }
  return 'Não foi possível carregar os dados da venda.'
}

export function fetchCashSessions(
  tenantId: string,
  query: CashSessionsQuery,
  signal?: AbortSignal,
): Promise<PaginatedResponse<CashSession>> {
  const qs = buildSearchParams(
    query as Record<string, string | number | undefined>,
  )
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

// =============================================================================
// F3 — Quotes
// =============================================================================

export interface QuoteItem {
  id: string
  product: string
  product_name: string
  product_sku: string
  quantity: string
  unit_price: string
  discount: string
  notes: string
}

export interface Quote {
  id: string
  branch: string
  branch_name: string
  customer: string | null
  customer_name: string
  operator: string
  operator_name: string
  status: string
  quote_number: string
  valid_until: string | null
  notes: string
  gross_total: string
  discount_total: string
  net_total: string
  converted_sale: string | null
  items: QuoteItem[]
  created_at: string
  updated_at: string
}

export function fetchQuotes(
  tenantId: string,
  params: { page?: number; q?: string } = {},
  signal?: AbortSignal,
): Promise<PaginatedResponse<Quote>> {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  if (params.q) searchParams.set('q', params.q)
  const qs = searchParams.toString()
  return apiRequest<PaginatedResponse<Quote>>(`/sales/quotes/${qs ? `?${qs}` : ''}`, {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<Quote>>
}

export function fetchQuote(
  tenantId: string,
  id: string,
  signal?: AbortSignal,
): Promise<Quote> {
  return apiRequest<Quote>(`/sales/quotes/${id}/`, {
    tenantId,
    signal,
  }) as Promise<Quote>
}

export function convertQuoteToSale(
  tenantId: string,
  quoteId: string,
): Promise<unknown> {
  return apiRequest<unknown>(`/sales/quotes/${quoteId}/convert/`, {
    method: 'POST',
    tenantId,
  }) as Promise<unknown>
}

// =============================================================================
// F3 — Sales Orders
// =============================================================================

export interface SalesOrderItem {
  id: string
  product: string
  product_name: string
  product_sku: string
  quantity: string
  unit_price: string
  discount: string
  notes: string
}

export interface SalesOrder {
  id: string
  branch: string
  branch_name: string
  customer: string | null
  customer_name: string
  operator: string
  operator_name: string
  quote: string | null
  quote_number: string
  status: string
  order_number: string
  expected_date: string | null
  notes: string
  gross_total: string
  discount_total: string
  net_total: string
  converted_sale: string | null
  items: SalesOrderItem[]
  created_at: string
  updated_at: string
}

export function fetchSalesOrders(
  tenantId: string,
  params: { page?: number; q?: string } = {},
  signal?: AbortSignal,
): Promise<PaginatedResponse<SalesOrder>> {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  if (params.q) searchParams.set('q', params.q)
  const qs = searchParams.toString()
  return apiRequest<PaginatedResponse<SalesOrder>>(`/sales/sales-orders/${qs ? `?${qs}` : ''}`, {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<SalesOrder>>
}

export function fetchSalesOrder(
  tenantId: string,
  id: string,
  signal?: AbortSignal,
): Promise<SalesOrder> {
  return apiRequest<SalesOrder>(`/sales/sales-orders/${id}/`, {
    tenantId,
    signal,
  }) as Promise<SalesOrder>
}

export function convertOrderToSale(
  tenantId: string,
  orderId: string,
): Promise<unknown> {
  return apiRequest<unknown>(`/sales/sales-orders/${orderId}/convert/`, {
    method: 'POST',
    tenantId,
  }) as Promise<unknown>
}
