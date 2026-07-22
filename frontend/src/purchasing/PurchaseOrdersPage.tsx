import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { useTenant } from '@/tenant/TenantProvider'
import { fetchPurchaseOrders } from './purchasingApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'draft', label: 'Rascunho' },
  { value: 'approved', label: 'Aprovado' },
  { value: 'received', label: 'Recebido' },
  { value: 'cancelled', label: 'Cancelado' },
]

const STATUS_BADGE: Record<string, string> = {
  draft: 'blue',
  approved: 'green',
  received: 'gray',
  cancelled: 'red',
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
    <div data-testid="purchase-orders-page">
      <h2>Ordens de Compra</h2>

      <div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          aria-label="Status"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <button onClick={() => navigate('/purchasing/orders/new')} type="button">
          Nova Ordem
        </button>
      </div>

      {orders.length === 0 && (
        <EmptyState
          title="Nenhuma ordem de compra"
          description="Crie sua primeira ordem de compra para começar."
          action={
            <button onClick={() => navigate('/purchasing/orders/new')} type="button">
              Criar Ordem
            </button>
          }
        />
      )}

      {orders.length > 0 && (
        <table data-testid="orders-table">
          <thead>
            <tr>
              <th>Número</th>
              <th>Fornecedor</th>
              <th>Filial</th>
              <th>Status</th>
              <th>Total</th>
              <th>Data</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr
                key={order.id}
                data-testid="order-row"
                onClick={() => navigate(`/purchasing/orders/${order.id}`)}
                style={{ cursor: 'pointer' }}
              >
                <td>{order.number}</td>
                <td>{order.supplier_name}</td>
                <td>{order.branch_name}</td>
                <td>
                  <span data-testid={`status-badge-${order.id}`} className={`badge-${STATUS_BADGE[order.status] ?? 'gray'}`}>
                    {STATUS_LABEL[order.status] ?? order.status}
                  </span>
                </td>
                <td>{order.total}</td>
                <td>{new Date(order.created_at).toLocaleDateString('pt-BR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {totalPages > 1 && (
        <nav aria-label="Paginação">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} type="button">
            Anterior
          </button>
          <span>Página {page} de {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} type="button">
            Próxima
          </button>
        </nav>
      )}
    </div>
  )
}
