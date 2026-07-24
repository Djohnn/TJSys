import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'

import { useTenant } from '@/tenant/TenantProvider'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
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
    <div data-testid="receipts-page" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neutral-900">Recebimentos</h2>
        <Button onClick={() => setShowForm(true)} variant="primary">Novo Recebimento</Button>
      </div>

      <Card>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-sm text-neutral-600 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                const value = e.target.value
                const params = new URLSearchParams(searchParams)
                if (value) params.set('status', value)
                else params.delete('status')
                setSearchParams(params)
              }}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm"
            >
              <option value="">Todos</option>
              <option value="draft">Rascunho</option>
              <option value="completed">Concluído</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-neutral-600 mb-1">Pedido (UUID)</label>
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
              className="w-full px-3 py-2 border border-border rounded-lg text-sm"
            />
          </div>
        </div>
      </Card>

      {receipts.length === 0 ? (
        <EmptyState
          title="Nenhum recebimento"
          description="Nenhum recebimento encontrado."
        />
      ) : (
        <Card>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="receipts-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Recebimento #</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Pedido #</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Fornecedor</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Data</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((receipt) => (
                  <tr key={receipt.id} data-testid="receipt-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-3 text-neutral-700">{receipt.id}</td>
                    <td className="px-4 py-3 text-neutral-700">{receipt.order_number}</td>
                    <td className="px-4 py-3 text-neutral-700">{receipt.supplier_name}</td>
                    <td className="px-4 py-3">
                      <Badge variant={receipt.status === 'completed' ? 'success' : receipt.status === 'cancelled' ? 'danger' : 'info'}>
                        {STATUS_LABELS[receipt.status] ?? receipt.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{new Date(receipt.created_at).toLocaleString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
