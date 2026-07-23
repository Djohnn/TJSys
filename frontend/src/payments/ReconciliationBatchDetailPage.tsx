import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { getReconciliationBatch } from './paymentsApi'
import type { PaymentReconciliationBatch } from './paymentsApi'
import { useTenant } from '@/tenant/TenantProvider'

function formatBRL(value: string): string {
  const num = Number(value)
  if (isNaN(num)) return value
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num)
}

export default function ReconciliationBatchDetailPage() {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.id
  const { id } = useParams<{ id: string }>()

  const { data, isLoading, isError } = useQuery<PaymentReconciliationBatch>({
    queryKey: ['payment-reconciliation-batch', tenantId, id],
    queryFn: () => getReconciliationBatch(id!, tenantId),
    enabled: !!tenantId && !!id,
  })

  if (isLoading) return <p data-testid="loading-state">Carregando...</p>
  if (isError) return <p data-testid="error-state">Erro ao carregar lote.</p>

  return (
    <div data-testid="reconciliation-batch-detail-page">
      <h2>Lote de Conciliação — {data?.provider}</h2>
      <p>Status: {data?.status === 'confirmed' ? 'Confirmado' : 'Rascunho'}</p>

      <table data-testid="batch-items-table">
        <thead>
          <tr>
            <th>Referência</th>
            <th>Bruto</th>
            <th>Taxa</th>
            <th>Liquidado</th>
            <th>Diferença</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {data?.items.map((item, index) => {
            const hasDifference = Number(item.difference_amount) !== 0
            return (
              <tr key={item.id} data-testid="batch-item-row">
                <td>{item.provider_reference}</td>
                <td>{formatBRL(item.gross_amount)}</td>
                <td>{formatBRL(item.fee_amount)}</td>
                <td>{formatBRL(item.settled_amount)}</td>
                <td>
                  <span
                    data-testid={`item-difference-${index}`}
                    style={hasDifference ? { color: 'red' } : undefined}
                  >
                    {formatBRL(item.difference_amount)}
                  </span>
                </td>
                <td>{item.status}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}