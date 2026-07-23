import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import { fetchLots } from './inventoryApi'
import type { PaginatedResponse } from './inventoryApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'

export default function LotsPage() {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''
  const [searchParams, setSearchParams] = useSearchParams()

  const page = Number(searchParams.get('page')) || 1
  const branchFilter = searchParams.get('branch') || ''
  const productFilter = searchParams.get('product') || ''
  const expiringBefore = searchParams.get('expiring_before') || ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['lots', tenantId, page, branchFilter, productFilter, expiringBefore],
    queryFn: ({ signal }) =>
      fetchLots(
        tenantId,
        {
          page,
          branch: branchFilter || undefined,
          product: productFilter || undefined,
          expiring_before: expiringBefore || undefined,
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

  if (isLoading) return <LoadingState message="Carregando lotes..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar lotes.</p>

  const lots = data?.results ?? []
  const branches = branchesData?.results ?? []
  const totalPages = data ? Math.ceil(data.count / 25) : 1

  return (
    <div data-testid="lots-page">
      <h2>Lotes</h2>

      <div data-testid="lots-filters">
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
        <input
          type="text"
          value={productFilter}
          onChange={(e) => setFilter('product', e.target.value)}
          placeholder="Buscar produto..."
          aria-label="Buscar produto"
        />
        <input
          type="date"
          value={expiringBefore}
          onChange={(e) => setFilter('expiring_before', e.target.value)}
          aria-label="Vencimento até"
        />
      </div>

      {lots.length === 0 && (
        <EmptyState title="Nenhum lote encontrado" description="Nenhum lote registrado." />
      )}

      {lots.length > 0 && (
        <table data-testid="lots-table">
          <thead>
            <tr>
              <th>Produto</th>
              <th>Lote</th>
              <th>Vencimento</th>
              <th>Qtd</th>
            </tr>
          </thead>
          <tbody>
            {lots.map((lot) => (
              <tr key={lot.id} data-testid="lot-row">
                <td>{lot.product_name}</td>
                <td>{lot.lot_number}</td>
                <td>{lot.expiry_date ? new Date(lot.expiry_date).toLocaleDateString('pt-BR') : '-'}</td>
                <td>{lot.quantity}</td>
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
