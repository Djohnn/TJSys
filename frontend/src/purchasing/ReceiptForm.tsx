import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import { isApiProblemError } from '@/api/problem'
import type { PaginatedResponse } from '@/organization/organizationApi'
import LoadingState from '@/components/LoadingState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { formatQuantity } from '@/components/formatQuantity'
import Badge from '@/components/ui/Badge'
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
    unit_symbol?: string
    unit_precision?: number
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
      <div data-testid="receipt-detail" className="p-6 space-y-6">
        <h2 className="text-2xl font-bold text-neutral-900">Recebimento #{createdReceipt.id}</h2>
        <Card>
          <div className="space-y-2 text-sm">
            <p className="text-neutral-700"><span className="font-semibold">Pedido:</span> {createdReceipt.order_number}</p>
            <p className="text-neutral-700"><span className="font-semibold">Fornecedor:</span> {createdReceipt.supplier_name}</p>
            <p className="text-neutral-700"><span className="font-semibold">Filial:</span> {createdReceipt.branch_name}</p>
            <p className="text-neutral-700"><span className="font-semibold">Status:</span> <Badge variant={createdReceipt.status === 'completed' ? 'success' : createdReceipt.status === 'cancelled' ? 'danger' : 'info'}>{createdReceipt.status}</Badge></p>
          </div>
        </Card>
        <Card title="Itens">
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="receipt-items-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Produto</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Qtd. Pedida</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Qtd. Recebida</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Unidade</th>
                </tr>
              </thead>
              <tbody>
                {createdReceipt.items.map((item) => (
                  <tr key={item.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-neutral-700">{item.product_name}</td>
                    <td className="px-4 py-3 text-neutral-700">{formatQuantity(item.ordered_quantity, { precision: item.unit_precision, symbol: item.unit_symbol })}</td>
                    <td className="px-4 py-3 text-neutral-700">{formatQuantity(item.received_quantity, { precision: item.unit_precision, symbol: item.unit_symbol })}</td>
                    <td className="px-4 py-3 text-neutral-700">{item.unit_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card>
          <div className="space-y-1 text-sm">
            {createdReceipt.linked_stock_movement && <p className="text-neutral-700"><span className="font-semibold">Mov. Estoque:</span> {createdReceipt.linked_stock_movement}</p>}
            {createdReceipt.linked_payable && <p className="text-neutral-700"><span className="font-semibold">Conta a Pagar:</span> {createdReceipt.linked_payable}</p>}
            {createdReceipt.linked_fiscal_document && <p className="text-neutral-700"><span className="font-semibold">Doc. Fiscal:</span> {createdReceipt.linked_fiscal_document}</p>}
          </div>
        </Card>
      </div>
    )
  }

  if (ordersLoading) return <LoadingState message="Carregando pedidos..." />

  return (
    <div data-testid="receipt-form" className="p-6 space-y-6">
      <h2 className="text-2xl font-bold text-neutral-900">Novo Recebimento</h2>

      <Card>
        <div>
          <label htmlFor="order-select" className="block text-sm font-medium text-neutral-700 mb-1">Pedido</label>
          <select
            id="order-select"
            value={selectedOrderId}
            onChange={(e) => {
              setSelectedOrderId(e.target.value)
              setSubmitError(null)
            }}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm"
          >
            <option value="">Selecione um pedido</option>
            {orders.map((order) => (
              <option key={order.id} value={order.id}>
                {order.number} - {order.supplier_name} ({order.status})
              </option>
            ))}
          </select>
        </div>
      </Card>

      {detailLoading && <LoadingState lines={3} message="Carregando itens do pedido..." />}

      {items.length > 0 && (
        <Card title="Itens do Pedido">
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="overflow-x-auto rounded-lg border border-border mb-4">
              <table data-testid="order-items-table" className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-50 border-b border-border">
                    <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Produto</th>
                    <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Qtd. Pedida</th>
                    <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Qtd. Recebida</th>
                    <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Unidade</th>
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
                      <tr key={item.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 text-neutral-700">{item.product_name}</td>
                        <td className="px-4 py-3 text-neutral-700">{formatQuantity(item.quantity, { precision: item.unit_precision, symbol: item.unit_symbol })}</td>
                        <td className="px-4 py-3">
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
                            className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                          />
                          {errors[qtyKey] && (
                            <span data-testid={`qty-error-${item.id}`} className="text-xs text-red-600 mt-1 block">{errors[qtyKey]?.message as string}</span>
                          )}
                          {exceeds && (
                            <span data-testid={`qty-error-${item.id}`} className="text-xs text-red-600 mt-1 block">
                              Quantidade excede a quantidade pedida ({formatQuantity(item.quantity, {
                                precision: item.unit_precision,
                                symbol: item.unit_symbol,
                              })})
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-neutral-700">{item.unit_symbol ?? '--'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {submitError && <p data-testid="form-error" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{submitError}</p>}

            <div className="flex gap-2">
              {onCancel && (
                <Button type="button" variant="secondary" onClick={onCancel} disabled={createMutation.isPending}>
                  Cancelar
                </Button>
              )}
              <Button type="submit" disabled={createMutation.isPending} loading={createMutation.isPending}>
                {createMutation.isPending ? 'Criando...' : 'Criar Recebimento'}
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  )
}
