import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import type { PaginatedResponse } from './catalogApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

export interface InventoryCount {
  id: string
  location: string
  location_name: string
  status: string
  notes: string
  started_at: string | null
  completed_at: string | null
  counted_by: string | null
  counted_by_name: string
  created_at: string
  updated_at: string
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  in_progress: 'Em andamento',
  completed: 'Concluído',
  cancelled: 'Cancelado',
}

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  draft: 'neutral',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'danger',
}

export default function InventoryCountsPage() {
  const { selectedTenant } = useTenant()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const tenantId = selectedTenant?.tenant_id ?? ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['inventory-counts', tenantId, page, q],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<InventoryCount>>(`/inventory/inventory-counts/?page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}`, {
        tenantId,
        signal,
      }) as Promise<PaginatedResponse<InventoryCount>>,
    enabled: !!tenantId,
  })

  if (isLoading) return <LoadingState message="Carregando inventários..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar inventários.</p>

  const counts = data?.results ?? []
  const totalPages = data ? Math.ceil(data.count / 25) : 1

  return (
    <div data-testid="inventory-counts-page" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neutral-900">Inventário Contado</h2>
      </div>

      {counts.length > 0 && (
        <div className="flex gap-2">
          <input
            type="search"
            placeholder="Buscar por local..."
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1) }}
            className="w-full max-w-xs px-3 py-2 border border-border rounded-lg text-sm"
            data-testid="inventorycount-search-input"
          />
        </div>
      )}

      {counts.length === 0 && (
        <EmptyState
          title="Nenhum inventário"
          description="Crie um inventário para começar."
        />
      )}

      {counts.length > 0 && (
        <Card>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="inventory-counts-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Local</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Contado por</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Início</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Conclusão</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Criado em</th>
                </tr>
              </thead>
              <tbody>
                {counts.map((count) => (
                  <tr key={count.id} data-testid="inventorycount-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-3 text-neutral-700 font-medium">{count.location_name}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANTS[count.status] || 'neutral'}>
                        {STATUS_LABELS[count.status] || count.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{count.counted_by_name || '-'}</td>
                    <td className="px-4 py-3 text-neutral-700">
                      {count.started_at ? new Date(count.started_at).toLocaleDateString('pt-BR') : '-'}
                    </td>
                    <td className="px-4 py-3 text-neutral-700">
                      {count.completed_at ? new Date(count.completed_at).toLocaleDateString('pt-BR') : '-'}
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{new Date(count.created_at).toLocaleDateString('pt-BR')}</td>
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
