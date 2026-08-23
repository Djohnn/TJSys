import { apiRequest } from '@/api/client'

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

// =============================================================================
// BankReconciliation
// =============================================================================

export interface BankReconciliation {
  id: string
  account: string
  account_name: string
  statement_date: string
  statement_balance: string
  system_balance: string
  difference: string
  status: string
  notes: string
  reconciled_by: string | null
  reconciled_by_name: string
  reconciled_at: string | null
  created_at: string
  updated_at: string
}

export function fetchBankReconciliations(
  tenantId: string,
  params: { page?: number; status?: string; account?: string } = {},
  signal?: AbortSignal,
): Promise<PaginatedResponse<BankReconciliation>> {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  if (params.status) searchParams.set('status', params.status)
  if (params.account) searchParams.set('account', params.account)
  const qs = searchParams.toString()
  return apiRequest<PaginatedResponse<BankReconciliation>>(`/financial/bank-reconciliations/${qs ? `?${qs}` : ''}`, {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<BankReconciliation>>
}

export function createBankReconciliation(
  tenantId: string,
  data: Partial<BankReconciliation>,
): Promise<BankReconciliation> {
  return apiRequest<BankReconciliation>('/financial/bank-reconciliations/', {
    tenantId,
    method: 'POST',
    body: JSON.stringify(data),
  }) as Promise<BankReconciliation>
}

export function matchBankReconciliation(
  tenantId: string,
  reconciliationId: string,
): Promise<BankReconciliation> {
  return apiRequest<BankReconciliation>(`/financial/bank-reconciliations/${reconciliationId}/match/`, {
    tenantId,
    method: 'POST',
  }) as Promise<BankReconciliation>
}

export function cancelBankReconciliation(
  tenantId: string,
  reconciliationId: string,
): Promise<BankReconciliation> {
  return apiRequest<BankReconciliation>(`/financial/bank-reconciliations/${reconciliationId}/cancel/`, {
    tenantId,
    method: 'POST',
  }) as Promise<BankReconciliation>
}

// =============================================================================
// FinancialStatement
// =============================================================================

export interface FinancialStatementTransaction {
  id: string
  effective_date: string
  description: string
  direction: string
  amount: string
  status: string
  balance: string
}

export interface FinancialStatement {
  account: {
    id: string
    name: string
    account_type: string
  }
  opening_balance: string
  closing_balance: string
  transactions: FinancialStatementTransaction[]
}

export function fetchFinancialStatement(
  tenantId: string,
  params: { account: string; date_from?: string; date_to?: string },
  signal?: AbortSignal,
): Promise<FinancialStatement> {
  const searchParams = new URLSearchParams()
  searchParams.set('account', params.account)
  if (params.date_from) searchParams.set('date_from', params.date_from)
  if (params.date_to) searchParams.set('date_to', params.date_to)
  const qs = searchParams.toString()
  return apiRequest<FinancialStatement>(`/financial/financial-statement/${qs ? `?${qs}` : ''}`, {
    tenantId,
    signal,
  }) as Promise<FinancialStatement>
}
