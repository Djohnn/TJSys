import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import { fetchMovements } from './inventoryApi'
import type { PaginatedResponse } from './inventoryApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'

const TYPE_LABELS: Record<string, string> = {
  in: 'Entrada',
  out: 'Saída',
  transfer: 'Transferência',
  adjust: 'Ajuste',
}

const TYPE_COLORS: Record<string, string> = {
  in: '#0a0',
  out: '#c00',
  transfer: '#06c',
  adjust: '#c60',
}

export default function MovementsPage() {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''
  const [searchParams, setSearchParams] = useSearchParams()

  const page = Number(searchParams.get('page')) || 1
  const dateFrom = searchParams.get('date_from') || ''
  const dateTo = searchParams.get('date_to') || ''
  const typeFilter = searchParams.get('type') || ''
  const branchFilter = searchParams.get('branch') || ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['movements', tenantId, page, dateFrom, dateTo, typeFilter, branchFilter],
    queryFn: ({ signal }) =>
      fetchMovements(
        tenantId,
        {
          page,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          type: typeFilter || undefined,
          branch: branchFilter || undefined,
        },
        signal,
      ),
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

  if (isLoading) return <LoadingState message="Carregando movimentações..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar movimentações.</p>

  const movements = data?.results ?? []
  const branches = branchesData?.results ?? []
  const totalPages = data ? Math.ceil(data.count / 25) : 1

  return (
    <div data-testid="movements-page">
      <h2>Movimentações de Estoque</h2>

      <div data-testid="movements-filters">
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
          value={typeFilter}
          onChange={(e) => setFilter('type', e.target.value)}
          aria-label="Filtrar por tipo"
        >
          <option value="">Todos os tipos</option>
          <option value="in">Entrada</option>
          <option value="out">Saída</option>
          <option value="transfer">Transferência</option>
          <option value="adjust">Ajuste</option>
        </select>
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

      {movements.length === 0 && (
        <EmptyState title="Nenhuma movimentação encontrada" description="Nenhuma movimentação registrada." />
      )}

      {movements.length > 0 && (
        <table data-testid="movements-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Produto</th>
              <th>Tipo</th>
              <th>Qtd</th>
              <th>Motivo</th>
              <th>Criado por</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((mov) => (
              <tr key={mov.id} data-testid="movement-row">
                <td>{new Date(mov.created_at).toLocaleString('pt-BR')}</td>
                <td>{mov.product_name}</td>
                <td>
                  <span
                    data-testid="movement-type-badge"
                    style={{
                      color: '#fff',
                      backgroundColor: TYPE_COLORS[mov.type] ?? '#666',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '0.85em',
                    }}
                  >
                    {TYPE_LABELS[mov.type] ?? mov.type}
                  </span>
                </td>
                <td>{mov.quantity}</td>
                <td>{mov.reason}</td>
                <td>{mov.created_by_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {totalPages > 1 && (
        <nav aria-label="Paginação">
          <button disabled={page <= 1} onClick={() => setFilter('page', String(page - 1))} type="button">
            Anterior
          </button>
          <span>Página {page} de {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setFilter('page', String(page + 1))} type="button">
            Próxima
          </button>
        </nav>
      )}
    </div>
  )
}
