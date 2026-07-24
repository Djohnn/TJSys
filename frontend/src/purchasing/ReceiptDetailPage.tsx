import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'

import { useTenant } from '@/tenant/TenantProvider'
import { isApiProblemError } from '@/api/problem'
import LoadingState from '@/components/LoadingState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { fetchReceiptDetail, cancelReceipt } from './receivingApi'

const STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  completed: 'Concluído',
  cancelled: 'Cancelado',
}

export default function ReceiptDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''
  const queryClient = useQueryClient()
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  const { data: receipt, isLoading } = useQuery({
    queryKey: ['receipt', tenantId, id],
    queryFn: ({ signal }) => fetchReceiptDetail(tenantId!, id!, signal),
    enabled: !!tenantId && !!id,
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelReceipt(tenantId!, id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receipts', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['receipt', tenantId, id] })
      setShowCancelDialog(false)
      setCancelError(null)
    },
    onError: (err) => {
      if (isApiProblemError(err)) {
        setCancelError(err.problem.detail)
      } else {
        setCancelError('Erro ao cancelar recebimento.')
      }
    },
  })

  if (isLoading) return <LoadingState message="Carregando recebimento..." />

  if (!receipt) {
    return <p data-testid="error-state">Recebimento não encontrado.</p>
  }

  return (
    <div data-testid="receipt-detail" className="p-6 space-y-6">
      <h2 className="text-2xl font-bold text-neutral-900">Recebimento #{receipt.id}</h2>

      <Card>
        <div className="space-y-2 text-sm">
          <p className="text-neutral-700"><span className="font-semibold">Pedido:</span> {receipt.order_number}</p>
          <p className="text-neutral-700"><span className="font-semibold">Fornecedor:</span> {receipt.supplier_name}</p>
          <p className="text-neutral-700"><span className="font-semibold">Filial:</span> {receipt.branch_name}</p>
          <p className="text-neutral-700"><span className="font-semibold">Status:</span> <Badge variant={receipt.status === 'completed' ? 'success' : receipt.status === 'cancelled' ? 'danger' : 'info'}>{STATUS_LABELS[receipt.status] ?? receipt.status}</Badge></p>
          <p className="text-neutral-700"><span className="font-semibold">Data:</span> {new Date(receipt.created_at).toLocaleString('pt-BR')}</p>
          <p className="text-neutral-700"><span className="font-semibold">Criado por:</span> {receipt.created_by_name}</p>
        </div>
      </Card>

      <Card title="Itens">
        <div className="overflow-x-auto rounded-lg border border-border">
          <table data-testid="receipt-items-table" className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 border-b border-border">
                <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Produto</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Qtd. Pedida</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Qtd. Recebida</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Unidade</th>
              </tr>
            </thead>
            <tbody>
              {receipt.items.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-neutral-700">{item.product_name}</td>
                  <td className="px-4 py-3 text-neutral-700">{item.ordered_quantity}</td>
                  <td className="px-4 py-3 text-neutral-700">{item.received_quantity}</td>
                  <td className="px-4 py-3 text-neutral-700">{item.unit_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Vínculos">
        <div className="space-y-1 text-sm">
          <p className="text-neutral-700"><span className="font-semibold">Movimento de Estoque:</span> {receipt.linked_stock_movement || 'N/A'}</p>
          <p className="text-neutral-700"><span className="font-semibold">Conta a Pagar:</span> {receipt.linked_payable || 'N/A'}</p>
          <p className="text-neutral-700"><span className="font-semibold">Documento Fiscal:</span> {receipt.linked_fiscal_document || 'N/A'}</p>
        </div>
      </Card>

      {receipt.status === 'completed' && (
        <div>
          <Button onClick={() => setShowCancelDialog(true)} variant="danger">Cancelar Recebimento</Button>
        </div>
      )}

      {showCancelDialog && (
        <div data-testid="cancel-dialog" role="dialog" aria-modal="true" className="p-6 bg-surface rounded-xl border border-border shadow-sm">
          <p className="text-sm text-neutral-700 mb-4">Tem certeza que deseja cancelar este recebimento?</p>
          {cancelError && <p data-testid="cancel-error" className="text-sm text-red-600 mb-4">{cancelError}</p>}
          <div className="flex gap-2">
            <Button onClick={() => setShowCancelDialog(false)} variant="secondary" disabled={cancelMutation.isPending}>Voltar</Button>
            <Button onClick={() => cancelMutation.mutate()} variant="danger" disabled={cancelMutation.isPending} loading={cancelMutation.isPending}>
              {cancelMutation.isPending ? 'Cancelando...' : 'Confirmar Cancelamento'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
