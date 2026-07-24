import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import { fetchBalances } from './inventoryApi'
import type { PaginatedResponse } from './inventoryApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

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
    <div data-testid="balances-page" className="p-6 space-y-6">
      <h2 className="text-2xl font-bold text-neutral-900">Saldos de Estoque</h2>

      <Card>
        <div data-testid="balances-filters" className="flex flex-wrap gap-3">
          <select
            value={branchFilter}
            onChange={(e) => setFilter('branch', e.target.value)}
            aria-label="Filtrar por filial"
            className="w-full px-3 py-2 border border-border rounded-lg text-sm"
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
            className="w-full px-3 py-2 border border-border rounded-lg text-sm"
          />
          <input
            type="text"
            value={locationFilter}
            onChange={(e) => setFilter('location', e.target.value)}
            placeholder="Filtrar localização..."
            aria-label="Filtrar localização"
            className="w-full px-3 py-2 border border-border rounded-lg text-sm"
          />
        </div>
      </Card>

      {balances.length === 0 && (
        <EmptyState title="Nenhum saldo encontrado" description="Nenhum produto com saldo no estoque." />
      )}

      {balances.length > 0 && (
        <Card>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="balances-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Produto</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">SKU</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Filial</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Localização</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Qtd</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Un</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Última atualização</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((bal) => (
                  <tr key={bal.id} data-testid="balance-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-3 text-neutral-700">{bal.product_name}</td>
                    <td className="px-4 py-3 text-neutral-700">{bal.product_sku}</td>
                    <td className="px-4 py-3 text-neutral-700">{bal.branch_name}</td>
                    <td className="px-4 py-3 text-neutral-700">{bal.location_name}</td>
                    <td className="px-4 py-3 text-neutral-700">{bal.quantity}</td>
                    <td className="px-4 py-3 text-neutral-700">{bal.unit_name}</td>
                    <td className="px-4 py-3 text-neutral-700">{new Date(bal.updated_at).toLocaleString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {totalPages > 1 && (
        <nav aria-label="Paginação" className="flex items-center justify-center gap-3">
          <Button disabled={page <= 1} onClick={() => setFilter('page', String(page - 1))} variant="secondary" size="sm">Anterior</Button>
          <span className="text-sm text-neutral-600">Página {page} de {totalPages}</span>
          <Button disabled={page >= totalPages} onClick={() => setFilter('page', String(page + 1))} variant="secondary" size="sm">Próxima</Button>
        </nav>
      )}
    </div>
  )
}
