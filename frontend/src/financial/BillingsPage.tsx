import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import Decimal from 'decimal.js'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import { fetchBillings } from './billingApi'
import type { PaginatedResponse } from './billingApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

const STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  pending: 'Pendente',
  issued: 'Emitido',
  paid: 'Pago',
  overdue: 'Vencido',
  cancelled: 'Cancelado',
}

const statusVariant: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  draft: 'info',
  pending: 'warning',
  issued: 'info',
  paid: 'success',
  overdue: 'danger',
  cancelled: 'neutral',
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Dinheiro',
  credit_card: 'Cartão de Crédito',
  debit_card: 'Cartão de Débito',
  bank_transfer: 'Transferência Bancária',
  boleto: 'Boleto',
  pix: 'PIX',
  other: 'Outro',
}

function formatCurrency(value: string): string {
  try {
    return new Decimal(value).toFixed(2)
  } catch {
    return value
  }
}

export default function BillingsPage() {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''
  const [searchParams, setSearchParams] = useSearchParams()

  const page = Number(searchParams.get('page')) || 1
  const statusFilter = searchParams.get('status') || ''
  const dateFrom = searchParams.get('date_from') || ''
  const dateTo = searchParams.get('date_to') || ''
  const branchFilter = searchParams.get('branch') || ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['billings', tenantId, page, statusFilter, dateFrom, dateTo, branchFilter],
    queryFn: ({ signal }) =>
      fetchBillings(tenantId, {
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

  if (isLoading) return <LoadingState message="Carregando faturamentos..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar faturamentos.</p>

  const billings = data?.results ?? []
  const branches = branchesData?.results ?? []
  const totalPages = data ? Math.ceil(data.count / 25) : 1

  return (
    <div data-testid="billings-page">
      <Card title="Faturamentos">
        <div data-testid="billings-filters" className="flex flex-wrap items-end gap-4 mb-6">
          <div>
            <label htmlFor="billing-status" className="block text-sm font-medium text-neutral-700 mb-1 sr-only">Status</label>
            <select
              id="billing-status"
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
            <label htmlFor="billing-branch" className="block text-sm font-medium text-neutral-700 mb-1 sr-only">Filial</label>
            <select
              id="billing-branch"
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
            <label htmlFor="billing-date-from" className="block text-sm font-medium text-neutral-700 mb-1 sr-only">Data Início</label>
            <input
              id="billing-date-from"
              type="date"
              value={dateFrom}
              onChange={e => setFilter('date_from', e.target.value)}
              className="block w-40 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label htmlFor="billing-date-to" className="block text-sm font-medium text-neutral-700 mb-1 sr-only">Data Fim</label>
            <input
              id="billing-date-to"
              type="date"
              value={dateTo}
              onChange={e => setFilter('date_to', e.target.value)}
              className="block w-40 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>

        {billings.length === 0 ? (
          <EmptyState title="Nenhum faturamento encontrado." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead>
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">Código</th>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">Cliente/Fornecedor</th>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">Status</th>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">Pagamento</th>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">Valor</th>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">Total</th>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">Vencimento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 bg-white">
                {billings.map(billing => (
                  <tr key={billing.id} className="hover:bg-neutral-50">
                    <td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-brand-600">{billing.code}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-neutral-700">
                      {billing.customer_name || billing.supplier_name || '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm">
                      <Badge variant={statusVariant[billing.status] ?? 'neutral'}>
                        {STATUS_LABELS[billing.status] ?? billing.status}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-neutral-700">
                      {PAYMENT_METHOD_LABELS[billing.payment_method] ?? billing.payment_method}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-neutral-700">
                      {formatCurrency(billing.amount)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-neutral-900">
                      {formatCurrency(billing.total_amount)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-neutral-700">
                      {billing.due_date ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-neutral-500">
            Total: {data?.count ?? 0} faturamentos
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
