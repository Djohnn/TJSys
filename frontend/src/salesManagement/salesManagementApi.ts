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
// F4 — Consignment
// =============================================================================

export interface ConsignmentItem {
  id: string
  product: string
  product_name: string
  product_sku: string
  quantity: string
  returned_quantity: string
  unit_price: string
  discount: string
  line_total: string
  notes: string
}

export interface Consignment {
  id: string
  branch: string
  branch_name: string
  customer: string
  customer_name: string
  operator: string
  operator_name: string
  status: string
  consignment_number: string
  expected_return_date: string | null
  actual_return_date: string | null
  notes: string
  gross_total: string
  discount_total: string
  net_total: string
  converted_sale: string | null
  items: ConsignmentItem[]
  created_at: string
  updated_at: string
}

export function fetchConsignments(
  tenantId: string,
  params: { page?: number; q?: string } = {},
  signal?: AbortSignal,
): Promise<PaginatedResponse<Consignment>> {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  if (params.q) searchParams.set('q', params.q)
  const qs = searchParams.toString()
  return apiRequest<PaginatedResponse<Consignment>>(`/sales/consignments/${qs ? `?${qs}` : ''}`, {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<Consignment>>
}

export function fetchConsignment(
  tenantId: string,
  id: string,
  signal?: AbortSignal,
): Promise<Consignment> {
  return apiRequest<Consignment>(`/sales/consignments/${id}/`, {
    tenantId,
    signal,
  }) as Promise<Consignment>
}

export function convertConsignmentToSale(
  tenantId: string,
  consignmentId: string,
): Promise<unknown> {
  return apiRequest<unknown>(`/sales/consignments/${consignmentId}/convert/`, {
    method: 'POST',
    tenantId,
  }) as Promise<unknown>
}

// =============================================================================
// F4 — Commission
// =============================================================================

export interface CommissionRule {
  id: string
  name: string
  description: string
  rule_type: string
  value: string
  min_sale_value: string
  max_sale_value: string | null
  product: string | null
  category: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Commission {
  id: string
  sale: string
  sale_number: string
  rule: string
  rule_name: string
  operator: string
  operator_name: string
  status: string
  sale_value: string
  commission_value: string
  notes: string
  approved_at: string | null
  paid_at: string | null
  created_at: string
  updated_at: string
}

export function fetchCommissionRules(
  tenantId: string,
  params: { page?: number; is_active?: boolean } = {},
  signal?: AbortSignal,
): Promise<PaginatedResponse<CommissionRule>> {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  if (params.is_active !== undefined) searchParams.set('is_active', String(params.is_active))
  const qs = searchParams.toString()
  return apiRequest<PaginatedResponse<CommissionRule>>(`/sales/commission-rules/${qs ? `?${qs}` : ''}`, {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<CommissionRule>>
}

export function fetchCommissions(
  tenantId: string,
  params: { page?: number; q?: string } = {},
  signal?: AbortSignal,
): Promise<PaginatedResponse<Commission>> {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  if (params.q) searchParams.set('q', params.q)
  const qs = searchParams.toString()
  return apiRequest<PaginatedResponse<Commission>>(`/sales/commissions/${qs ? `?${qs}` : ''}`, {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<Commission>>
}

export function approveCommission(
  tenantId: string,
  commissionId: string,
): Promise<unknown> {
  return apiRequest<unknown>(`/sales/commissions/${commissionId}/approve/`, {
    method: 'POST',
    tenantId,
  }) as Promise<unknown>
}

export function payCommission(
  tenantId: string,
  commissionId: string,
): Promise<unknown> {
  return apiRequest<unknown>(`/sales/commissions/${commissionId}/pay/`, {
    method: 'POST',
    tenantId,
  }) as Promise<unknown>
}

export function cancelCommission(
  tenantId: string,
  commissionId: string,
): Promise<unknown> {
  return apiRequest<unknown>(`/sales/commissions/${commissionId}/cancel/`, {
    method: 'POST',
    tenantId,
  }) as Promise<unknown>
}

// =============================================================================
// F4 — PriceList
// =============================================================================

export interface PriceListItem {
  id: string
  product: string
  product_name: string
  product_sku: string
  price: string
  min_quantity: string
  max_quantity: string | null
  discount_percentage: string
}

export interface PriceList {
  id: string
  name: string
  description: string
  audience: string
  is_default: boolean
  is_active: boolean
  valid_from: string | null
  valid_until: string | null
  priority: number
  items: PriceListItem[]
  created_at: string
  updated_at: string
}

export function fetchPriceLists(
  tenantId: string,
  params: { page?: number; q?: string; audience?: string } = {},
  signal?: AbortSignal,
): Promise<PaginatedResponse<PriceList>> {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  if (params.q) searchParams.set('q', params.q)
  if (params.audience) searchParams.set('audience', params.audience)
  const qs = searchParams.toString()
  return apiRequest<PaginatedResponse<PriceList>>(`/sales/price-lists/${qs ? `?${qs}` : ''}`, {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<PriceList>>
}

export function fetchPriceList(
  tenantId: string,
  id: string,
  signal?: AbortSignal,
): Promise<PriceList> {
  return apiRequest<PriceList>(`/sales/price-lists/${id}/`, {
    tenantId,
    signal,
  }) as Promise<PriceList>
}
