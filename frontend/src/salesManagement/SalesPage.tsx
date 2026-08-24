import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'

import { useTenant } from '@/tenant/TenantProvider'
import { fetchSales } from './salesManagementApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'completed', label: 'Concluída' },
  { value: 'cancelled', label: 'Cancelada' },
  { value: 'refunded', label: 'Reembolsada' },
]

const statusVariant: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  completed: 'success',
  cancelled: 'danger',
  refunded: 'info',
}

export default function SalesPage() {
  const { selectedTenant } = useTenant()
  const [searchParams, setSearchParams] = useSearchParams()
  const tenantId = selectedTenant?.tenant_id ?? ''

  const page = Number(searchParams.get('page') ?? '1')
  const status = searchParams.get('status') ?? ''
  const dateFrom = searchParams.get('date_from') ?? ''
  const dateTo = searchParams.get('date_to') ?? ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['sales', tenantId, page, status, dateFrom, dateTo],
    queryFn: ({ signal }) =>
      fetchSales(tenantId, { page, status, date_from: dateFrom, date_to: dateTo }, signal),
    enabled: !!tenantId,
  })

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('page')
    setSearchParams(next)
  }

  if (isLoading) return <LoadingState message="Carregando vendas..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar vendas.</p>

  const sales = data?.results ?? []
  const totalPages = data ? Math.ceil(data.count / 25) : 1

  return (
    <div data-testid="sales-page">
      <Card title="Vendas">
        <div data-testid="sales-filters" className="flex flex-wrap items-end gap-4 mb-6">
          <div>
            <label htmlFor="filter-status" className="block text-sm font-medium text-neutral-700 mb-1">Status</label>
            <select
              id="filter-status"
              value={status}
              onChange={(e) => updateParam('status', e.target.value)}
              className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-date-from" className="block text-sm font-medium text-neutral-700 mb-1">De</label>
            <input
              id="filter-date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => updateParam('date_from', e.target.value)}
              className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="filter-date-to" className="block text-sm font-medium text-neutral-700 mb-1">Até</label>
            <input
              id="filter-date-to"
              type="date"
              value={dateTo}
              onChange={(e) => updateParam('date_to', e.target.value)}
              className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
        </div>

        {sales.length === 0 ? (
          <EmptyState title="Nenhuma venda" description="Nenhuma venda encontrada para os filtros selecionados." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="sales-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Data/Hora</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Cliente</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Operador</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Filial</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Total</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Ações</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id} data-testid="sale-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-3 text-neutral-700">{new Date(sale.created_at).toLocaleString('pt-BR')}</td>
                    <td className="px-4 py-3 text-neutral-700">{sale.customer_name}</td>
                    <td className="px-4 py-3 text-neutral-700">{sale.operator_name}</td>
                    <td className="px-4 py-3 text-neutral-700">{sale.branch_name}</td>
                    <td className="px-4 py-3 text-neutral-700">{sale.total}</td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariant[sale.status] ?? 'neutral'} testId={`status-badge-${sale.id}`}>{sale.status_label}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/app/sales/${sale.id}`} className="text-primary-600 hover:text-primary-700 font-medium text-sm">Detalhes</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <nav aria-label="Paginação" className="flex items-center justify-center gap-4 mt-6">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => updateParam('page', String(page - 1))} type="button">
              Anterior
            </Button>
            <span className="text-sm text-neutral-600">Página {page} de {totalPages}</span>
            <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => updateParam('page', String(page + 1))} type="button">
              Próxima
            </Button>
          </nav>
        )}
      </Card>
    </div>
  )
}
