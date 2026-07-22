import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { useState } from 'react'

import { useTenant } from '@/tenant/TenantProvider'
import { isApiProblemError } from '@/api/problem'
import { fetchPurchaseOrder, approvePurchaseOrder } from './purchasingApi'
import LoadingState from '@/components/LoadingState'
import ErrorState from '@/errors/ErrorState'

const STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho',
  approved: 'Aprovado',
  received: 'Recebido',
  cancelled: 'Cancelado',
}

const STATUS_BADGE_COLOR: Record<string, string> = {
  draft: 'blue',
  approved: 'green',
  received: 'gray',
  cancelled: 'red',
}

export default function PurchaseOrderDetailPage() {
  const { selectedTenant } = useTenant()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const tenantId = selectedTenant?.tenant_id ?? ''
  const [actionError, setActionError] = useState<string | null>(null)

  const { data: order, isLoading, isError } = useQuery({
    queryKey: ['purchase-order', tenantId, id],
    queryFn: ({ signal }) => fetchPurchaseOrder(tenantId, id!, signal),
    enabled: !!tenantId && !!id,
  })

  const approveMutation = useMutation({
    mutationFn: () => approvePurchaseOrder(tenantId, id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-order', tenantId, id] })
      queryClient.invalidateQueries({ queryKey: ['purchase-orders', tenantId] })
      setActionError(null)
    },
    onError: (err) => {
      if (isApiProblemError(err)) {
        setActionError(err.problem.detail)
      } else {
        setActionError('Erro ao aprovar ordem de compra.')
      }
    },
  })

  if (isLoading) return <LoadingState message="Carregando ordem de compra..." />
  if (isError || !order) return <ErrorState status={404} message="Ordem não encontrada." />

  const badgeColor = STATUS_BADGE_COLOR[order.status] ?? 'gray'

  return (
    <div data-testid="purchase-order-detail">
      <button onClick={() => navigate('/purchasing/orders')} type="button">
        Voltar
      </button>

      <h2>Ordem de Compra: {order.number}</h2>

      <div>
        <span
          data-testid="status-badge"
          className={`badge-${badgeColor}`}
        >
          {STATUS_LABEL[order.status] ?? order.status}
        </span>
      </div>

      {actionError && (
        <div data-testid="action-error" role="alert" style={{ color: 'red' }}>
          {actionError}
        </div>
      )}

      <table>
        <tbody>
          <tr>
            <td><strong>Fornecedor</strong></td>
            <td>{order.supplier_name}</td>
          </tr>
          <tr>
            <td><strong>Filial</strong></td>
            <td>{order.branch_name}</td>
          </tr>
          <tr>
            <td><strong>Criado por</strong></td>
            <td>{order.created_by_name}</td>
          </tr>
          <tr>
            <td><strong>Data</strong></td>
            <td>{new Date(order.created_at).toLocaleDateString('pt-BR')}</td>
          </tr>
          <tr>
            <td><strong>Total</strong></td>
            <td>{order.total}</td>
          </tr>
        </tbody>
      </table>

      <h3>Itens</h3>
      <table data-testid="items-table">
        <thead>
          <tr>
            <th>Produto</th>
            <th>Quantidade</th>
            <th>Preço Unitário</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id} data-testid="item-row">
              <td>{item.product_name}</td>
              <td>{item.quantity}</td>
              <td>{item.unit_price}</td>
              <td>{item.total}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div>
        {order.status === 'draft' && (
          <button
            onClick={() => approveMutation.mutate()}
            disabled={approveMutation.isPending}
            type="button"
          >
            {approveMutation.isPending ? 'Aprovando...' : 'Aprovar'}
          </button>
        )}

        {order.status === 'draft' && (
          <button onClick={() => navigate(`/purchasing/orders/${id}/edit`)} type="button">
            Editar
          </button>
        )}
      </div>
    </div>
  )
}
