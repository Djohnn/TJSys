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

interface CancellationDialogProps {
  saleId: string
  onClose: () => void
}

export default function CancellationDialog({ saleId, onClose }: CancellationDialogProps) {
  const { selectedTenant } = useTenant()
  const queryClient = useQueryClient()
  const tenantId = selectedTenant?.tenant_id ?? ''

  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const idempotencyKey = useRef(crypto.randomUUID())

  const { data: sale } = useQuery({
    queryKey: ['sale', tenantId, saleId],
    queryFn: ({ signal }) => apiRequest<Sale>(`/sales/${saleId}/`, { signal, tenantId }),
    enabled: !!tenantId,
  })

  const cancelMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/sales/${saleId}/cancel/`, {
        method: 'POST',
        tenantId,
        body: { reason },
        headers: { 'Idempotency-Key': idempotencyKey.current },
      }),
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
        setError('Erro ao cancelar venda.')
      }
    },
  })

  const handleSubmit = () => {
    if (!reason.trim()) {
      setError('O motivo do cancelamento é obrigatório.')
      return
    }
    setError(null)
    cancelMutation.mutate()
  }

  return (
    <div data-testid="cancel-dialog" role="dialog" aria-modal="true">
      <h3>Cancelar Venda</h3>
      <p>
        Venda: <strong>{sale?.number ?? saleId}</strong>
      </p>

      {error && <p data-testid="cancel-error" style={{ color: 'red' }}>{error}</p>}

      <p data-testid="cancel-summary">
        Isso irá estornar todos os itens e reverter o valor de{' '}
        <strong>R$ {(sale?.total ?? '0,00').replace('.', ',')}</strong>
      </p>

      <div>
        <label htmlFor="cancel-reason">Motivo</label>
        <textarea
          id="cancel-reason"
          data-testid="cancel-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>

      <button onClick={onClose} disabled={cancelMutation.isPending} type="button">
        Voltar
      </button>
      <button
        onClick={handleSubmit}
        disabled={cancelMutation.isPending}
        type="button"
      >
        {cancelMutation.isPending ? 'Cancelando...' : 'Confirmar Cancelamento'}
      </button>
    </div>
  )
}
