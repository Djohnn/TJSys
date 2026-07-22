import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'

import { useTenant } from '@/tenant/TenantProvider'
import { fetchSales } from './salesManagementApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'completed', label: 'Concluída' },
  { value: 'cancelled', label: 'Cancelada' },
  { value: 'refunded', label: 'Reembolsada' },
]

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
      <h2>Vendas</h2>

      <div data-testid="sales-filters">
        <label htmlFor="filter-status">Status</label>
        <select
          id="filter-status"
          value={status}
          onChange={(e) => updateParam('status', e.target.value)}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <label htmlFor="filter-date-from">De</label>
        <input
          id="filter-date-from"
          type="date"
          value={dateFrom}
          onChange={(e) => updateParam('date_from', e.target.value)}
        />

        <label htmlFor="filter-date-to">Até</label>
        <input
          id="filter-date-to"
          type="date"
          value={dateTo}
          onChange={(e) => updateParam('date_to', e.target.value)}
        />
      </div>

      {sales.length === 0 ? (
        <EmptyState title="Nenhuma venda" description="Nenhuma venda encontrada para os filtros selecionados." />
      ) : (
        <table data-testid="sales-table">
          <thead>
            <tr>
              <th>Data/Hora</th>
              <th>Cliente</th>
              <th>Operador</th>
              <th>Filial</th>
              <th>Total</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((sale) => (
              <tr key={sale.id} data-testid="sale-row">
                <td>{new Date(sale.created_at).toLocaleString('pt-BR')}</td>
                <td>{sale.customer_name}</td>
                <td>{sale.operator_name}</td>
                <td>{sale.branch_name}</td>
                <td>{sale.total}</td>
                <td>
                  <span data-testid={`status-badge-${sale.id}`}>{sale.status_label}</span>
                </td>
                <td>
                  <Link to={`/sales/${sale.id}`}>Detalhes</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {totalPages > 1 && (
        <nav aria-label="Paginação">
          <button disabled={page <= 1} onClick={() => updateParam('page', String(page - 1))} type="button">
            Anterior
          </button>
          <span>Página {page} de {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => updateParam('page', String(page + 1))} type="button">
            Próxima
          </button>
        </nav>
      )}
    </div>
  )
}
