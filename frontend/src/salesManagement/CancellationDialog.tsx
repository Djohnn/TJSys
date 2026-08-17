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

interface CancellationDialogProps {
  saleId: string
  onClose: () => void
}

function formatMoney(value: string): string {
  try {
    return new Decimal(value).toFixed(2).replace('.', ',')
  } catch {
    return value.replace('.', ',')
  }
}

export default function CancellationDialog({
  saleId,
  onClose,
}: CancellationDialogProps) {
  const { selectedTenant } = useTenant()
  const queryClient = useQueryClient()
  const tenantId = selectedTenant?.tenant_id ?? ''

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
      setError(
        isApiProblemError(err) ? err.problem.detail : 'Erro ao cancelar venda.',
      )
    },
  })

  const handleSubmit = () => {
    if (!sale) return
    if (!reason.trim()) {
      setError('O motivo do cancelamento é obrigatório.')
      return
    }
    if (cancelMutation.isPending) return
    setError(null)
    cancelMutation.mutate()
  }

  if (isLoading) {
    return (
      <Modal
        open
        title="Cancelar Venda"
        onClose={onClose}
        testId="cancel-dialog"
        closeLabel="Fechar cancelamento"
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
        title="Cancelar Venda"
        onClose={onClose}
        testId="cancel-dialog"
        closeLabel="Fechar cancelamento"
        actions={
          <Button variant="secondary" onClick={onClose} type="button">
            Fechar
          </Button>
        }
      >
        <p
          role="alert"
          aria-live="assertive"
          data-testid="cancel-error"
          className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700"
        >
          {isError
            ? getSaleQueryErrorMessage(saleError)
            : 'Venda não encontrada ou não está disponível neste tenant.'}
        </p>
      </Modal>
    )
  }

  return (
    <Modal
      open
      title="Cancelar Venda"
      onClose={onClose}
      testId="cancel-dialog"
      closeLabel="Fechar cancelamento"
      closeDisabled={cancelMutation.isPending}
      actions={
        <>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={cancelMutation.isPending}
            type="button"
          >
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
            data-testid="cancel-error"
            className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        <p
          data-testid="cancel-summary"
          className="text-sm text-neutral-600 bg-neutral-50 p-3 rounded-lg border border-border"
        >
          Isso irá estornar todos os itens e reverter o valor de{' '}
          <strong className="text-neutral-900">R$ {formatMoney(sale.total)}</strong>
        </p>

        <div>
          <label
            htmlFor="cancel-reason"
            className="block text-sm font-medium text-neutral-700 mb-1"
          >
            Motivo
          </label>
          <textarea
            id="cancel-reason"
            data-testid="cancel-reason"
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
