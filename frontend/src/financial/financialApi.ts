import { apiRequest } from '@/api/client'

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface Payable {
  id: string
  description: string
  due_date: string
  amount: string
  paid_amount: string
  balance: string
  status: 'pending' | 'paid' | 'overdue' | 'cancelled'
  branch: string | null
  branch_name: string | null
  account: string | null
  account_name: string | null
  source_operation: string | null
  source_operation_type: string | null
  created_at: string
}

export interface Receivable {
  id: string
  description: string
  due_date: string
  amount: string
  paid_amount: string
  balance: string
  status: 'pending' | 'paid' | 'overdue' | 'cancelled'
  branch: string | null
  branch_name: string | null
  account: string | null
  account_name: string | null
  source_operation: string | null
  source_operation_type: string | null
  created_at: string
}

export interface CashflowEntry {
  id: string
  date: string
  description: string
  inflow: string | null
  outflow: string | null
  balance: string
  branch: string | null
  branch_name: string | null
  created_at: string
}

export interface GeneratedReport {
  id: string
  type: string
  format: string
  period_start: string
  period_end: string
  status: string
  file_url: string | null
  created_at: string
}

export interface SettlementPayload {
  amount: string
  payment_method: string
  payment_date: string
  notes?: string
}

export interface ReportGeneratePayload {
  period_start: string
  period_end: string
  type: 'receivables' | 'payables' | 'cashflow' | 'trial_balance' | 'dre'
  format: 'PDF' | 'CSV'
}

export interface PayablesQuery {
  page?: number
  status?: string
  date_from?: string
  date_to?: string
  branch?: string
  account?: string
}

export interface ReceivablesQuery {
  page?: number
  status?: string
  date_from?: string
  date_to?: string
  branch?: string
  account?: string
}

export interface CashflowQuery {
  page?: number
  date_from?: string
  date_to?: string
  branch?: string
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

export function fetchPayables(
  tenantId: string,
  query: PayablesQuery,
  signal?: AbortSignal,
): Promise<PaginatedResponse<Payable>> {
  const qs = buildSearchParams(query as Record<string, string | number | undefined>)
  return apiRequest<PaginatedResponse<Payable>>(`/financial/payables/${qs}`, {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<Payable>>
}

export function fetchReceivables(
  tenantId: string,
  query: ReceivablesQuery,
  signal?: AbortSignal,
): Promise<PaginatedResponse<Receivable>> {
  const qs = buildSearchParams(query as Record<string, string | number | undefined>)
  return apiRequest<PaginatedResponse<Receivable>>(`/financial/receivables/${qs}`, {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<Receivable>>
}

export function fetchCashflow(
  tenantId: string,
  query: CashflowQuery,
  signal?: AbortSignal,
): Promise<PaginatedResponse<CashflowEntry>> {
  const qs = buildSearchParams(query as Record<string, string | number | undefined>)
  return apiRequest<PaginatedResponse<CashflowEntry>>(`/financial/cashflow/${qs}`, {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<CashflowEntry>>
}

export function settlePayable(
  tenantId: string,
  id: string,
  body: SettlementPayload,
  idempotencyKey: string,
): Promise<Payable> {
  const headers: Record<string, string> = {
    'Idempotency-Key': idempotencyKey,
  }
  return apiRequest<Payable>(`/financial/payables/${id}/settle/`, {
    method: 'POST',
    tenantId,
    body,
    headers,
  }) as Promise<Payable>
}

export function settleReceivable(
  tenantId: string,
  id: string,
  body: SettlementPayload,
  idempotencyKey: string,
): Promise<Receivable> {
  const headers: Record<string, string> = {
    'Idempotency-Key': idempotencyKey,
  }
  return apiRequest<Receivable>(`/financial/receivables/${id}/settle/`, {
    method: 'POST',
    tenantId,
    body,
    headers,
  }) as Promise<Receivable>
}

export function generateReport(
  tenantId: string,
  body: ReportGeneratePayload,
  idempotencyKey: string,
): Promise<GeneratedReport> {
  const headers: Record<string, string> = {
    'Idempotency-Key': idempotencyKey,
  }
  return apiRequest<GeneratedReport>('/financial/reports/', {
    method: 'POST',
    tenantId,
    body,
    headers,
  }) as Promise<GeneratedReport>
}

export function fetchReports(
  tenantId: string,
  signal?: AbortSignal,
): Promise<PaginatedResponse<GeneratedReport>> {
  return apiRequest<PaginatedResponse<GeneratedReport>>('/financial/reports/', {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<GeneratedReport>>
}
