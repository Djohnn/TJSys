import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Decimal from 'decimal.js'

import { apiRequest } from '@/api/client'
import { isApiProblemError } from '@/api/problem'
import { useTenant } from '@/tenant/TenantProvider'
import Button from '@/components/ui/Button'
import { formatQuantity } from '@/components/formatQuantity'

interface SaleItem {
  id: string
  product: string
  product_name: string
  quantity: string
  unit_price: string
  total: string
  unit_symbol?: string
  unit_precision?: number
}

interface Sale {
  id: string
  number: string
  status: string
  customer_name?: string
  branch_name?: string
  total: string
  created_at: string
  items: SaleItem[]
}

interface ReturnDialogProps {
  saleId: string
  onClose: () => void
}

export default function ReturnDialog({ saleId, onClose }: ReturnDialogProps) {
  const { selectedTenant } = useTenant()
  const queryClient = useQueryClient()
  const tenantId = selectedTenant?.tenant_id ?? ''

  const [selectedQtys, setSelectedQtys] = useState<Record<string, string>>({})
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const idempotencyKey = useRef(crypto.randomUUID())

  const { data: sale, isLoading } = useQuery({
    queryKey: ['sale', tenantId, saleId],
    queryFn: ({ signal }) => apiRequest<Sale>(`/sales/${saleId}/`, { signal, tenantId }) as Promise<Sale>,
    enabled: !!tenantId,
  })

  const returnMutation = useMutation({
    mutationFn: () => {
      const items = sale!.items
        .filter((item) => {
          const qty = Number.parseFloat(selectedQtys[item.product] ?? '0')
          return qty > 0
        })
        .map((item) => ({
          product: item.product,
          quantity: selectedQtys[item.product]!,
        }))

      return apiRequest(`/sales/${saleId}/return/`, {
        method: 'POST',
        tenantId,
        body: { items, reason },
        headers: { 'Idempotency-Key': idempotencyKey.current },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sale', tenantId, saleId] })
      queryClient.invalidateQueries({ queryKey: ['sales', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['inventory', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['financial', tenantId] })
      onClose()
    },
    onError: (err) => {
      if (isApiProblemError(err)) {
        setError(err.problem.detail)
      } else {
        setError('Erro ao processar devolução.')
      }
    },
  })

  const handleSubmit = () => {
    const hasItems = sale!.items.some((item) => {
      const qty = Number.parseFloat(selectedQtys[item.product] ?? '0')
      return qty > 0
    })
    if (!hasItems) {
      setError('Selecione pelo menos um item para devolver.')
      return
    }
    if (!reason.trim()) {
      setError('O motivo da devolução é obrigatório.')
      return
    }
    setError(null)
    returnMutation.mutate()
  }

  const totalQty = sale?.items.reduce((acc, item) => {
    const qty = Number.parseFloat(selectedQtys[item.product] ?? '0')
    return acc + (qty > 0 ? qty : 0)
  }, 0) ?? 0

  const totalCredit = sale?.items.reduce((acc, item) => {
    const qty = new Decimal(selectedQtys[item.product] ?? '0')
    if (qty.isZero() || qty.isNegative()) return acc
    return acc.plus(qty.mul(item.unit_price))
  }, new Decimal(0)) ?? new Decimal(0)

  if (isLoading) {
    return (
      <div data-testid="return-dialog" role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-surface rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
          <p className="text-sm text-neutral-500">Carregando itens da venda...</p>
        </div>
      </div>
    )
  }

  return (
    <div data-testid="return-dialog" role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-surface rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-lg font-semibold text-neutral-900">Devolução de Itens</h3>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-600 text-xl leading-none">&times;</button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-neutral-600">
            Venda: <strong className="text-neutral-900">{sale?.number}</strong>
          </p>

          {error && (
            <div data-testid="return-error" className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          {sale && sale.items.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-50 border-b border-border">
                    <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Produto</th>
                    <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Quantidade</th>
                    <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Devolver</th>
                  </tr>
                </thead>
                <tbody>
                  {sale.items.map((item) => (
                    <tr key={item.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 text-neutral-700">{item.product_name}</td>
                      <td className="px-4 py-3 text-neutral-700">{formatQuantity(item.quantity, { precision: item.unit_precision, symbol: item.unit_symbol })}</td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min="0"
                          max={item.quantity}
                          step="1"
                          data-testid={`return-qty-${item.product}`}
                          value={selectedQtys[item.product] ?? ''}
                          onChange={(e) =>
                            setSelectedQtys((prev) => ({
                              ...prev,
                              [item.product]: e.target.value,
                            }))
                          }
                          className="w-24 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(totalQty > 0 || !totalCredit.isZero()) && (
            <p data-testid="return-summary" className="text-sm text-neutral-600 bg-neutral-50 p-3 rounded-lg border border-border">
              Isso irá reduzir o estoque em <strong className="text-neutral-900">{totalQty}</strong> unidades e gerar um crédito de{' '}
              <strong className="text-neutral-900">R$ {totalCredit.toFixed(2)}</strong>
            </p>
          )}

          <div>
            <label htmlFor="return-reason" className="block text-sm font-medium text-neutral-700 mb-1">Motivo</label>
            <textarea
              id="return-reason"
              data-testid="return-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm min-h-[80px]"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border bg-neutral-50 rounded-b-xl">
          <Button variant="secondary" onClick={onClose} disabled={returnMutation.isPending} type="button">
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={returnMutation.isPending}
            loading={returnMutation.isPending}
            type="button"
          >
            {returnMutation.isPending ? 'Processando...' : 'Confirmar'}
          </Button>
        </div>
      </div>
    </div>
  )
}
