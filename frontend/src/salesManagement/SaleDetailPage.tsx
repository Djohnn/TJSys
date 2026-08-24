import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'

import { useTenant } from '@/tenant/TenantProvider'
import { isApiProblemError } from '@/api/problem'
import { fetchSale } from './salesManagementApi'
import LoadingState from '@/components/LoadingState'
import ErrorState from '@/errors/ErrorState'
import ReturnDialog from './ReturnDialog'
import CancellationDialog from './CancellationDialog'
import RefundDialog from './RefundDialog'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

export default function SaleDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''
  const [activeDialog, setActiveDialog] = useState<'return' | 'cancel' | 'refund' | null>(null)

  const { data: sale, isLoading, error } = useQuery({
    queryKey: ['sale', tenantId, id],
    queryFn: ({ signal }) => fetchSale(tenantId, id!, signal),
    enabled: !!tenantId && !!id,
    retry: false,
  })

  if (isLoading) return <LoadingState message="Carregando venda..." />

  if (error) {
    const status = isApiProblemError(error) ? error.problem.status : 500
    const correlationId = isApiProblemError(error) ? error.problem.correlationId : undefined
    return <ErrorState status={status} correlationId={correlationId} />
  }

  if (!sale) return null

  const badgeVariant = sale.status === 'completed' ? 'success' : sale.status === 'cancelled' ? 'danger' : 'info'

  return (
    <div data-testid="sale-detail-page">
      <Card>
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-neutral-900">Venda {sale.id}</h2>
            <div className="mt-2 space-y-1 text-sm text-neutral-600">
              <p>
                <span className="font-medium text-neutral-700">Status:</span>{' '}
                <Badge variant={badgeVariant}>{sale.status_label}</Badge>
                {' '}&mdash;{' '}
                <span className="font-medium text-neutral-700">Data:</span>{' '}
                {new Date(sale.created_at).toLocaleString('pt-BR')}
              </p>
              <p>
                <span className="font-medium text-neutral-700">Filial:</span> {sale.branch_name} &mdash;{' '}
                <span className="font-medium text-neutral-700">Operador:</span> {sale.operator_name} &mdash;{' '}
                <span className="font-medium text-neutral-700">Dispositivo:</span> {sale.device_name}
              </p>
              <p>
                <span className="font-medium text-neutral-700">Cliente:</span> {sale.customer_name}
              </p>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-neutral-900 mb-3">Itens</h3>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table data-testid="sale-items-table" className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-50 border-b border-border">
                    <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Produto</th>
                    <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Qtd</th>
                    <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Preço Unit.</th>
                    <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sale.items.map((item) => (
                    <tr key={item.id} className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                      <td className="px-4 py-3 text-neutral-700">{item.product_name}</td>
                      <td className="px-4 py-3 text-neutral-700">{item.quantity}</td>
                      <td className="px-4 py-3 text-neutral-700">{item.unit_price}</td>
                      <td className="px-4 py-3 text-neutral-700">{item.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-neutral-900 mb-3">Pagamentos</h3>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table data-testid="sale-payments-table" className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-50 border-b border-border">
                    <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Método</th>
                    <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Valor</th>
                    <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sale.payments.map((payment) => (
                    <tr key={payment.id} className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                      <td className="px-4 py-3 text-neutral-700">{payment.method_name}</td>
                      <td className="px-4 py-3 text-neutral-700">{payment.amount}</td>
                      <td className="px-4 py-3 text-neutral-700">{payment.status_label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-neutral-900 mb-3">Referências vinculadas</h3>
            <ul data-testid="linked-ids" className="space-y-1 text-sm text-neutral-600 list-disc list-inside">
              {sale.linked_stock_movement && <li>Movimento de estoque: {sale.linked_stock_movement}</li>}
              {sale.linked_fiscal_document && <li>Documento fiscal: {sale.linked_fiscal_document}</li>}
              {sale.linked_financial_entries.map((entry) => (
                <li key={entry}>Lançamento financeiro: {entry}</li>
              ))}
            </ul>
          </div>

          {sale.status === 'completed' && (
            <div data-testid="compensation-actions" className="flex flex-wrap gap-3">
              <Button variant="secondary" type="button" onClick={() => setActiveDialog('return')}>
                Devolver itens
              </Button>
              <Button variant="danger" type="button" onClick={() => setActiveDialog('cancel')}>
                Cancelar venda
              </Button>
              <Button variant="primary" type="button" onClick={() => setActiveDialog('refund')}>
                Reembolsar
              </Button>
            </div>
          )}

          <div className="pt-4 border-t border-border">
            <Link to="/app/sales" className="text-primary-600 hover:text-primary-700 font-medium text-sm">Voltar para vendas</Link>
          </div>
        </div>
      </Card>

      {activeDialog === 'return' && (
        <ReturnDialog saleId={sale.id} onClose={() => setActiveDialog(null)} />
      )}
      {activeDialog === 'cancel' && (
        <CancellationDialog saleId={sale.id} onClose={() => setActiveDialog(null)} />
      )}
      {activeDialog === 'refund' && (
        <RefundDialog saleId={sale.id} onClose={() => setActiveDialog(null)} />
      )}
    </div>
  )
}
