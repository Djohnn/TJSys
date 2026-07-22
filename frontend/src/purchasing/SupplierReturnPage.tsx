import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import { isApiProblemError } from '@/api/problem'
import type { PaginatedResponse } from '@/organization/organizationApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import { fetchReturns, createReturn } from './receivingApi'

interface OrderSummary {
  id: string
  number: string
  supplier_name: string
  status: string
}

interface OrderDetail {
  id: string
  items: {
    id: string
    product: string
    product_name: string
    quantity: string
  }[]
}

function generateIdempotencyKey(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function ReturnForm({ onSuccess }: { onSuccess: () => void }) {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''
  const queryClient = useQueryClient()
  const [selectedOrderId, setSelectedOrderId] = useState('')
  const [reason, setReason] = useState('')
  const [idempotencyKey] = useState(generateIdempotencyKey)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const { data: ordersData } = useQuery({
    queryKey: ['orders-list', tenantId],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<OrderSummary>>('/purchasing/orders/', { tenantId, signal }) as Promise<PaginatedResponse<OrderSummary>>,
    enabled: !!tenantId,
  })

  const { data: orderDetail } = useQuery({
    queryKey: ['order-detail', tenantId, selectedOrderId],
    queryFn: ({ signal }) =>
      apiRequest<OrderDetail>(`/purchasing/orders/${selectedOrderId}/`, { tenantId, signal }) as Promise<OrderDetail>,
    enabled: !!tenantId && !!selectedOrderId,
  })

  const createMutation = useMutation({
    mutationFn: () =>
      createReturn(tenantId, {
        order: selectedOrderId,
        items: (orderDetail?.items ?? []).map((item) => ({
          product: item.product,
          quantity: '0',
        })),
        reason,
        idempotency_key: idempotencyKey,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['returns', tenantId] })
      onSuccess()
    },
    onError: (err) => {
      if (isApiProblemError(err)) {
        setSubmitError(err.problem.detail)
      } else {
        setSubmitError('Erro ao criar devolução.')
      }
    },
  })

  const orders = ordersData?.results ?? []
  const items = orderDetail?.items ?? []

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      setSubmitError(null)
      if (!selectedOrderId) {
        setSubmitError('Selecione um pedido.')
        return
      }
      if (!reason.trim()) {
        setSubmitError('Informe o motivo da devolução.')
        return
      }
      createMutation.mutate()
    },
    [selectedOrderId, reason, createMutation],
  )

  return (
    <div data-testid="return-form">
      <h2>Nova Devolução</h2>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="return-order-select">Pedido:</label>
          <select
            id="return-order-select"
            value={selectedOrderId}
            onChange={(e) => setSelectedOrderId(e.target.value)}
          >
            <option value="">Selecione um pedido</option>
            {orders.map((order) => (
              <option key={order.id} value={order.id}>
                {order.number} - {order.supplier_name}
              </option>
            ))}
          </select>
        </div>

        {items.length > 0 && (
          <div>
            <p>Itens do pedido (serão incluídos na devolução):</p>
            <ul>
              {items.map((item) => (
                <li key={item.id}>{item.product_name} - Qtd. Pedida: {item.quantity}</li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <label htmlFor="return-reason">Motivo:</label>
          <textarea
            id="return-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        </div>

        {submitError && <p data-testid="form-error">{submitError}</p>}

        <button type="submit" disabled={createMutation.isPending}>
          {createMutation.isPending ? 'Criando...' : 'Criar Devolução'}
        </button>
      </form>
    </div>
  )
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
}

export default function SupplierReturnPage() {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''
  const [showForm, setShowForm] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['returns', tenantId],
    queryFn: ({ signal }) => fetchReturns(tenantId, {}, signal),
    enabled: !!tenantId,
  })

  if (isLoading) return <LoadingState message="Carregando devoluções..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar devoluções.</p>

  const returns = data?.results ?? []

  if (showForm) {
    return <ReturnForm onSuccess={() => setShowForm(false)} />
  }

  return (
    <div data-testid="returns-page">
      <h2>Devoluções</h2>

      <div>
        <button onClick={() => setShowForm(true)} type="button">
          Nova Devolução
        </button>
      </div>

      {returns.length === 0 ? (
        <EmptyState title="Nenhuma devolução" description="Nenhuma devolução encontrada." />
      ) : (
        <table data-testid="returns-table">
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Fornecedor</th>
              <th>Valor</th>
              <th>Motivo</th>
              <th>Status</th>
              <th>Data</th>
            </tr>
          </thead>
          <tbody>
            {returns.map((ret) => (
              <tr key={ret.id} data-testid="return-row">
                <td>{ret.order_number}</td>
                <td>{ret.supplier_name}</td>
                <td>{ret.total}</td>
                <td>{ret.reason}</td>
                <td>{STATUS_LABELS[ret.status] ?? ret.status}</td>
                <td>{new Date(ret.created_at).toLocaleString('pt-BR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
