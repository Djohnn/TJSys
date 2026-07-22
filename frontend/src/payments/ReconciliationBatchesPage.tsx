import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { listReconciliationBatches, confirmReconciliationBatch } from './paymentsApi'
import type { PaymentReconciliationBatch, PaginatedResponse } from './paymentsApi'
import { useTenant } from '@/tenant/TenantProvider'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR')
}

export default function ReconciliationBatchesPage() {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.id
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [message, setMessage] = useState('')

  const { data, isLoading, isError } = useQuery<PaginatedResponse<PaymentReconciliationBatch>>({
    queryKey: ['payment-reconciliation-batches', tenantId, page],
    queryFn: () => listReconciliationBatches({ page, tenantId }),
    enabled: !!tenantId,
  })

  const confirmMut = useMutation({
    mutationFn: (id: string) => confirmReconciliationBatch(id, tenantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-reconciliation-batches'] })
      setMessage('Lote confirmado com sucesso.')
    },
    onError: (err: Error) => setMessage(err.message),
  })

  if (isLoading) return <p data-testid="loading-state">Carregando...</p>
  if (isError) return <p data-testid="error-state">Erro ao carregar lotes.</p>

  return (
    <div data-testid="reconciliation-batches-page">
      <h2>Lotes de Conciliação</h2>
      {message && <p data-testid="batch-message">{message}</p>}

      <table data-testid="batches-table">
        <thead>
          <tr><th>Provider</th><th>Status</th><th>Confirmado em</th><th>Ações</th></tr>
        </thead>
        <tbody>
          {data?.results.map(batch => (
            <tr key={batch.id} data-testid="batch-row">
              <td>{batch.provider}</td>
              <td>{batch.status === 'confirmed' ? 'Confirmado' : 'Rascunho'}</td>
              <td>{batch.confirmed_at ? formatDate(batch.confirmed_at) : '-'}</td>
              <td>
                <button
                  type="button"
                  onClick={() => navigate(`/payments/reconciliation-batches/${batch.id}`)}
                  data-testid={`view-batch-${batch.id}`}
                >
                  Ver
                </button>
                {batch.status === 'draft' && (
                  <button
                    type="button"
                    disabled={confirmMut.isPending}
                    onClick={() => confirmMut.mutate(batch.id)}
                    data-testid={`confirm-batch-${batch.id}`}
                  >
                    Confirmar
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div data-testid="pagination">
        {data?.previous && (
          <button type="button" onClick={() => setPage(p => p - 1)} data-testid="prev-page">
            Anterior
          </button>
        )}
        {data?.next && (
          <button type="button" onClick={() => setPage(p => p + 1)} data-testid="next-page">
            Próximo
          </button>
        )}
      </div>
    </div>
  )
}