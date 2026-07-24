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
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  paid: 'Pago',
  overdue: 'Vencido',
  cancelled: 'Cancelado',
}

const statusVariant: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  pending: 'warning',
  paid: 'success',
  overdue: 'danger',
  cancelled: 'neutral',
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
      <Card title="Contas a Pagar">
        <div data-testid="payables-filters" className="flex flex-wrap items-end gap-4 mb-6">
          <div>
            <label htmlFor="pay-status" className="block text-sm font-medium text-neutral-700 mb-1 sr-only">Status</label>
            <select
              id="pay-status"
              value={statusFilter}
              onChange={(e) => setFilter('status', e.target.value)}
              aria-label="Filtrar por status"
              className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="">Todos os status</option>
              <option value="pending">Pendente</option>
              <option value="paid">Pago</option>
              <option value="overdue">Vencido</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </div>
          <div>
            <label htmlFor="pay-date-from" className="block text-sm font-medium text-neutral-700 mb-1 sr-only">Data inicial</label>
            <input
              id="pay-date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setFilter('date_from', e.target.value)}
              aria-label="Data inicial"
              className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="pay-date-to" className="block text-sm font-medium text-neutral-700 mb-1 sr-only">Data final</label>
            <input
              id="pay-date-to"
              type="date"
              value={dateTo}
              onChange={(e) => setFilter('date_to', e.target.value)}
              aria-label="Data final"
              className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="pay-branch" className="block text-sm font-medium text-neutral-700 mb-1 sr-only">Filial</label>
            <select
              id="pay-branch"
              value={branchFilter}
              onChange={(e) => setFilter('branch', e.target.value)}
              aria-label="Filtrar por filial"
              className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="">Todas as filiais</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        </div>

        {payables.length === 0 && (
          <EmptyState title="Nenhuma conta a pagar encontrada" description="Nenhuma conta a pagar registrada." />
        )}

        {payables.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="payables-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Descrição</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Vencimento</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Valor</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Pago</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Saldo</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Ações</th>
                </tr>
              </thead>
              <tbody>
                {payables.map((pay) => (
                  <tr key={pay.id} data-testid="payable-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-3 text-neutral-700">{pay.description}{pay.source_operation ? ` (${pay.source_operation_type ?? '#'}${pay.source_operation})` : ''}</td>
                    <td className="px-4 py-3 text-neutral-700">{new Date(pay.due_date).toLocaleDateString('pt-BR')}</td>
                    <td className="px-4 py-3 text-neutral-700">R$ {formatCurrency(pay.amount)}</td>
                    <td className="px-4 py-3 text-neutral-700">R$ {formatCurrency(pay.paid_amount)}</td>
                    <td className="px-4 py-3 text-neutral-700">R$ {formatCurrency(pay.balance)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariant[pay.status] ?? 'neutral'} testId={`status-badge-${pay.status}`}>
                        {STATUS_LABELS[pay.status] ?? pay.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {pay.status !== 'paid' && pay.status !== 'cancelled' && (
                        <Button variant="secondary" size="sm" onClick={() => setSettleTarget(pay)} type="button">
                          Pagar
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <nav aria-label="Paginação" className="flex items-center justify-center gap-4 mt-6">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => { const next = new URLSearchParams(searchParams); next.set('page', String(page - 1)); setSearchParams(next) }} type="button">
              Anterior
            </Button>
            <span className="text-sm text-neutral-600">Página {page} de {totalPages}</span>
            <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => { const next = new URLSearchParams(searchParams); next.set('page', String(page + 1)); setSearchParams(next) }} type="button">
              Próxima
            </Button>
          </nav>
        )}
      </Card>

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
