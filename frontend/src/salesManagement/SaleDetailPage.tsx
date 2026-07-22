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

  return (
    <div data-testid="sale-detail-page">
      <h2>Venda {sale.id}</h2>
      <p>
        <strong>Status:</strong> {sale.status_label} &mdash; <strong>Data:</strong>{' '}
        {new Date(sale.created_at).toLocaleString('pt-BR')}
      </p>
      <p>
        <strong>Filial:</strong> {sale.branch_name} &mdash; <strong>Operador:</strong> {sale.operator_name} &mdash;{' '}
        <strong>Dispositivo:</strong> {sale.device_name}
      </p>
      <p>
        <strong>Cliente:</strong> {sale.customer_name}
      </p>

      <h3>Itens</h3>
      <table data-testid="sale-items-table">
        <thead>
          <tr>
            <th>Produto</th>
            <th>Qtd</th>
            <th>Preço Unit.</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((item) => (
            <tr key={item.id}>
              <td>{item.product_name}</td>
              <td>{item.quantity}</td>
              <td>{item.unit_price}</td>
              <td>{item.total}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Pagamentos</h3>
      <table data-testid="sale-payments-table">
        <thead>
          <tr>
            <th>Método</th>
            <th>Valor</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {sale.payments.map((payment) => (
            <tr key={payment.id}>
              <td>{payment.method_name}</td>
              <td>{payment.amount}</td>
              <td>{payment.status_label}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Referências vinculadas</h3>
      <ul data-testid="linked-ids">
        {sale.linked_stock_movement && <li>Movimento de estoque: {sale.linked_stock_movement}</li>}
        {sale.linked_fiscal_document && <li>Documento fiscal: {sale.linked_fiscal_document}</li>}
        {sale.linked_financial_entries.map((entry) => (
          <li key={entry}>Lançamento financeiro: {entry}</li>
        ))}
      </ul>

      {sale.status === 'completed' && (
        <div data-testid="compensation-actions">
          <button type="button" onClick={() => setActiveDialog('return')}>
            Devolver itens
          </button>
          <button type="button" onClick={() => setActiveDialog('cancel')}>
            Cancelar venda
          </button>
          <button type="button" onClick={() => setActiveDialog('refund')}>
            Reembolsar
          </button>
        </div>
      )}

      <p>
        <Link to="/sales">Voltar para vendas</Link>
      </p>

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
