import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiRequest } from '@/api/client'
import { isApiProblemError } from '@/api/problem'
import { useTenant } from '@/tenant/TenantProvider'

interface Sale {
  id: string
  number: string
  status: string
  customer_name?: string
  branch_name?: string
  total: string
  created_at: string
}

interface RefundDialogProps {
  saleId: string
  onClose: () => void
}

export default function RefundDialog({ saleId, onClose }: RefundDialogProps) {
  const { selectedTenant } = useTenant()
  const queryClient = useQueryClient()
  const tenantId = selectedTenant?.tenant_id ?? ''

  const [amount, setAmount] = useState('')
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
      const body: { reason: string; amount?: string } = { reason }
      const parsed = Number.parseFloat(amount)
      if (amount.trim() && parsed > 0 && parsed < Number.parseFloat(sale?.total ?? '0')) {
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
    setError(null)
    refundMutation.mutate()
  }

  const displayAmount = amount.trim()
    ? Number.parseFloat(amount).toFixed(2).replace('.', ',')
    : (sale?.total ?? '0,00').replace('.', ',')

  return (
    <div data-testid="refund-dialog" role="dialog" aria-modal="true">
      <h3>Reembolso</h3>
      <p>
        Venda: <strong>{sale?.number ?? saleId}</strong>
      </p>

      {error && <p data-testid="refund-error" style={{ color: 'red' }}>{error}</p>}

      <p data-testid="refund-summary">
        Isso irá gerar um reembolso de <strong>R$ {displayAmount}</strong>
      </p>

      <div>
        <label htmlFor="refund-amount">Valor (deixe vazio para reembolso total)</label>
        <input
          id="refund-amount"
          type="number"
          step="0.01"
          min="0"
          data-testid="refund-amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>

      <div>
        <label htmlFor="refund-reason">Motivo</label>
        <textarea
          id="refund-reason"
          data-testid="refund-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>

      <button onClick={onClose} disabled={refundMutation.isPending} type="button">
        Cancelar
      </button>
      <button
        onClick={handleSubmit}
        disabled={refundMutation.isPending}
        type="button"
      >
        {refundMutation.isPending ? 'Processando...' : 'Confirmar Reembolso'}
      </button>
    </div>
  )
}
