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
    <div data-testid="cancel-dialog" role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-surface rounded-xl shadow-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-lg font-semibold text-neutral-900">Cancelar Venda</h3>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-600 text-xl leading-none">&times;</button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-neutral-600">
            Venda: <strong className="text-neutral-900">{sale?.number ?? saleId}</strong>
          </p>

          {error && (
            <div data-testid="cancel-error" className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          <p data-testid="cancel-summary" className="text-sm text-neutral-600 bg-neutral-50 p-3 rounded-lg border border-border">
            Isso irá estornar todos os itens e reverter o valor de{' '}
            <strong className="text-neutral-900">R$ {(sale?.total ?? '0,00').replace('.', ',')}</strong>
          </p>

          <div>
            <label htmlFor="cancel-reason" className="block text-sm font-medium text-neutral-700 mb-1">Motivo</label>
            <textarea
              id="cancel-reason"
              data-testid="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm min-h-[80px]"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border bg-neutral-50 rounded-b-xl">
          <Button variant="secondary" onClick={onClose} disabled={cancelMutation.isPending} type="button">
            Voltar
          </Button>
          <Button
            variant="danger"
            onClick={handleSubmit}
            disabled={cancelMutation.isPending}
            loading={cancelMutation.isPending}
            type="button"
          >
            {cancelMutation.isPending ? 'Cancelando...' : 'Confirmar Cancelamento'}
          </Button>
        </div>
      </div>
    </div>
  )
}
