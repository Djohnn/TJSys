import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'

export interface StockMapEntry {
  id: string
  product: {
    id: string
    sku: string
    name: string
  }
  location: {
    id: string
    code: string
    name: string
    branch: {
      id: string
      name: string
    }
  }
  lot: {
    id: string
    lot_number: string
  } | null
  quantity: string
  reserved: string
  available: string
}

export default function StockMapPage() {
  const { selectedTenant } = useTenant()
  const [locationFilter, setLocationFilter] = useState('')
  const [productFilter, setProductFilter] = useState('')
  const tenantId = selectedTenant?.tenant_id ?? ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['stock-map', tenantId, locationFilter, productFilter],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams()
      if (locationFilter) params.set('location', locationFilter)
      if (productFilter) params.set('product', productFilter)
      const qs = params.toString()
      return apiRequest<StockMapEntry[]>(`/inventory/stock-map/${qs ? `?${qs}` : ''}`, {
        tenantId,
        signal,
      }) as Promise<StockMapEntry[]>
    },
    enabled: !!tenantId,
  })

  if (isLoading) return <LoadingState message="Carregando mapa de estoque..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar mapa de estoque.</p>

  const entries = data ?? []

  const totalQuantity = entries.reduce((sum, e) => sum + parseFloat(e.quantity || '0'), 0)
  const totalReserved = entries.reduce((sum, e) => sum + parseFloat(e.reserved || '0'), 0)
  const totalAvailable = entries.reduce((sum, e) => sum + parseFloat(e.available || '0'), 0)

  return (
    <div data-testid="stock-map-page" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neutral-900">Mapa de Estoque</h2>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          value={locationFilter}
          onChange={(event) => setLocationFilter(event.target.value)}
          placeholder="Filtrar por local..."
          aria-label="Filtrar por local"
          className="w-full max-w-xs px-3 py-2 border border-border rounded-lg text-sm"
          data-testid="stock-map-location-filter"
        />
        <input
          type="search"
          value={productFilter}
          onChange={(event) => setProductFilter(event.target.value)}
          placeholder="Filtrar por produto..."
          aria-label="Filtrar por produto"
          className="w-full max-w-xs px-3 py-2 border border-border rounded-lg text-sm"
          data-testid="stock-map-product-filter"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="p-4">
            <p className="text-sm text-neutral-600">Total em Estoque</p>
            <p className="text-2xl font-bold text-neutral-900">{totalQuantity.toLocaleString('pt-BR')}</p>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <p className="text-sm text-neutral-600">Reservado</p>
            <p className="text-2xl font-bold text-warning">{totalReserved.toLocaleString('pt-BR')}</p>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <p className="text-sm text-neutral-600">Disponível</p>
            <p className="text-2xl font-bold text-success">{totalAvailable.toLocaleString('pt-BR')}</p>
          </div>
        </Card>
      </div>

      {entries.length === 0 && (
        <EmptyState
          title="Nenhum estoque encontrado"
          description="Ajuste os filtros ou cadastre produtos em estoque."
        />
      )}

      {entries.length > 0 && (
        <Card>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="stock-map-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">SKU</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Produto</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Local</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Filial</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Lote</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Qtd</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Reservado</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Disponível</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} data-testid="stock-map-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-3 text-neutral-700 font-medium">{entry.product.sku}</td>
                    <td className="px-4 py-3 text-neutral-700">{entry.product.name}</td>
                    <td className="px-4 py-3 text-neutral-700">{entry.location.name}</td>
                    <td className="px-4 py-3 text-neutral-700">{entry.location.branch.name}</td>
                    <td className="px-4 py-3">
                      {entry.lot ? (
                        <Badge variant="neutral">{entry.lot.lot_number}</Badge>
                      ) : (
                        <span className="text-neutral-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-700 font-medium">{entry.quantity}</td>
                    <td className="px-4 py-3 text-neutral-700">{entry.reserved}</td>
                    <td className="px-4 py-3">
                      <span className={`font-medium ${parseFloat(entry.available) > 0 ? 'text-success' : 'text-danger'}`}>
                        {entry.available}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
