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
  getDefaultRefundMethod,
  getSaleQueryErrorMessage,
  type RefundMethod,
  type Sale,
} from './salesManagementApi'

interface RefundDialogProps {
  saleId: string
  onClose: () => void
}

function parseMoney(value: string | undefined): Decimal | null {
  if (!value?.trim()) return null
  try {
    const parsed = new Decimal(value.trim().replace(',', '.'))
    return parsed.isFinite() ? parsed : null
  } catch {
    return null
  }
}

function formatMoney(value: Decimal): string {
  return value.toFixed(2).replace('.', ',')
}

export default function RefundDialog({ saleId, onClose }: RefundDialogProps) {
  const { selectedTenant } = useTenant()
  const queryClient = useQueryClient()
  const tenantId = selectedTenant?.tenant_id ?? ''

  const [amount, setAmount] = useState('')
  const [methodSelection, setMethodSelection] = useState<{
    saleId: string
    value: RefundMethod
  } | null>(null)
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
  const method =
    methodSelection?.saleId === saleId
      ? methodSelection.value
      : getDefaultRefundMethod(sale?.payments ?? [])
  const refundableBalance =
    parseMoney(sale?.refundable_balance ?? sale?.total) ?? new Decimal(0)
  const enteredAmount = parseMoney(amount)

  const refundMutation = useMutation({
    mutationFn: () => {
      if (!sale) throw new Error('Sale data is unavailable.')
      const body: { method: RefundMethod; reason: string; amount?: string } = {
        method,
        reason,
      }
      if (enteredAmount?.gt(0)) body.amount = amount.trim()
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
      } else if (err && typeof err === 'object' && 'detail' in err) {
        setError(String((err as { detail: unknown }).detail))
      } else {
        setError('Erro ao processar reembolso.')
      }
    },
  })

  const handleSubmit = () => {
    if (!sale) return
    if (!reason.trim()) {
      setError('O motivo do reembolso é obrigatório.')
      return
    }
    if (
      amount.trim() &&
      (!enteredAmount || enteredAmount.lte(0) || enteredAmount.gt(refundableBalance))
    ) {
      setError('Informe um valor entre R$ 0,01 e o saldo disponível.')
      return
    }
    if (refundMutation.isPending) return
    setError(null)
    refundMutation.mutate()
  }

  if (isLoading) {
    return (
      <Modal
        open
        title="Reembolso"
        onClose={onClose}
        testId="refund-dialog"
        closeLabel="Fechar reembolso"
        actions={
          <Button variant="secondary" onClick={onClose} type="button">
            Fechar
          </Button>
        }
      >
        <p role="status" aria-live="polite" className="text-sm text-neutral-500">
          Carregando dados da venda...
        </p>
      </Modal>
    )
  }

  if (isError || !sale) {
    return (
      <Modal
        open
        title="Reembolso"
        onClose={onClose}
        testId="refund-dialog"
        closeLabel="Fechar reembolso"
        actions={
          <Button variant="secondary" onClick={onClose} type="button">
            Fechar
          </Button>
        }
      >
        <p
          role="alert"
          aria-live="assertive"
          data-testid="refund-error"
          className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700"
        >
          {isError
            ? getSaleQueryErrorMessage(saleError)
            : 'Venda não encontrada ou não está disponível neste tenant.'}
        </p>
      </Modal>
    )
  }

  const displayAmount = enteredAmount
    ? formatMoney(enteredAmount)
    : formatMoney(refundableBalance)
  const hasRefundableBalance = refundableBalance.gt(0)

  return (
    <Modal
      open
      title="Reembolso"
      onClose={onClose}
      testId="refund-dialog"
      closeLabel="Fechar reembolso"
      closeDisabled={refundMutation.isPending}
      actions={
        <>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={refundMutation.isPending}
            type="button"
          >
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={
              refundMutation.isPending ||
              sale.payments.length === 0 ||
              !hasRefundableBalance
            }
            loading={refundMutation.isPending}
            type="button"
          >
            {refundMutation.isPending ? 'Processando...' : 'Confirmar Reembolso'}
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
            data-testid="refund-error"
            className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        {(sale.payments.length === 0 || !hasRefundableBalance) && (
          <p
            role="status"
            data-testid="refund-empty"
            className="p-3 rounded-lg bg-neutral-50 border border-border text-sm text-neutral-600"
          >
            {sale.payments.length === 0
              ? 'Nenhum pagamento disponível para reembolso.'
              : 'Não há saldo disponível para reembolso.'}
          </p>
        )}

        <p
          data-testid="refund-summary"
          className="text-sm text-neutral-600 bg-neutral-50 p-3 rounded-lg border border-border"
        >
          Saldo reembolsável:{' '}
          <strong className="text-neutral-900">R$ {formatMoney(refundableBalance)}</strong>.
          Isso irá gerar um reembolso de{' '}
          <strong className="text-neutral-900">R$ {displayAmount}</strong>
        </p>

        <div>
          <label
            htmlFor="refund-method"
            className="block text-sm font-medium text-neutral-700 mb-1"
          >
            Método do reembolso
          </label>
          <select
            id="refund-method"
            aria-label="Método do reembolso"
            data-testid="refund-method"
            value={method}
            onChange={(event) =>
              setMethodSelection({
                saleId,
                value: event.target.value as RefundMethod,
              })
            }
            className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          >
            <option value="cash">Dinheiro</option>
            <option value="pix">PIX</option>
            <option value="card_external">Cartão externo</option>
          </select>
        </div>

        {sale.payments.length > 1 && (
          <p
            role="status"
            aria-live="polite"
            data-testid="refund-multiple-payments"
            className="text-xs text-neutral-500"
          >
            Esta venda tem múltiplos pagamentos. O primeiro método compatível foi
            selecionado; ajuste-o se necessário.
          </p>
        )}

        <div>
          <label
            htmlFor="refund-amount"
            className="block text-sm font-medium text-neutral-700 mb-1"
          >
            Valor (deixe vazio para reembolso total)
          </label>
          <input
            id="refund-amount"
            type="number"
            step="0.01"
            min="0.01"
            max={sale.refundable_balance}
            data-testid="refund-amount"
            aria-describedby="refund-amount-help"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          />
          <p id="refund-amount-help" className="mt-1 text-xs text-neutral-500">
            Deixe vazio para reembolsar o saldo disponível de R${' '}
            {formatMoney(refundableBalance)}.
          </p>
        </div>

        <div>
          <label
            htmlFor="refund-reason"
            className="block text-sm font-medium text-neutral-700 mb-1"
          >
            Motivo
          </label>
          <textarea
            id="refund-reason"
            data-testid="refund-reason"
            aria-required="true"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm min-h-[80px]"
          />
        </div>
      </div>
    </Modal>
  )
}
