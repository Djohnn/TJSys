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

export interface ProductionOrder {
  id: string
  code: string
  product: string
  product_name: string
  quantity: string
  unit: string
  unit_name: string
  location: string
  location_name: string
  status: string
  priority: string
  planned_start_date: string | null
  planned_end_date: string | null
  actual_start_date: string | null
  actual_end_date: string | null
  notes: string
  created_by: string | null
  created_by_name: string
  confirmed_by: string | null
  confirmed_by_name: string
  created_at: string
  updated_at: string
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  confirmed: 'Confirmada',
  in_progress: 'Em andamento',
  completed: 'Concluída',
  cancelled: 'Cancelada',
}

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  draft: 'neutral',
  confirmed: 'warning',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'danger',
}

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  urgent: 'Urgente',
}

const PRIORITY_VARIANTS: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  low: 'neutral',
  medium: 'warning',
  high: 'danger',
  urgent: 'danger',
}

export default function ProductionOrdersPage() {
  const { selectedTenant } = useTenant()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const tenantId = selectedTenant?.tenant_id ?? ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['production-orders', tenantId, page, q],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<ProductionOrder>>(`/inventory/production-orders/?page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}`, {
        tenantId,
        signal,
      }) as Promise<PaginatedResponse<ProductionOrder>>,
    enabled: !!tenantId,
  })

  if (isLoading) return <LoadingState message="Carregando ordens de produção..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar ordens de produção.</p>

  const orders = data?.results ?? []
  const totalPages = data ? Math.ceil(data.count / 25) : 1

  return (
    <div data-testid="production-orders-page" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neutral-900">Ordens de Produção</h2>
      </div>

      {orders.length > 0 && (
        <div className="flex gap-2">
          <input
            type="search"
            placeholder="Buscar por código..."
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1) }}
            className="w-full max-w-xs px-3 py-2 border border-border rounded-lg text-sm"
            data-testid="productionorder-search-input"
          />
        </div>
      )}

      {orders.length === 0 && (
        <EmptyState
          title="Nenhuma ordem de produção"
          description="Crie uma ordem de produção para começar."
        />
      )}

      {orders.length > 0 && (
        <Card>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="production-orders-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Código</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Produto</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Quantidade</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Prioridade</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Início</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Fim</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} data-testid="productionorder-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-3 text-neutral-700 font-medium">{order.code}</td>
                    <td className="px-4 py-3 text-neutral-700">{order.product_name}</td>
                    <td className="px-4 py-3 text-neutral-700">{order.quantity}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANTS[order.status] || 'neutral'}>
                        {STATUS_LABELS[order.status] || order.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={PRIORITY_VARIANTS[order.priority] || 'neutral'}>
                        {PRIORITY_LABELS[order.priority] || order.priority}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">
                      {order.planned_start_date ? new Date(order.planned_start_date).toLocaleDateString('pt-BR') : '-'}
                    </td>
                    <td className="px-4 py-3 text-neutral-700">
                      {order.planned_end_date ? new Date(order.planned_end_date).toLocaleDateString('pt-BR') : '-'}
                    </td>
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
