import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { getReconciliationBatch } from './paymentsApi'
import type { PaymentReconciliationBatch } from './paymentsApi'
import { useTenant } from '@/tenant/TenantProvider'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'

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
    <div data-testid="reconciliation-batch-detail-page" className="p-6">
      <Card title={`Lote de Conciliação — ${data?.provider ?? ''}`}>
        <p className="mb-4 text-sm text-neutral-700">
          Status: <Badge variant={data?.status === 'confirmed' ? 'success' : 'warning'}>{data?.status === 'confirmed' ? 'Confirmado' : 'Rascunho'}</Badge>
        </p>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table data-testid="batch-items-table" className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 border-b border-border">
                <th className="px-4 py-3 text-left font-semibold text-neutral-600">Referência</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-600">Bruto</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-600">Taxa</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-600">Liquidado</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-600">Diferença</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((item, index) => {
                const hasDifference = Number(item.difference_amount) !== 0
                return (
                  <tr key={item.id} data-testid="batch-item-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-3 text-neutral-700">{item.provider_reference}</td>
                    <td className="px-4 py-3 text-neutral-700 tabular-nums">{formatBRL(item.gross_amount)}</td>
                    <td className="px-4 py-3 text-neutral-700 tabular-nums">{formatBRL(item.fee_amount)}</td>
                    <td className="px-4 py-3 text-neutral-700 tabular-nums">{formatBRL(item.settled_amount)}</td>
                    <td className="px-4 py-3">
                      <span
                        data-testid={`item-difference-${index}`}
                        className={hasDifference ? 'font-semibold' : ''}
                        style={hasDifference ? { color: 'red' } : undefined}
                      >
                        {formatBRL(item.difference_amount)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{item.status}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}