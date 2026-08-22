import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import Decimal from 'decimal.js'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import { fetchFiscalCompensations } from './fiscalCompensationApi'
import type { PaginatedResponse } from './fiscalCompensationApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
  processed: 'Processado',
  cancelled: 'Cancelado',
}

const statusVariant: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  pending: 'warning',
  approved: 'info',
  rejected: 'danger',
  processed: 'success',
  cancelled: 'neutral',
}

const COMPENSATION_TYPE_LABELS: Record<string, string> = {
  credit: 'Crédito',
  debit: 'Débito',
  both: 'Ambos',
}

function formatCurrency(value: string): string {
  try {
    return new Decimal(value).toFixed(2)
  } catch {
    return value
  }
}

export default function FiscalCompensationsPage() {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''
  const [searchParams, setSearchParams] = useSearchParams()

  const page = Number(searchParams.get('page')) || 1
  const statusFilter = searchParams.get('status') || ''
  const dateFrom = searchParams.get('date_from') || ''
  const dateTo = searchParams.get('date_to') || ''
  const branchFilter = searchParams.get('branch') || ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['fiscalCompensations', tenantId, page, statusFilter, dateFrom, dateTo, branchFilter],
    queryFn: ({ signal }) =>
      fetchFiscalCompensations(tenantId, {
        page,
        status: statusFilter || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        branch: branchFilter || undefined,
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

  if (isLoading) return <LoadingState message="Carregando compensações fiscais..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar compensações fiscais.</p>

  const compensations = data?.results ?? []
  const branches = branchesData?.results ?? []
  const totalPages = data ? Math.ceil(data.count / 25) : 1

  return (
    <div data-testid="fiscal-compensations-page">
      <Card title="Compensações Fiscais">
        <div data-testid="fiscal-compensations-filters" className="flex flex-wrap items-end gap-4 mb-6">
          <div>
            <label htmlFor="comp-status" className="block text-sm font-medium text-neutral-700 mb-1 sr-only">Status</label>
            <select
              id="comp-status"
              value={statusFilter}
              onChange={e => setFilter('status', e.target.value)}
              className="block w-40 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="">Todos</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="comp-branch" className="block text-sm font-medium text-neutral-700 mb-1 sr-only">Filial</label>
            <select
              id="comp-branch"
              value={branchFilter}
              onChange={e => setFilter('branch', e.target.value)}
              className="block w-48 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="">Todas</option>
              {branches.map(branch => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="comp-date-from" className="block text-sm font-medium text-neutral-700 mb-1 sr-only">Data Início</label>
            <input
              id="comp-date-from"
              type="date"
              value={dateFrom}
              onChange={e => setFilter('date_from', e.target.value)}
              className="block w-40 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label htmlFor="comp-date-to" className="block text-sm font-medium text-neutral-700 mb-1 sr-only">Data Fim</label>
            <input
              id="comp-date-to"
              type="date"
              value={dateTo}
              onChange={e => setFilter('date_to', e.target.value)}
              className="block w-40 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>

        {compensations.length === 0 ? (
          <EmptyState title="Nenhuma compensação fiscal encontrada." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead>
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">Código</th>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">Cliente/Fornecedor</th>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">Status</th>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">Tipo</th>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">Valor</th>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">Compensado</th>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">Restante</th>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">Vencimento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 bg-white">
                {compensations.map(comp => (
                  <tr key={comp.id} className="hover:bg-neutral-50">
                    <td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-brand-600">{comp.code}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-neutral-700">
                      {comp.customer_name || comp.supplier_name || '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm">
                      <Badge variant={statusVariant[comp.status] ?? 'neutral'}>
                        {STATUS_LABELS[comp.status] ?? comp.status}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-neutral-700">
                      {COMPENSATION_TYPE_LABELS[comp.compensation_type] ?? comp.compensation_type}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-neutral-700">
                      {formatCurrency(comp.amount)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-neutral-700">
                      {formatCurrency(comp.compensated_amount)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-neutral-900">
                      {formatCurrency(comp.remaining_amount)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-neutral-700">
                      {comp.due_date ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-neutral-500">
            Total: {data?.count ?? 0} compensações
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setFilter('page', String(page - 1))}
            >
              Anterior
            </Button>
            <span className="flex items-center px-3 text-sm text-neutral-700">
              Página {page} de {totalPages}
            </span>
            <Button
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => setFilter('page', String(page + 1))}
            >
              Próxima
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
