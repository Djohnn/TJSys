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

export interface SalesOrderItem {
  id: string
  product: string
  product_name: string
  product_sku: string
  quantity: string
  unit_price: string
  discount: string
  notes: string
}

export interface SalesOrder {
  id: string
  branch: string
  branch_name: string
  customer: string | null
  customer_name: string
  operator: string
  operator_name: string
  quote: string | null
  quote_number: string
  status: string
  order_number: string
  expected_date: string | null
  notes: string
  gross_total: string
  discount_total: string
  net_total: string
  converted_sale: string | null
  items: SalesOrderItem[]
  created_at: string
  updated_at: string
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  confirmed: 'Confirmado',
  processing: 'Em processamento',
  shipped: 'Enviado',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
}

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  draft: 'neutral',
  confirmed: 'warning',
  processing: 'warning',
  shipped: 'success',
  delivered: 'success',
  cancelled: 'danger',
}

export default function SalesOrdersPage() {
  const { selectedTenant } = useTenant()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const tenantId = selectedTenant?.tenant_id ?? ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['sales-orders', tenantId, page, q],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<SalesOrder>>(`/sales/sales-orders/?page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}`, {
        tenantId,
        signal,
      }) as Promise<PaginatedResponse<SalesOrder>>,
    enabled: !!tenantId,
  })

  const convertMutation = useMutation({
    mutationFn: (orderId: string) =>
      apiRequest<unknown>(`/sales/sales-orders/${orderId}/convert/`, {
        method: 'POST',
        tenantId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-orders', tenantId] })
    },
  })

  if (isLoading) return <LoadingState message="Carregando pedidos..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar pedidos.</p>

  const orders = data?.results ?? []
  const totalPages = data ? Math.ceil(data.count / 25) : 1

  return (
    <div data-testid="sales-orders-page" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neutral-900">Pedidos Comerciais</h2>
      </div>

      {orders.length > 0 && (
        <div className="flex gap-2">
          <input
            type="search"
            placeholder="Buscar por número..."
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1) }}
            className="w-full max-w-xs px-3 py-2 border border-border rounded-lg text-sm"
            data-testid="order-search-input"
          />
        </div>
      )}

      {orders.length === 0 && (
        <EmptyState
          title="Nenhum pedido"
          description="Crie um pedido para começar."
        />
      )}

      {orders.length > 0 && (
        <Card>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="sales-orders-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Número</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Cliente</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Total</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Previsão</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Ações</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} data-testid="sales-order-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-3 text-neutral-700 font-medium">{order.order_number}</td>
                    <td className="px-4 py-3 text-neutral-700">{order.customer_name || 'Sem cliente'}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANTS[order.status] || 'neutral'}>
                        {STATUS_LABELS[order.status] || order.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">R$ {order.net_total}</td>
                    <td className="px-4 py-3 text-neutral-700">{order.expected_date || '-'}</td>
                    <td className="px-4 py-3 flex gap-2">
                      {['draft', 'confirmed'].includes(order.status) && (
                        <Button
                          onClick={() => convertMutation.mutate(order.id)}
                          variant="primary"
                          size="sm"
                          disabled={convertMutation.isPending}
                        >
                          Converter
                        </Button>
                      )}
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
