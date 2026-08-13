import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiRequest } from '@/api/client'
import { isApiProblemError } from '@/api/problem'
import { useTenant } from '@/tenant/TenantProvider'
import Button from '@/components/ui/Button'

interface Sale {
  id: string
  number: string
  status: string
  customer_name?: string
  branch_name?: string
  total: string
  created_at: string
  payments: SalePayment[]
}

interface SalePayment {
  id: string
  method: string
  method_name: string
  amount: string
  status: string
  status_label: string
}

type RefundMethod = 'cash' | 'pix' | 'card_external'

interface RefundDialogProps {
  saleId: string
  onClose: () => void
}

export default function RefundDialog({ saleId, onClose }: RefundDialogProps) {
  const { selectedTenant } = useTenant()
  const queryClient = useQueryClient()
  const tenantId = selectedTenant?.tenant_id ?? ''

  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<RefundMethod>('cash')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const idempotencyKey = useRef(crypto.randomUUID())

  const { data: sale } = useQuery({
    queryKey: ['sale', tenantId, saleId],
    queryFn: ({ signal }) => apiRequest<Sale>(`/sales/${saleId}/`, { signal, tenantId }),
    enabled: !!tenantId,
  })

  const refundMutation = useMutation({
    mutationFn: () => {
      const body: { method: RefundMethod; reason: string; amount?: string } = { method, reason }
      const parsed = Number.parseFloat(amount)
      if (amount.trim() && parsed > 0 && parsed <= Number.parseFloat(sale?.total ?? '0')) {
        body.amount = amount
      }
      return apiRequest(`/sales/${saleId}/refund/`, {
        method: 'POST',
        tenantId,
        body,
        headers: { 'Idempotency-Key': idempotencyKey.current },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sale', tenantId, saleId] })
      queryClient.invalidateQueries({ queryKey: ['sales', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['financial', tenantId] })
      onClose()
    },
    onError: (err) => {
      if (isApiProblemError(err)) {
        setError(err.problem.detail)
      } else {
        setError('Erro ao processar reembolso.')
      }
    },
  })

  const handleSubmit = () => {
    if (!reason.trim()) {
      setError('O motivo do reembolso é obrigatório.')
      return
    }
    if (amount.trim()) {
      const parsed = Number.parseFloat(amount)
      const total = Number.parseFloat(sale?.total ?? '0')
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > total) {
        setError('Informe um valor entre R$ 0,01 e o total da venda.')
        return
      }
    }
    if (refundMutation.isPending) return
    setError(null)
    refundMutation.mutate()
  }

  const displayAmount = amount.trim()
    ? Number.parseFloat(amount).toFixed(2).replace('.', ',')
    : (sale?.total ?? '0,00').replace('.', ',')

  return (
    <div data-testid="refund-dialog" role="dialog" aria-modal="true" aria-labelledby="refund-dialog-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-surface rounded-xl shadow-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 id="refund-dialog-title" className="text-lg font-semibold text-neutral-900">Reembolso</h3>
          <button type="button" aria-label="Fechar reembolso" onClick={onClose} className="p-2 -mr-2 text-neutral-400 hover:text-neutral-600 text-xl leading-none">&times;</button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-neutral-600">
            Venda: <strong className="text-neutral-900">{sale?.number ?? saleId}</strong>
          </p>

          {error && (
            <div role="alert" aria-live="polite" data-testid="refund-error" className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          <p data-testid="refund-summary" className="text-sm text-neutral-600 bg-neutral-50 p-3 rounded-lg border border-border">
            Isso irá gerar um reembolso de <strong className="text-neutral-900">R$ {displayAmount}</strong>
          </p>

          <div>
            <label htmlFor="refund-method" className="block text-sm font-medium text-neutral-700 mb-1">Método do reembolso</label>
            <select
              id="refund-method"
              aria-label="Método do reembolso"
              data-testid="refund-method"
              value={method}
              onChange={(e) => setMethod(e.target.value as RefundMethod)}
              className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="cash">Dinheiro</option>
              <option value="pix">PIX</option>
              <option value="card_external">Cartão externo</option>
            </select>
          </div>

          <div>
            <label htmlFor="refund-amount" className="block text-sm font-medium text-neutral-700 mb-1">
              Valor (deixe vazio para reembolso total)
            </label>
            <input
              id="refund-amount"
              type="number"
              step="0.01"
              min="0"
              data-testid="refund-amount"
              aria-describedby="refund-amount-help"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
            <p id="refund-amount-help" className="mt-1 text-xs text-neutral-500">Deixe vazio para reembolsar o saldo total.</p>
          </div>

          <div>
            <label htmlFor="refund-reason" className="block text-sm font-medium text-neutral-700 mb-1">Motivo</label>
            <textarea
              id="refund-reason"
              data-testid="refund-reason"
              aria-required="true"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm min-h-[80px]"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border bg-neutral-50 rounded-b-xl">
          <Button variant="secondary" onClick={onClose} disabled={refundMutation.isPending} type="button">
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={refundMutation.isPending}
            loading={refundMutation.isPending}
            type="button"
          >
            {refundMutation.isPending ? 'Processando...' : 'Confirmar Reembolso'}
          </Button>
        </div>
      </div>
    </div>
  )
}
