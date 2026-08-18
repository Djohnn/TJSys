import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import { isApiProblemError } from '@/api/problem'
import type { PaginatedResponse } from './catalogApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

export interface PriceListItem {
  id: string
  product: string
  product_name: string
  product_sku: string
  price: string
  min_quantity: string
  max_quantity: string | null
  discount_percentage: string
}

export interface PriceList {
  id: string
  name: string
  description: string
  audience: string
  is_default: boolean
  is_active: boolean
  valid_from: string | null
  valid_until: string | null
  priority: number
  items: PriceListItem[]
  created_at: string
  updated_at: string
}

const AUDIENCE_LABELS: Record<string, string> = {
  retail: 'Varejo',
  wholesale: 'Atacado',
  vip: 'VIP',
  partner: 'Parceiro',
  custom: 'Personalizado',
}

const AUDIENCE_VARIANTS: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  retail: 'neutral',
  wholesale: 'warning',
  vip: 'success',
  partner: 'success',
  custom: 'neutral',
}

export default function PriceListsPage() {
  const { selectedTenant } = useTenant()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const tenantId = selectedTenant?.tenant_id ?? ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['price-lists', tenantId, page, q],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<PriceList>>(`/sales/price-lists/?page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}`, {
        tenantId,
        signal,
      }) as Promise<PaginatedResponse<PriceList>>,
    enabled: !!tenantId,
  })

  if (isLoading) return <LoadingState message="Carregando listas de preço..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar listas de preço.</p>

  const priceLists = data?.results ?? []
  const totalPages = data ? Math.ceil(data.count / 25) : 1

  return (
    <div data-testid="price-lists-page" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neutral-900">Listas de Preço</h2>
      </div>

      {priceLists.length > 0 && (
        <div className="flex gap-2">
          <input
            type="search"
            placeholder="Buscar por nome..."
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1) }}
            className="w-full max-w-xs px-3 py-2 border border-border rounded-lg text-sm"
            data-testid="pricelist-search-input"
          />
        </div>
      )}

      {priceLists.length === 0 && (
        <EmptyState
          title="Nenhuma lista de preço"
          description="Crie uma lista de preço para começar."
        />
      )}

      {priceLists.length > 0 && (
        <Card>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="price-lists-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Nome</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Público</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Prioridade</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Validade</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Itens</th>
                </tr>
              </thead>
              <tbody>
                {priceLists.map((priceList) => (
                  <tr key={priceList.id} data-testid="pricelist-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-3 text-neutral-700 font-medium">{priceList.name}</td>
                    <td className="px-4 py-3">
                      <Badge variant={AUDIENCE_VARIANTS[priceList.audience] || 'neutral'}>
                        {AUDIENCE_LABELS[priceList.audience] || priceList.audience}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={priceList.is_active ? 'success' : 'danger'}>
                        {priceList.is_active ? 'Ativa' : 'Inativa'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{priceList.priority}</td>
                    <td className="px-4 py-3 text-neutral-700">
                      {priceList.valid_from && priceList.valid_until
                        ? `${priceList.valid_from} até ${priceList.valid_until}`
                        : 'Sem validade'}
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{priceList.items?.length || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {totalPages > 1 && (
        <nav aria-label="Paginação" className="flex items-center justify-center gap-3">
          <Button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} variant="secondary" size="sm">Anterior</Button>
          <span className="text-sm text-neutral-600">Página {page} de {totalPages}</span>
          <Button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} variant="secondary" size="sm">Próxima</Button>
        </nav>
      )}
    </div>
  )
}
