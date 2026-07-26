import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { listReconciliationBatches, confirmReconciliationBatch } from './paymentsApi'
import type { PaymentReconciliationBatch, PaginatedResponse } from './paymentsApi'
import { useTenant } from '@/tenant/TenantProvider'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR')
}

export default function ReconciliationBatchesPage() {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id
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
    <div data-testid="reconciliation-batches-page" className="p-6">
      <Card title="Lotes de Conciliação">
        {message && <p data-testid="batch-message" className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">{message}</p>}

        <div className="overflow-x-auto rounded-lg border border-border">
          <table data-testid="batches-table" className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 border-b border-border">
                <th className="px-4 py-3 text-left font-semibold text-neutral-600">Provider</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-600">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-600">Confirmado em</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-600">Ações</th>
              </tr>
            </thead>
            <tbody>
              {data?.results.map(batch => (
                <tr key={batch.id} data-testid="batch-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                  <td className="px-4 py-3 text-neutral-700">{batch.provider}</td>
                  <td className="px-4 py-3">
                    <Badge variant={batch.status === 'confirmed' ? 'success' : 'warning'}>
                      {batch.status === 'confirmed' ? 'Confirmado' : 'Rascunho'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{batch.confirmed_at ? formatDate(batch.confirmed_at) : '-'}</td>
                  <td className="px-4 py-3 flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => navigate(`/payments/reconciliation-batches/${batch.id}`)}
                      data-testid={`view-batch-${batch.id}`}
                    >
                      Ver
                    </Button>
                    {batch.status === 'draft' && (
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={confirmMut.isPending}
                        onClick={() => confirmMut.mutate(batch.id)}
                        data-testid={`confirm-batch-${batch.id}`}
                      >
                        Confirmar
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div data-testid="pagination" className="mt-4 flex items-center gap-2">
          {data?.previous && (
            <Button variant="secondary" size="sm" onClick={() => setPage(p => p - 1)} data-testid="prev-page">
              Anterior
            </Button>
          )}
          {data?.next && (
            <Button variant="secondary" size="sm" onClick={() => setPage(p => p + 1)} data-testid="next-page">
              Próximo
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}
