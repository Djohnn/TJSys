import { apiRequest } from '@/api/client'

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface DRELine {
  label: string
  value: string
  percentage?: string
  children?: DRELine[]
}

export interface DREReport {
  period_from: string
  period_to: string
  branch?: { id: string; name: string } | null
  revenue: DRELine
  deductions: DRELine
  net_revenue: DRELine
  cost_of_goods: DRELine
  gross_profit: DRELine
  operating_expenses: DRELine
  operating_result: DRELine
  result_before_tax: DRELine
  income_tax: DRELine
  net_result: DRELine
}

export interface DREParams {
  date_from: string
  date_to: string
  branch?: string
}

export async function fetchDREReport(
  tenantId: string,
  params: DREParams,
  signal?: AbortSignal,
): Promise<DREReport> {
  const searchParams = new URLSearchParams()
  searchParams.set('date_from', params.date_from)
  searchParams.set('date_to', params.date_to)
  if (params.branch) searchParams.set('branch', params.branch)

  return apiRequest<DREReport>(
    `/financial/reports/dre/?${searchParams.toString()}`,
    { tenantId, signal },
  ) as Promise<DREReport>
}

export interface SalesReport {
  count: number
  net_total: string
  by_status: { status: string; count: number; total: string }[]
  by_payment_method: { payment_method: string; count: number; total: string }[]
  by_day: { day: string; count: number; total: string }[]
}

export interface SalesReportParams {
  date_from: string
  date_to: string
  branch?: string
}

export async function fetchSalesReport(
  tenantId: string,
  params: SalesReportParams,
  signal?: AbortSignal,
): Promise<SalesReport> {
  const searchParams = new URLSearchParams()
  searchParams.set('date_from', params.date_from)
  searchParams.set('date_to', params.date_to)
  if (params.branch) searchParams.set('branch', params.branch)

  return apiRequest<SalesReport>(
    `/financial/reports/sales/?${searchParams.toString()}`,
    { tenantId, signal },
  ) as Promise<SalesReport>
}

export interface InventoryReportItem {
  product_id: string
  sku: string
  product_name: string
  location_id: string
  location_name: string
  quantity: number
  reserved: number
  available: number
  critical: boolean
}

export interface InventoryReportSummary {
  total_products: number
  total_quantity: number
  total_reserved: number
  total_available: number
  critical_items: number
}

export interface InventoryReport {
  items: InventoryReportItem[]
  summary: InventoryReportSummary
}

export interface InventoryReportParams {
  branch?: string
}

export async function fetchInventoryReport(
  tenantId: string,
  params: InventoryReportParams = {},
  signal?: AbortSignal,
): Promise<InventoryReport> {
  const searchParams = new URLSearchParams()
  if (params.branch) searchParams.set('branch', params.branch)

  const qs = searchParams.toString()
  return apiRequest<InventoryReport>(
    `/financial/reports/inventory/${qs ? `?${qs}` : ''}`,
    { tenantId, signal },
  ) as Promise<InventoryReport>
}

export interface FinancialReportItem {
  id: string
  description: string
  amount: string
  status: string
  due_date: string | null
}

export interface FinancialReport {
  payables: FinancialReportItem[]
  receivables: FinancialReportItem[]
}

export async function fetchFinancialReport(
  tenantId: string,
  signal?: AbortSignal,
): Promise<FinancialReport> {
  return apiRequest<FinancialReport>(
    '/financial/reports/financial/',
    { tenantId, signal },
  ) as Promise<FinancialReport>
}

export interface CashflowReport {
  projections: { date: string; amount: string }[]
}

export interface CashflowReportParams {
  date_from: string
  date_to: string
  branch?: string
}

export async function fetchCashflowReport(
  tenantId: string,
  params: CashflowReportParams,
  signal?: AbortSignal,
): Promise<CashflowReport> {
  const searchParams = new URLSearchParams()
  searchParams.set('date_from', params.date_from)
  searchParams.set('date_to', params.date_to)
  if (params.branch) searchParams.set('branch', params.branch)

  return apiRequest<CashflowReport>(
    `/financial/reports/cashflow/?${searchParams.toString()}`,
    { tenantId, signal },
  ) as Promise<CashflowReport>
}
