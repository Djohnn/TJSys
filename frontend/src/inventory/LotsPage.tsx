import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import { fetchLots } from './inventoryApi'
import type { PaginatedResponse } from './inventoryApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { formatQuantity } from '@/components/formatQuantity'

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
    <div data-testid="lots-page" className="p-6 space-y-6">
      <h2 className="text-2xl font-bold text-neutral-900">Lotes</h2>

      <Card>
        <div data-testid="lots-filters" className="flex flex-wrap gap-3">
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
            type="date"
            value={expiringBefore}
            onChange={(e) => setFilter('expiring_before', e.target.value)}
            aria-label="Vencimento até"
            className="w-full px-3 py-2 border border-border rounded-lg text-sm"
          />
        </div>
      </Card>

      {lots.length === 0 && (
        <EmptyState title="Nenhum lote encontrado" description="Nenhum lote registrado." />
      )}

      {lots.length > 0 && (
        <Card>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="lots-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Produto</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Lote</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Vencimento</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Qtd</th>
                </tr>
              </thead>
              <tbody>
                {lots.map((lot) => (
                  <tr key={lot.id} data-testid="lot-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-3 text-neutral-700">{lot.product_name}</td>
                    <td className="px-4 py-3 text-neutral-700">{lot.lot_number}</td>
                    <td className="px-4 py-3 text-neutral-700">{lot.expiry_date ? new Date(lot.expiry_date).toLocaleDateString('pt-BR') : '-'}</td>
                    <td className="px-4 py-3 text-neutral-700">{formatQuantity(lot.quantity, { precision: lot.unit_precision, symbol: lot.unit_symbol })}</td>
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
