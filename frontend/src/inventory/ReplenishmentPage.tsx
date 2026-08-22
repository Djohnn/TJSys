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

export interface ReplenishmentRule {
  id: string
  product: string
  product_name: string
  location: string
  location_name: string
  trigger_type: string
  min_quantity: string
  max_quantity: string
  reorder_quantity: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ReplenishmentOrder {
  id: string
  rule: string
  rule_name: string
  status: string
  quantity: string
  notes: string
  approved_by: string | null
  approved_by_name: string
  approved_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  pending: 'Pendente',
  approved: 'Aprovado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
}

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  draft: 'neutral',
  pending: 'warning',
  approved: 'success',
  completed: 'success',
  cancelled: 'danger',
}

const TRIGGER_LABELS: Record<string, string> = {
  min: 'Estoque Mínimo',
  periodic: 'Periódico',
  demand: 'Demanda',
}

export default function ReplenishmentPage() {
  const { selectedTenant } = useTenant()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<'rules' | 'orders'>('rules')
  const tenantId = selectedTenant?.tenant_id ?? ''

  const { data: rulesData, isLoading: rulesLoading } = useQuery({
    queryKey: ['replenishment-rules', tenantId, page, q],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<ReplenishmentRule>>(`/inventory/replenishment-rules/?page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}`, {
        tenantId,
        signal,
      }) as Promise<PaginatedResponse<ReplenishmentRule>>,
    enabled: !!tenantId && tab === 'rules',
  })

  const { data: ordersData, isLoading: ordersLoading } = useQuery({
    queryKey: ['replenishment-orders', tenantId, page, q],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<ReplenishmentOrder>>(`/inventory/replenishment-orders/?page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}`, {
        tenantId,
        signal,
      }) as Promise<PaginatedResponse<ReplenishmentOrder>>,
    enabled: !!tenantId && tab === 'orders',
  })

  if (rulesLoading || ordersLoading) return <LoadingState message="Carregando reabastecimento..." />

  const rules = rulesData?.results ?? []
  const orders = ordersData?.results ?? []
  const totalPages = tab === 'rules'
    ? (rulesData ? Math.ceil(rulesData.count / 25) : 1)
    : (ordersData ? Math.ceil(ordersData.count / 25) : 1)

  return (
    <div data-testid="replenishment-page" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neutral-900">Reabastecimento</h2>
      </div>

      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => { setTab('rules'); setPage(1) }}
          className={`px-4 py-2 text-sm font-medium ${tab === 'rules' ? 'border-b-2 border-primary text-primary' : 'text-neutral-600 hover:text-neutral-900'}`}
        >
          Regras
        </button>
        <button
          onClick={() => { setTab('orders'); setPage(1) }}
          className={`px-4 py-2 text-sm font-medium ${tab === 'orders' ? 'border-b-2 border-primary text-primary' : 'text-neutral-600 hover:text-neutral-900'}`}
        >
          Ordens
        </button>
      </div>

      {tab === 'rules' && rules.length === 0 && (
        <EmptyState
          title="Nenhuma regra de reabastecimento"
          description="Crie uma regra para começar."
        />
      )}

      {tab === 'orders' && orders.length === 0 && (
        <EmptyState
          title="Nenhuma ordem de reabastecimento"
          description="As ordens aparecerão aqui."
        />
      )}

      {tab === 'rules' && rules.length > 0 && (
        <Card>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="replenishment-rules-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Produto</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Local</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Gatilho</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Mín</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Máx</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Reorder</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id} data-testid="replenishment-rule-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-3 text-neutral-700 font-medium">{rule.product_name}</td>
                    <td className="px-4 py-3 text-neutral-700">{rule.location_name}</td>
                    <td className="px-4 py-3">
                      <Badge variant="neutral">{TRIGGER_LABELS[rule.trigger_type] || rule.trigger_type}</Badge>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{rule.min_quantity}</td>
                    <td className="px-4 py-3 text-neutral-700">{rule.max_quantity}</td>
                    <td className="px-4 py-3 text-neutral-700">{rule.reorder_quantity}</td>
                    <td className="px-4 py-3">
                      <Badge variant={rule.is_active ? 'success' : 'danger'}>
                        {rule.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'orders' && orders.length > 0 && (
        <Card>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="replenishment-orders-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Regra</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Quantidade</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Aprovado por</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Data</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} data-testid="replenishment-order-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-3 text-neutral-700 font-medium">{order.rule_name}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANTS[order.status] || 'neutral'}>
                        {STATUS_LABELS[order.status] || order.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{order.quantity}</td>
                    <td className="px-4 py-3 text-neutral-700">{order.approved_by_name || '-'}</td>
                    <td className="px-4 py-3 text-neutral-700">{new Date(order.created_at).toLocaleDateString('pt-BR')}</td>
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
