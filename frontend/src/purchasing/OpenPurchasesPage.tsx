import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import type { PaginatedResponse } from './catalogApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

export interface OpenPurchase {
  id: string
  supplier: string
  supplier_name: string
  branch: string
  branch_name: string
  status: string
  notes: string
  items_total: string
  created_at: string
  updated_at: string
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  approved: 'Aprovado',
  partially_received: 'Parcialmente Recebido',
}

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  draft: 'neutral',
  approved: 'warning',
  partially_received: 'warning',
}

export default function OpenPurchasesPage() {
  const { selectedTenant } = useTenant()
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const tenantId = selectedTenant?.tenant_id ?? ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['open-purchases', tenantId, page, q],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<OpenPurchase>>(`/purchasing/open-purchases/?page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}`, {
        tenantId,
        signal,
      }) as Promise<PaginatedResponse<OpenPurchase>>,
    enabled: !!tenantId,
  })

  if (isLoading) return <LoadingState message="Carregando compras em aberto..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar compras em aberto.</p>

  const purchases = data?.results ?? []
  const totalPages = data ? Math.ceil(data.count / 25) : 1

  return (
    <div data-testid="open-purchases-page" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neutral-900">Compras em Aberto</h2>
      </div>

      {purchases.length > 0 && (
        <div className="flex gap-2">
          <input
            type="search"
            placeholder="Buscar por fornecedor..."
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1) }}
            className="w-full max-w-xs px-3 py-2 border border-border rounded-lg text-sm"
            data-testid="openpurchase-search-input"
          />
        </div>
      )}

      {purchases.length === 0 && (
        <EmptyState
          title="Nenhuma compra em aberto"
          description="Todas as compras foram recebidas ou canceladas."
        />
      )}

      {purchases.length > 0 && (
        <Card>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="open-purchases-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Fornecedor</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Filial</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Valor Total</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Criado em</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((purchase) => (
                  <tr key={purchase.id} data-testid="openpurchase-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-3 text-neutral-700 font-medium">{purchase.supplier_name}</td>
                    <td className="px-4 py-3 text-neutral-700">{purchase.branch_name}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANTS[purchase.status] || 'neutral'}>
                        {STATUS_LABELS[purchase.status] || purchase.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-neutral-700 font-medium">
                      {parseFloat(purchase.items_total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{new Date(purchase.created_at).toLocaleDateString('pt-BR')}</td>
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
