import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import Decimal from 'decimal.js'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import { fetchPayables } from './financialApi'
import type { PaginatedResponse, Payable } from './financialApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import SettlementDialog from './SettlementDialog'

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  paid: 'Pago',
  overdue: 'Vencido',
  cancelled: 'Cancelado',
}

function getStatusStyle(status: string): React.CSSProperties {
  switch (status) {
    case 'overdue': return { color: '#dc2626' }
    case 'pending': return { color: '#ca8a04' }
    case 'paid': return { color: '#16a34a' }
    case 'cancelled': return { color: '#6b7280' }
    default: return {}
  }
}

function formatCurrency(value: string): string {
  try {
    return new Decimal(value).toFixed(2)
  } catch {
    return value
  }
}

export default function PayablesPage() {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''
  const [searchParams, setSearchParams] = useSearchParams()

  const page = Number(searchParams.get('page')) || 1
  const statusFilter = searchParams.get('status') || ''
  const dateFrom = searchParams.get('date_from') || ''
  const dateTo = searchParams.get('date_to') || ''
  const branchFilter = searchParams.get('branch') || ''
  const accountFilter = searchParams.get('account') || ''

  const [settleTarget, setSettleTarget] = useState<Payable | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['payables', tenantId, page, statusFilter, dateFrom, dateTo, branchFilter, accountFilter],
    queryFn: ({ signal }) =>
      fetchPayables(tenantId, {
        page,
        status: statusFilter || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        branch: branchFilter || undefined,
        account: accountFilter || undefined,
      }, signal),
    enabled: !!tenantId,
  })

  const { data: branchesData } = useQuery({
    queryKey: ['branches', tenantId, 1],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<{ id: string; name: string }>>('/branches/', {
        tenantId,
        signal,
      }) as Promise<PaginatedResponse<{ id: string; name: string }>>,
    enabled: !!tenantId,
  })

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams)
    if (value) {
      next.set(key, value)
    } else {
      next.delete(key)
    }
    next.set('page', '1')
    setSearchParams(next)
  }

  if (isLoading) return <LoadingState message="Carregando contas a pagar..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar contas a pagar.</p>

  const payables = data?.results ?? []
  const branches = branchesData?.results ?? []
  const totalPages = data ? Math.ceil(data.count / 25) : 1

  return (
    <div data-testid="payables-page">
      <h2>Contas a Pagar</h2>

      <div data-testid="payables-filters">
        <select
          value={statusFilter}
          onChange={(e) => setFilter('status', e.target.value)}
          aria-label="Filtrar por status"
        >
          <option value="">Todos os status</option>
          <option value="pending">Pendente</option>
          <option value="paid">Pago</option>
          <option value="overdue">Vencido</option>
          <option value="cancelled">Cancelado</option>
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setFilter('date_from', e.target.value)}
          aria-label="Data inicial"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setFilter('date_to', e.target.value)}
          aria-label="Data final"
        />
        <select
          value={branchFilter}
          onChange={(e) => setFilter('branch', e.target.value)}
          aria-label="Filtrar por filial"
        >
          <option value="">Todas as filiais</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>

      {payables.length === 0 && (
        <EmptyState title="Nenhuma conta a pagar encontrada" description="Nenhuma conta a pagar registrada." />
      )}

      {payables.length > 0 && (
        <table data-testid="payables-table">
          <thead>
            <tr>
              <th>Descrição</th>
              <th>Vencimento</th>
              <th>Valor</th>
              <th>Pago</th>
              <th>Saldo</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {payables.map((pay) => (
              <tr key={pay.id} data-testid="payable-row">
                <td>{pay.description}{pay.source_operation ? ` (${pay.source_operation_type ?? '#'}${pay.source_operation})` : ''}</td>
                <td>{new Date(pay.due_date).toLocaleDateString('pt-BR')}</td>
                <td>R$ {formatCurrency(pay.amount)}</td>
                <td>R$ {formatCurrency(pay.paid_amount)}</td>
                <td>R$ {formatCurrency(pay.balance)}</td>
                <td><span data-testid={`status-badge-${pay.status}`} style={getStatusStyle(pay.status)}>{STATUS_LABELS[pay.status] ?? pay.status}</span></td>
                <td>
                  {pay.status !== 'paid' && pay.status !== 'cancelled' && (
                    <button onClick={() => setSettleTarget(pay)} type="button">
                      Pagar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {totalPages > 1 && (
        <nav aria-label="Paginação">
          <button disabled={page <= 1} onClick={() => { const next = new URLSearchParams(searchParams); next.set('page', String(page - 1)); setSearchParams(next) }} type="button">
            Anterior
          </button>
          <span>Página {page} de {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => { const next = new URLSearchParams(searchParams); next.set('page', String(page + 1)); setSearchParams(next) }} type="button">
            Próxima
          </button>
        </nav>
      )}

      {settleTarget && (
        <SettlementDialog
          type="payable"
          target={settleTarget}
          onClose={() => setSettleTarget(null)}
        />
      )}
    </div>
  )
}
