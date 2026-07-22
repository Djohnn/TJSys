import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Decimal from 'decimal.js'

import { useTenant } from '@/tenant/TenantProvider'
import { isApiProblemError } from '@/api/problem'
import { settlePayable, settleReceivable } from './financialApi'
import type { Payable, Receivable } from './financialApi'

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

  return (
    <div data-testid="settlement-dialog" role="dialog" aria-modal="true">
      <h3>{actionLabel} - {target.description}</h3>

      <div>
        <p>Saldo atual: <strong>R$ {balanceDecimal.toFixed(2)}</strong></p>
        <p>Vencimento: <strong>{new Date(target.due_date).toLocaleDateString('pt-BR')}</strong></p>
      </div>

      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="settlement-amount">Valor</label>
          <input
            id="settlement-amount"
            type="number"
            step="0.01"
            min="0.01"
            max={target.balance}
            value={amount}
            onChange={(e) => { setAmount(e.target.value); setValidationError(null) }}
            data-testid="settlement-amount"
          />
        </div>

        <div>
          <label htmlFor="settlement-method">Forma de pagamento</label>
          <select
            id="settlement-method"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            data-testid="settlement-method"
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
          <label htmlFor="settlement-date">Data</label>
          <input
            id="settlement-date"
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            data-testid="settlement-date"
          />
        </div>

        <div>
          <label htmlFor="settlement-notes">Observação</label>
          <textarea
            id="settlement-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            data-testid="settlement-notes"
          />
        </div>

        {inlineError && <p data-testid="validation-error" style={{ color: '#dc2626' }}>{inlineError}</p>}
        {validationError && <p data-testid="validation-error" style={{ color: '#dc2626' }}>{validationError}</p>}
        {error && <p data-testid="settlement-error" style={{ color: '#dc2626' }}>{error}</p>}

        <div>
          <button type="button" onClick={onClose} disabled={settleMutation.isPending}>
            Cancelar
          </button>
          <button type="submit" disabled={settleMutation.isPending || !isValidAmount} data-testid="settlement-submit">
            {settleMutation.isPending ? `${actionLabel}...` : actionLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
