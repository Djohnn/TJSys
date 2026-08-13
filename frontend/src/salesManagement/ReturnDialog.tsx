import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Decimal from 'decimal.js'

import { apiRequest } from '@/api/client'
import { isApiProblemError } from '@/api/problem'
import Button from '@/components/ui/Button'
import { useTenant } from '@/tenant/TenantProvider'
import {
  fetchSale,
  getSaleQueryErrorMessage,
  type Sale,
} from './salesManagementApi'

interface ReturnDialogProps {
  saleId: string
  onClose: () => void
}

const dialogClass =
  'fixed inset-0 z-50 flex items-center justify-center bg-black/40'

export default function ReturnDialog({ saleId, onClose }: ReturnDialogProps) {
  const { selectedTenant } = useTenant()
  const queryClient = useQueryClient()
  const tenantId = selectedTenant?.tenant_id ?? ''

  const [selectedQtys, setSelectedQtys] = useState<Record<string, string>>({})
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const idempotencyKey = useRef(crypto.randomUUID())

  const saleQuery = useQuery<Sale>({
    queryKey: ['sale-dialog', tenantId, saleId],
    queryFn: ({ signal }) => fetchSale(tenantId, saleId, signal),
    enabled: !!tenantId,
    retry: false,
  })
  const { data: sale, isLoading, isError, error: saleError } = saleQuery

  const returnMutation = useMutation({
    mutationFn: () => {
      if (!sale) throw new Error('Sale data is unavailable.')
      const items = sale.items
        .filter((item) => Number.parseFloat(selectedQtys[item.id] ?? '0') > 0)
        .map((item) => ({
          sale_item_id: item.id,
          quantity: selectedQtys[item.id]!,
        }))

      return apiRequest(`/sales/${saleId}/returns/`, {
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
      } else if (err && typeof err === 'object' && 'detail' in err) {
        setError(String((err as { detail: unknown }).detail))
      } else {
        setError('Erro ao processar devolução.')
      }
    },
  })

  const handleSubmit = () => {
    if (!sale) return
    const hasItems = sale.items.some(
      (item) => Number.parseFloat(selectedQtys[item.id] ?? '0') > 0,
    )
    if (!hasItems) {
      setError('Selecione pelo menos um item para devolver.')
      return
    }
    if (!reason.trim()) {
      setError('O motivo da devolução é obrigatório.')
      return
    }
    if (returnMutation.isPending) return
    setError(null)
    returnMutation.mutate()
  }

  if (isLoading) {
    return (
      <div
        data-testid="return-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="return-dialog-title"
        className={dialogClass}
      >
        <div className="bg-surface rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
          <h3
            id="return-dialog-title"
            className="text-lg font-semibold text-neutral-900"
          >
            Devolução de Itens
          </h3>
          <p
            role="status"
            aria-live="polite"
            className="mt-4 text-sm text-neutral-500"
          >
            Carregando itens da venda...
          </p>
        </div>
      </div>
    )
  }

  if (isError || !sale) {
    return (
      <div
        data-testid="return-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="return-dialog-title"
        className={dialogClass}
      >
        <div className="bg-surface rounded-xl shadow-xl w-full max-w-lg mx-4">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h3
              id="return-dialog-title"
              className="text-lg font-semibold text-neutral-900"
            >
              Devolução de Itens
            </h3>
            <button
              type="button"
              aria-label="Fechar devolução"
              onClick={onClose}
              className="p-2 -mr-2 text-neutral-400 hover:text-neutral-600 text-xl leading-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
            >
              &times;
            </button>
          </div>
          <div className="p-6">
            <p
              role="alert"
              aria-live="assertive"
              data-testid="return-error"
              className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700"
            >
              {isError
                ? getSaleQueryErrorMessage(saleError)
                : 'Venda não encontrada ou não está disponível neste tenant.'}
            </p>
          </div>
          <div className="flex justify-end px-6 py-4 border-t border-border bg-neutral-50 rounded-b-xl">
            <Button variant="secondary" onClick={onClose} type="button">
              Fechar
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const totalQty = sale.items.reduce((acc, item) => {
    const qty = Number.parseFloat(selectedQtys[item.id] ?? '0')
    return acc + (qty > 0 ? qty : 0)
  }, 0)

  const totalCredit = sale.items.reduce((acc, item) => {
    const qty = new Decimal(selectedQtys[item.id] ?? '0')
    if (qty.isZero() || qty.isNegative()) return acc
    const saleQuantity = new Decimal(item.quantity)
    if (saleQuantity.isZero() || saleQuantity.isNegative()) return acc
    return acc.plus(qty.mul(item.total).div(saleQuantity))
  }, new Decimal(0))

  const hasItems = sale.items.length > 0

  return (
    <div
      data-testid="return-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="return-dialog-title"
      className={dialogClass}
    >
      <div className="bg-surface rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3
            id="return-dialog-title"
            className="text-lg font-semibold text-neutral-900"
          >
            Devolução de Itens
          </h3>
          <button
            type="button"
            aria-label="Fechar devolução"
            onClick={onClose}
            className="p-2 -mr-2 text-neutral-400 hover:text-neutral-600 text-xl leading-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
          >
            &times;
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-neutral-600">
            Venda: <strong className="text-neutral-900">{sale.id}</strong>
          </p>

          {error && (
            <div
              role="alert"
              aria-live="polite"
              data-testid="return-error"
              className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          {!hasItems && (
            <p
              role="status"
              data-testid="return-empty"
              className="p-3 rounded-lg bg-neutral-50 border border-border text-sm text-neutral-600"
            >
              Nenhum item disponível para devolução.
            </p>
          )}

          {hasItems && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-50 border-b border-border">
                    <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">
                      Produto
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">
                      Quantidade
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">
                      Devolver
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sale.items.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-4 py-3 text-neutral-700">
                        {item.product_name}
                      </td>
                      <td className="px-4 py-3 text-neutral-700">
                        {item.quantity}
                      </td>
                      <td className="px-4 py-3">
                        <label
                          htmlFor={`return-qty-${item.id}`}
                          className="sr-only"
                        >
                          Quantidade de {item.product_name} para devolver
                        </label>
                        <input
                          id={`return-qty-${item.id}`}
                          type="number"
                          min="0"
                          max={item.quantity}
                          step="1"
                          data-testid={`return-qty-${item.product}`}
                          value={selectedQtys[item.id] ?? ''}
                          onChange={(e) =>
                            setSelectedQtys((prev) => ({
                              ...prev,
                              [item.id]: e.target.value,
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

          {hasItems && (totalQty > 0 || !totalCredit.isZero()) && (
            <p
              data-testid="return-summary"
              className="text-sm text-neutral-600 bg-neutral-50 p-3 rounded-lg border border-border"
            >
              Isso irá reduzir o estoque em{' '}
              <strong className="text-neutral-900">{totalQty}</strong> unidades
              e gerar um crédito de{' '}
              <strong className="text-neutral-900">
                R$ {totalCredit.toFixed(2)}
              </strong>
            </p>
          )}

          {hasItems && (
            <div>
              <label
                htmlFor="return-reason"
                className="block text-sm font-medium text-neutral-700 mb-1"
              >
                Motivo
              </label>
              <textarea
                id="return-reason"
                data-testid="return-reason"
                aria-required="true"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm min-h-[80px]"
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border bg-neutral-50 rounded-b-xl">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={returnMutation.isPending}
            type="button"
          >
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={returnMutation.isPending || !hasItems}
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
