import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'

import { useTenant } from '@/tenant/TenantProvider'
import { isApiProblemError } from '@/api/problem'
import LoadingState from '@/components/LoadingState'
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
    <div data-testid="receipt-detail">
      <h2>Recebimento #{receipt.id}</h2>
      <p>Pedido: {receipt.order_number}</p>
      <p>Fornecedor: {receipt.supplier_name}</p>
      <p>Filial: {receipt.branch_name}</p>
      <p>Status: {STATUS_LABELS[receipt.status] ?? receipt.status}</p>
      <p>Data: {new Date(receipt.created_at).toLocaleString('pt-BR')}</p>
      <p>Criado por: {receipt.created_by_name}</p>

      <h3>Itens</h3>
      <table data-testid="receipt-items-table">
        <thead>
          <tr>
            <th>Produto</th>
            <th>Qtd. Pedida</th>
            <th>Qtd. Recebida</th>
            <th>Unidade</th>
          </tr>
        </thead>
        <tbody>
          {receipt.items.map((item) => (
            <tr key={item.id}>
              <td>{item.product_name}</td>
              <td>{item.ordered_quantity}</td>
              <td>{item.received_quantity}</td>
              <td>{item.unit_name}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Vínculos</h3>
      {receipt.linked_stock_movement ? (
        <p>Movimento de Estoque: {receipt.linked_stock_movement}</p>
      ) : (
        <p>Movimento de Estoque: N/A</p>
      )}
      {receipt.linked_payable ? (
        <p>Conta a Pagar: {receipt.linked_payable}</p>
      ) : (
        <p>Conta a Pagar: N/A</p>
      )}
      {receipt.linked_fiscal_document ? (
        <p>Documento Fiscal: {receipt.linked_fiscal_document}</p>
      ) : (
        <p>Documento Fiscal: N/A</p>
      )}

      {receipt.status === 'completed' && (
        <div>
          <button onClick={() => setShowCancelDialog(true)} type="button">
            Cancelar Recebimento
          </button>
        </div>
      )}

      {showCancelDialog && (
        <div data-testid="cancel-dialog" role="dialog" aria-modal="true">
          <p>Tem certeza que deseja cancelar este recebimento?</p>
          {cancelError && <p data-testid="cancel-error">{cancelError}</p>}
          <button onClick={() => setShowCancelDialog(false)} disabled={cancelMutation.isPending} type="button">
            Voltar
          </button>
          <button onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending} type="button">
            {cancelMutation.isPending ? 'Cancelando...' : 'Confirmar Cancelamento'}
          </button>
        </div>
      )}
    </div>
  )
}
