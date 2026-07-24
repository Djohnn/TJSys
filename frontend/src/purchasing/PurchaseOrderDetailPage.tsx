import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { useState } from 'react'

import { useTenant } from '@/tenant/TenantProvider'
import { isApiProblemError } from '@/api/problem'
import { fetchPurchaseOrder, approvePurchaseOrder } from './purchasingApi'
import LoadingState from '@/components/LoadingState'
import ErrorState from '@/errors/ErrorState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

const STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho',
  approved: 'Aprovado',
  received: 'Recebido',
  cancelled: 'Cancelado',
}

const STATUS_BADGE_COLOR: Record<string, 'info' | 'success' | 'neutral' | 'danger'> = {
  draft: 'info',
  approved: 'success',
  received: 'neutral',
  cancelled: 'danger',
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
    <div data-testid="purchase-order-detail" className="p-6 space-y-6">
      <Button onClick={() => navigate('/purchasing/orders')} variant="secondary" size="sm">Voltar</Button>

      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-bold text-neutral-900">Ordem de Compra: {order.number}</h2>
        <Badge testId="status-badge" variant={badgeColor as 'info' | 'success' | 'neutral' | 'danger'}>
          {STATUS_LABEL[order.status] ?? order.status}
        </Badge>
      </div>

      {actionError && (
        <div data-testid="action-error" role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {actionError}
        </div>
      )}

      <Card>
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-border">
              <td className="px-4 py-3 font-semibold text-neutral-700 w-40">Fornecedor</td>
              <td className="px-4 py-3 text-neutral-700">{order.supplier_name}</td>
            </tr>
            <tr className="border-b border-border">
              <td className="px-4 py-3 font-semibold text-neutral-700">Filial</td>
              <td className="px-4 py-3 text-neutral-700">{order.branch_name}</td>
            </tr>
            <tr className="border-b border-border">
              <td className="px-4 py-3 font-semibold text-neutral-700">Criado por</td>
              <td className="px-4 py-3 text-neutral-700">{order.created_by_name}</td>
            </tr>
            <tr className="border-b border-border">
              <td className="px-4 py-3 font-semibold text-neutral-700">Data</td>
              <td className="px-4 py-3 text-neutral-700">{new Date(order.created_at).toLocaleDateString('pt-BR')}</td>
            </tr>
            <tr>
              <td className="px-4 py-3 font-semibold text-neutral-700">Total</td>
              <td className="px-4 py-3 text-neutral-700">{order.total}</td>
            </tr>
          </tbody>
        </table>
      </Card>

      <h3 className="text-lg font-semibold text-neutral-900">Itens</h3>
      <Card>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table data-testid="items-table" className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 border-b border-border">
                <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Produto</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Quantidade</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Preço Unitário</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Total</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id} data-testid="item-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                  <td className="px-4 py-3 text-neutral-700">{item.product_name}</td>
                  <td className="px-4 py-3 text-neutral-700">{item.quantity}</td>
                  <td className="px-4 py-3 text-neutral-700">{item.unit_price}</td>
                  <td className="px-4 py-3 text-neutral-700">{item.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex gap-2">
        {order.status === 'draft' && (
          <Button onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending} loading={approveMutation.isPending}>
            {approveMutation.isPending ? 'Aprovando...' : 'Aprovar'}
          </Button>
        )}

        {order.status === 'draft' && (
          <Button onClick={() => navigate(`/purchasing/orders/${id}/edit`)} variant="secondary">
            Editar
          </Button>
        )}
      </div>
    </div>
  )
}
