import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'

import { useTenant } from '@/tenant/TenantProvider'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import { fetchReceipts } from './receivingApi'
import ReceiptForm from './ReceiptForm'

const STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  completed: 'Concluído',
  cancelled: 'Cancelado',
}

export default function PurchaseReceiptPage() {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''
  const [searchParams, setSearchParams] = useSearchParams()
  const statusFilter = searchParams.get('status') || ''
  const orderFilter = searchParams.get('order') || ''
  const [showForm, setShowForm] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['receipts', tenantId, statusFilter, orderFilter],
    queryFn: ({ signal }) =>
      fetchReceipts(tenantId, { status: statusFilter || undefined, order: orderFilter || undefined }, signal),
    enabled: !!tenantId,
  })

  if (isLoading) return <LoadingState message="Carregando recebimentos..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar recebimentos.</p>

  const receipts = data?.results ?? []

  if (showForm) {
    return <ReceiptForm onSuccess={() => setShowForm(false)} onCancel={() => setShowForm(false)} />
  }

  return (
    <div data-testid="receipts-page">
      <h2>Recebimentos</h2>

      <div>
        <button onClick={() => setShowForm(true)} type="button">
          Novo Recebimento
        </button>
      </div>

      <div>
        <label>
          Status:
          <select
            value={statusFilter}
            onChange={(e) => {
              const value = e.target.value
              const params = new URLSearchParams(searchParams)
              if (value) params.set('status', value)
              else params.delete('status')
              setSearchParams(params)
            }}
          >
            <option value="">Todos</option>
            <option value="draft">Rascunho</option>
            <option value="completed">Concluído</option>
            <option value="cancelled">Cancelado</option>
          </select>
        </label>

        <label>
          Pedido (UUID):
          <input
            type="text"
            value={orderFilter}
            onChange={(e) => {
              const value = e.target.value
              const params = new URLSearchParams(searchParams)
              if (value) params.set('order', value)
              else params.delete('order')
              setSearchParams(params)
            }}
          />
        </label>
      </div>

      {receipts.length === 0 ? (
        <EmptyState
          title="Nenhum recebimento"
          description="Nenhum recebimento encontrado."
        />
      ) : (
        <table data-testid="receipts-table">
          <thead>
            <tr>
              <th>Recebimento #</th>
              <th>Pedido #</th>
              <th>Fornecedor</th>
              <th>Status</th>
              <th>Data</th>
            </tr>
          </thead>
          <tbody>
            {receipts.map((receipt) => (
              <tr key={receipt.id} data-testid="receipt-row">
                <td>{receipt.id}</td>
                <td>{receipt.order_number}</td>
                <td>{receipt.supplier_name}</td>
                <td>{STATUS_LABELS[receipt.status] ?? receipt.status}</td>
                <td>{new Date(receipt.created_at).toLocaleString('pt-BR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
