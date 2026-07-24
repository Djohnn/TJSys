import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { useTenant } from '@/tenant/TenantProvider'
import { fetchPurchaseOrders } from './purchasingApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'draft', label: 'Rascunho' },
  { value: 'approved', label: 'Aprovado' },
  { value: 'received', label: 'Recebido' },
  { value: 'cancelled', label: 'Cancelado' },
]

const STATUS_BADGE: Record<string, 'info' | 'success' | 'neutral' | 'danger'> = {
  draft: 'info',
  approved: 'success',
  received: 'neutral',
  cancelled: 'danger',
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho',
  approved: 'Aprovado',
  received: 'Recebido',
  cancelled: 'Cancelado',
}

export default function PurchaseOrdersPage() {
  const { selectedTenant } = useTenant()
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const tenantId = selectedTenant?.tenant_id ?? ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['purchase-orders', tenantId, page, statusFilter],
    queryFn: ({ signal }) =>
      fetchPurchaseOrders(tenantId, { page, status: statusFilter || undefined }, signal),
    enabled: !!tenantId,
  })

  if (isLoading) return <LoadingState message="Carregando ordens de compra..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar ordens de compra.</p>

  const orders = data?.results ?? []
  const totalPages = data ? Math.ceil(data.count / 25) : 1

  return (
    <div data-testid="purchase-orders-page" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neutral-900">Ordens de Compra</h2>
        <Button onClick={() => navigate('/purchasing/orders/new')} variant="primary">Nova Ordem</Button>
      </div>

      <Card>
        <div className="flex flex-wrap gap-3">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
            aria-label="Status"
            className="w-full px-3 py-2 border border-border rounded-lg text-sm"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </Card>

      {orders.length === 0 && (
        <EmptyState
          title="Nenhuma ordem de compra"
          description="Crie sua primeira ordem de compra para começar."
          action={
            <Button onClick={() => navigate('/purchasing/orders/new')} variant="primary">Criar Ordem</Button>
          }
        />
      )}

      {orders.length > 0 && (
        <Card>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="orders-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Número</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Fornecedor</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Filial</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Total</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Data</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    data-testid="order-row"
                    onClick={() => navigate(`/purchasing/orders/${order.id}`)}
                    className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 text-neutral-700">{order.number}</td>
                    <td className="px-4 py-3 text-neutral-700">{order.supplier_name}</td>
                    <td className="px-4 py-3 text-neutral-700">{order.branch_name}</td>
                    <td className="px-4 py-3">
                      <Badge testId={`status-badge-${order.id}`} variant={STATUS_BADGE[order.status] ?? 'neutral'}>{STATUS_LABEL[order.status] ?? order.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{order.total}</td>
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
