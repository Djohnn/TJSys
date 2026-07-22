import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import { fetchBalances } from './inventoryApi'
import type { PaginatedResponse } from './inventoryApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'

export default function BalancesPage() {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''
  const [searchParams, setSearchParams] = useSearchParams()

  const page = Number(searchParams.get('page')) || 1
  const branchFilter = searchParams.get('branch') || ''
  const productFilter = searchParams.get('product') || ''
  const locationFilter = searchParams.get('location') || ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['balances', tenantId, page, branchFilter, productFilter, locationFilter],
    queryFn: ({ signal }) =>
      fetchBalances(
        tenantId,
        { page, branch: branchFilter || undefined, product: productFilter || undefined, location: locationFilter || undefined },
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

  if (isLoading) return <LoadingState message="Carregando saldos..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar saldos.</p>

  const balances = data?.results ?? []
  const branches = branchesData?.results ?? []
  const totalPages = data ? Math.ceil(data.count / 25) : 1

  return (
    <div data-testid="balances-page">
      <h2>Saldos de Estoque</h2>

      <div data-testid="balances-filters">
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
          type="text"
          value={locationFilter}
          onChange={(e) => setFilter('location', e.target.value)}
          placeholder="Filtrar localização..."
          aria-label="Filtrar localização"
        />
      </div>

      {balances.length === 0 && (
        <EmptyState title="Nenhum saldo encontrado" description="Nenhum produto com saldo no estoque." />
      )}

      {balances.length > 0 && (
        <table data-testid="balances-table">
          <thead>
            <tr>
              <th>Produto</th>
              <th>SKU</th>
              <th>Filial</th>
              <th>Localização</th>
              <th>Qtd</th>
              <th>Un</th>
              <th>Última atualização</th>
            </tr>
          </thead>
          <tbody>
            {balances.map((bal) => (
              <tr key={bal.id} data-testid="balance-row">
                <td>{bal.product_name}</td>
                <td>{bal.product_sku}</td>
                <td>{bal.branch_name}</td>
                <td>{bal.location_name}</td>
                <td>{bal.quantity}</td>
                <td>{bal.unit_name}</td>
                <td>{new Date(bal.updated_at).toLocaleString('pt-BR')}</td>
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
