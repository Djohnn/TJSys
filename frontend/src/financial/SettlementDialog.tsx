import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Decimal from 'decimal.js'

import { useTenant } from '@/tenant/TenantProvider'
import { isApiProblemError } from '@/api/problem'
import { settlePayable, settleReceivable } from './financialApi'
import type { Payable, Receivable } from './financialApi'
import Button from '@/components/ui/Button'

interface SettlementDialogProps {
  type: 'payable' | 'receivable'
  target: Payable | Receivable
  onClose: () => void
}

function generateIdempotencyKey(): string {
  return crypto.randomUUID()
}

export default function SettlementDialog({ type, target, onClose }: SettlementDialogProps) {
  const { selectedTenant } = useTenant()
  const queryClient = useQueryClient()
  const tenantId = selectedTenant?.tenant_id ?? ''

  const [amount, setAmount] = useState(target.balance)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)

  const balanceDecimal = new Decimal(target.balance)
  const amountDecimal = (() => { try { return new Decimal(amount) } catch { return new Decimal(0) } })()

  const isOverSettle = amountDecimal.greaterThan(balanceDecimal)
  const isValidAmount = amountDecimal.greaterThan(0) && !isOverSettle

  const settleMutation = useMutation({
    mutationFn: () => {
      const idempotencyKey = generateIdempotencyKey()
      const body = {
        amount: amountDecimal.toString(),
        payment_method: paymentMethod,
        payment_date: paymentDate,
        ...(notes ? { notes } : {}),
      }
      if (type === 'payable') {
        return settlePayable(tenantId, target.id, body, idempotencyKey)
      }
      return settleReceivable(tenantId, target.id, body, idempotencyKey)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payables', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['receivables', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['cashflow', tenantId] })
      onClose()
    },
    onError: (err) => {
      if (isApiProblemError(err)) {
        const messages = err.problem.errors
          ? Object.values(err.problem.errors).flat().join(', ')
          : err.problem.detail
        setError(messages || 'Erro ao realizar liquidação.')
      } else {
        setError('Erro ao realizar liquidação.')
      }
    },
  })

  const showOverSettleError = isOverSettle && amount !== target.balance
  const showZeroError = !isOverSettle && amountDecimal.lessThanOrEqualTo(0) && amount !== ''

  let inlineError: string | null = null
  if (showOverSettleError) inlineError = 'O valor não pode exceder o saldo.'
  else if (showZeroError) inlineError = 'O valor deve ser maior que zero.'

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setValidationError(null)

    if (isOverSettle) {
      setValidationError('O valor não pode exceder o saldo.')
      return
    }
    if (!amountDecimal.greaterThan(0)) {
      setValidationError('O valor deve ser maior que zero.')
      return
    }

    settleMutation.mutate()
  }

  const actionLabel = type === 'payable' ? 'Pagar' : 'Receber'

  const inputClass = 'block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm'
  const labelClass = 'block text-sm font-medium text-neutral-700 mb-1'

  return (
    <div data-testid="settlement-dialog" role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-surface rounded-xl shadow-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-lg font-semibold text-neutral-900">{actionLabel} - {target.description}</h3>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-600 text-xl leading-none">&times;</button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex gap-6 text-sm text-neutral-600 bg-neutral-50 p-3 rounded-lg border border-border">
            <p>Saldo atual: <strong className="text-neutral-900">R$ {balanceDecimal.toFixed(2)}</strong></p>
            <p>Vencimento: <strong className="text-neutral-900">{new Date(target.due_date).toLocaleDateString('pt-BR')}</strong></p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="settlement-amount" className={labelClass}>Valor</label>
              <input
                id="settlement-amount"
                type="number"
                step="0.01"
                min="0.01"
                max={target.balance}
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setValidationError(null) }}
                data-testid="settlement-amount"
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="settlement-method" className={labelClass}>Forma de pagamento</label>
              <select
                id="settlement-method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                data-testid="settlement-method"
                className={inputClass}
              >
                <option value="cash">Dinheiro</option>
                <option value="bank_transfer">Transferência</option>
                <option value="credit_card">Cartão de Crédito</option>
                <option value="debit_card">Cartão de Débito</option>
                <option value="pix">PIX</option>
                <option value="check">Cheque</option>
                <option value="other">Outro</option>
              </select>
            </div>

            <div>
              <label htmlFor="settlement-date" className={labelClass}>Data</label>
              <input
                id="settlement-date"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                data-testid="settlement-date"
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="settlement-notes" className={labelClass}>Observação</label>
              <textarea
                id="settlement-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                data-testid="settlement-notes"
                className={`${inputClass} min-h-[80px]`}
              />
            </div>

            {inlineError && (
              <p data-testid="validation-error" className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{inlineError}</p>
            )}
            {validationError && (
              <p data-testid="validation-error" className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{validationError}</p>
            )}
            {error && (
              <p data-testid="settlement-error" className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" type="button" onClick={onClose} disabled={settleMutation.isPending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={settleMutation.isPending || !isValidAmount} loading={settleMutation.isPending} data-testid="settlement-submit">
                {settleMutation.isPending ? `${actionLabel}...` : actionLabel}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
