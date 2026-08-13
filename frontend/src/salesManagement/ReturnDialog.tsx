import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Decimal from 'decimal.js'

import { apiRequest } from '@/api/client'
import { isApiProblemError } from '@/api/problem'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
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

function parseDecimal(value: string | undefined): Decimal | null {
  if (!value?.trim()) return null
  try {
    const parsed = new Decimal(value.trim().replace(',', '.'))
    return parsed.isFinite() ? parsed : null
  } catch {
    return null
  }
}

function getQuantityStep(precision = 6): string {
  const safePrecision = Math.min(6, Math.max(0, precision))
  return new Decimal(10).pow(-safePrecision).toFixed(safePrecision)
}

function formatQuantity(value: Decimal): string {
  return value.toFixed(6).replace(/\.?(0+)$/, '') || '0'
}

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
        .filter((item) => parseDecimal(selectedQtys[item.id])?.gt(0))
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
      (item) => parseDecimal(selectedQtys[item.id])?.gt(0),
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
      <Modal
        open
        title="Devolução de Itens"
        onClose={onClose}
        testId="return-dialog"
        closeLabel="Fechar devolução"
        actions={
          <Button variant="secondary" onClick={onClose} type="button">
            Fechar
          </Button>
        }
      >
        <p role="status" aria-live="polite" className="text-sm text-neutral-500">
          Carregando itens da venda...
        </p>
      </Modal>
    )
  }

  if (isError || !sale) {
    return (
      <Modal
        open
        title="Devolução de Itens"
        onClose={onClose}
        testId="return-dialog"
        closeLabel="Fechar devolução"
        actions={
          <Button variant="secondary" onClick={onClose} type="button">
            Fechar
          </Button>
        }
      >
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
      </Modal>
    )
  }

  const totalQty = sale.items.reduce((acc, item) => {
    const quantity = parseDecimal(selectedQtys[item.id])
    return quantity?.gt(0) ? acc.plus(quantity) : acc
  }, new Decimal(0))

  const totalCredit = sale.items.reduce((acc, item) => {
    const quantity = parseDecimal(selectedQtys[item.id])
    const saleQuantity = parseDecimal(item.quantity)
    const lineTotal = parseDecimal(item.total)
    if (!quantity?.gt(0) || !saleQuantity?.gt(0) || !lineTotal) return acc
    return acc.plus(quantity.mul(lineTotal).div(saleQuantity))
  }, new Decimal(0))

  const hasItems = sale.items.length > 0

  return (
    <Modal
      open
      title="Devolução de Itens"
      onClose={onClose}
      testId="return-dialog"
      closeLabel="Fechar devolução"
      closeDisabled={returnMutation.isPending}
      actions={
        <>
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
        </>
      }
    >
      <div className="space-y-4">
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
                  <tr key={item.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-neutral-700">{item.product_name}</td>
                    <td className="px-4 py-3 text-neutral-700">{item.quantity}</td>
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
                        inputMode="decimal"
                        min="0"
                        max={item.quantity}
                        step={getQuantityStep(item.unit_precision)}
                        data-testid={`return-qty-${item.product}`}
                        value={selectedQtys[item.id] ?? ''}
                        onChange={(event) =>
                          setSelectedQtys((previous) => ({
                            ...previous,
                            [item.id]: event.target.value,
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

        {hasItems && (totalQty.gt(0) || totalCredit.gt(0)) && (
          <p
            data-testid="return-summary"
            className="text-sm text-neutral-600 bg-neutral-50 p-3 rounded-lg border border-border"
          >
            Isso irá reduzir o estoque em{' '}
            <strong className="text-neutral-900">{formatQuantity(totalQty)}</strong>{' '}
            unidades e gerar um crédito de{' '}
            <strong className="text-neutral-900">R$ {totalCredit.toFixed(2)}</strong>
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
              onChange={(event) => setReason(event.target.value)}
              className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm min-h-[80px]"
            />
          </div>
        )}
      </div>
    </Modal>
  )
}
