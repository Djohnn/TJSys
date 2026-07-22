import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import { isApiProblemError } from '@/api/problem'
import type { PaginatedResponse } from '@/organization/organizationApi'
import LoadingState from '@/components/LoadingState'
import type { PurchaseReceipt } from './receivingApi'
import { createReceipt } from './receivingApi'

interface OrderSummary {
  id: string
  number: string
  supplier_name: string
  status: string
}

interface OrderDetail {
  id: string
  number: string
  supplier_name: string
  branch_name: string
  status: string
  items: {
    id: string
    product: string
    product_name: string
    quantity: string
    unit_price: string
    total: string
  }[]
}

interface ReceiptFormProps {
  onSuccess?: () => void
  onCancel?: () => void
}

function generateIdempotencyKey(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export default function ReceiptForm({ onSuccess: _onSuccess, onCancel }: ReceiptFormProps) {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''
  const queryClient = useQueryClient()
  const [selectedOrderId, setSelectedOrderId] = useState('')
  const [idempotencyKey] = useState(generateIdempotencyKey)
  const [createdReceipt, setCreatedReceipt] = useState<PurchaseReceipt | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const { register, handleSubmit, watch, formState: { errors } } = useForm<Record<string, string>>()

  const { data: ordersData, isLoading: ordersLoading } = useQuery({
    queryKey: ['orders-list', tenantId],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<OrderSummary>>('/purchasing/orders/', {
        tenantId,
        signal,
      }) as Promise<PaginatedResponse<OrderSummary>>,
    enabled: !!tenantId,
  })

  const { data: orderDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['order-detail', tenantId, selectedOrderId],
    queryFn: ({ signal }) =>
      apiRequest<OrderDetail>(`/purchasing/orders/${selectedOrderId}/`, {
        tenantId,
        signal,
      }) as Promise<OrderDetail>,
    enabled: !!tenantId && !!selectedOrderId,
  })

  const createMutation = useMutation({
    mutationFn: (payload: { order: string; items: { product: string; received_quantity: string }[] }) =>
      createReceipt(tenantId, { ...payload, idempotency_key: idempotencyKey }),
    onSuccess: (receipt) => {
      queryClient.invalidateQueries({ queryKey: ['receipts', tenantId] })
      setCreatedReceipt(receipt as PurchaseReceipt)
    },
    onError: (err) => {
      if (isApiProblemError(err)) {
        setSubmitError(err.problem.detail)
      } else {
        setSubmitError('Erro ao criar recebimento.')
      }
    },
  })

  const orders = ordersData?.results ?? []
  const items = orderDetail?.items ?? []

  const onSubmit = useCallback(() => {
    setSubmitError(null)
    const quantities = watch()
    const payloadItems: { product: string; received_quantity: string }[] = []
    let hasError = false

    for (const item of items) {
      const qtyKey = `qty_${item.id}`
      const receivedQty = quantities[qtyKey] as string | undefined
      const receivedNum = Number.parseFloat(receivedQty ?? '0')
      const orderedNum = Number.parseFloat(item.quantity)

      if (receivedNum > orderedNum) {
        hasError = true
      }

      payloadItems.push({
        product: item.product,
        received_quantity: receivedQty ?? '0',
      })
    }

    if (hasError) {
      setSubmitError('Uma ou mais quantidades excedem a quantidade pedida.')
      return
    }

    createMutation.mutate({ order: selectedOrderId, items: payloadItems })
  }, [items, selectedOrderId, createMutation, watch])

  if (createdReceipt) {
    return (
      <div data-testid="receipt-detail">
        <h2>Recebimento #{createdReceipt.id}</h2>
        <p>Pedido: {createdReceipt.order_number}</p>
        <p>Fornecedor: {createdReceipt.supplier_name}</p>
        <p>Filial: {createdReceipt.branch_name}</p>
        <p>Status: {createdReceipt.status}</p>
        <table data-testid="receipt-items-table">
          <thead>
            <tr>
              <th>Produto</th>
              <th>Qtd. Pedida</th>
              <th>Qtd. Recebida</th>
              <th>Unidade</th>
            </tr>
          </thead>
          <tbody>
            {createdReceipt.items.map((item) => (
              <tr key={item.id}>
                <td>{item.product_name}</td>
                <td>{item.ordered_quantity}</td>
                <td>{item.received_quantity}</td>
                <td>{item.unit_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {createdReceipt.linked_stock_movement && <p>Mov. Estoque: {createdReceipt.linked_stock_movement}</p>}
        {createdReceipt.linked_payable && <p>Conta a Pagar: {createdReceipt.linked_payable}</p>}
        {createdReceipt.linked_fiscal_document && <p>Doc. Fiscal: {createdReceipt.linked_fiscal_document}</p>}
      </div>
    )
  }

  if (ordersLoading) return <LoadingState message="Carregando pedidos..." />

  return (
    <div data-testid="receipt-form">
      <h2>Novo Recebimento</h2>

      <div>
        <label htmlFor="order-select">Pedido:</label>
        <select
          id="order-select"
          value={selectedOrderId}
          onChange={(e) => {
            setSelectedOrderId(e.target.value)
            setSubmitError(null)
          }}
        >
          <option value="">Selecione um pedido</option>
          {orders.map((order) => (
            <option key={order.id} value={order.id}>
              {order.number} - {order.supplier_name} ({order.status})
            </option>
          ))}
        </select>
      </div>

      {detailLoading && <LoadingState message="Carregando itens do pedido..." />}

      {items.length > 0 && (
        <form onSubmit={handleSubmit(onSubmit)}>
          <table data-testid="order-items-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Qtd. Pedida</th>
                <th>Qtd. Recebida</th>
                <th>Unidade</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const qtyKey = `qty_${item.id}`
                const orderedNum = Number.parseFloat(item.quantity)
                const currentVal = watch(qtyKey) as string | undefined
                const currentNum = Number.parseFloat(currentVal ?? '0')
                const exceeds = currentNum > orderedNum

                return (
                  <tr key={item.id}>
                    <td>{item.product_name}</td>
                    <td>{item.quantity}</td>
                    <td>
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        max={item.quantity}
                        data-testid={`received-qty-${item.id}`}
                        {...register(qtyKey, {
                          required: 'Quantidade é obrigatória',
                          min: { value: 0, message: 'Quantidade não pode ser negativa' },
                          max: { value: orderedNum, message: 'Quantidade excede a quantidade pedida' },
                        })}
                        defaultValue="0"
                      />
                      {errors[qtyKey] && (
                        <span data-testid={`qty-error-${item.id}`}>{errors[qtyKey]?.message as string}</span>
                      )}
                      {exceeds && (
                        <span data-testid={`qty-error-${item.id}`} style={{ color: 'red' }}>
                          Quantidade excede a quantidade pedida ({item.quantity})
                        </span>
                      )}
                    </td>
                    <td>{item.unit_price ? 'UN' : 'UN'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {submitError && <p data-testid="form-error">{submitError}</p>}

          <div>
            {onCancel && (
              <button type="button" onClick={onCancel} disabled={createMutation.isPending}>
                Cancelar
              </button>
            )}
            <button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Criando...' : 'Criar Recebimento'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
