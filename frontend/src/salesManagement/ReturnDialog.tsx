import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Decimal from 'decimal.js'

import { apiRequest } from '@/api/client'
import { isApiProblemError } from '@/api/problem'
import { useTenant } from '@/tenant/TenantProvider'

interface SaleItem {
  id: string
  product: string
  product_name: string
  quantity: string
  unit_price: string
  total: string
}

interface Sale {
  id: string
  number: string
  status: string
  customer_name?: string
  branch_name?: string
  total: string
  created_at: string
  items: SaleItem[]
}

interface ReturnDialogProps {
  saleId: string
  onClose: () => void
}

export default function ReturnDialog({ saleId, onClose }: ReturnDialogProps) {
  const { selectedTenant } = useTenant()
  const queryClient = useQueryClient()
  const tenantId = selectedTenant?.tenant_id ?? ''

  const [selectedQtys, setSelectedQtys] = useState<Record<string, string>>({})
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const idempotencyKey = useRef(crypto.randomUUID())

  const { data: sale, isLoading } = useQuery({
    queryKey: ['sale', tenantId, saleId],
    queryFn: ({ signal }) => apiRequest<Sale>(`/sales/${saleId}/`, { signal, tenantId }) as Promise<Sale>,
    enabled: !!tenantId,
  })

  const returnMutation = useMutation({
    mutationFn: () => {
      const items = sale!.items
        .filter((item) => {
          const qty = Number.parseFloat(selectedQtys[item.product] ?? '0')
          return qty > 0
        })
        .map((item) => ({
          product: item.product,
          quantity: selectedQtys[item.product]!,
        }))

      return apiRequest(`/sales/${saleId}/return/`, {
        method: 'POST',
        tenantId,
        body: { items, reason },
        headers: { 'Idempotency-Key': idempotencyKey.current },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sale', tenantId, saleId] })
      queryClient.invalidateQueries({ queryKey: ['sales', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['inventory', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['financial', tenantId] })
      onClose()
    },
    onError: (err) => {
      if (isApiProblemError(err)) {
        setError(err.problem.detail)
      } else {
        setError('Erro ao processar devolução.')
      }
    },
  })

  const handleSubmit = () => {
    const hasItems = sale!.items.some((item) => {
      const qty = Number.parseFloat(selectedQtys[item.product] ?? '0')
      return qty > 0
    })
    if (!hasItems) {
      setError('Selecione pelo menos um item para devolver.')
      return
    }
    if (!reason.trim()) {
      setError('O motivo da devolução é obrigatório.')
      return
    }
    setError(null)
    returnMutation.mutate()
  }

  const totalQty = sale?.items.reduce((acc, item) => {
    const qty = Number.parseFloat(selectedQtys[item.product] ?? '0')
    return acc + (qty > 0 ? qty : 0)
  }, 0) ?? 0

  const totalCredit = sale?.items.reduce((acc, item) => {
    const qty = new Decimal(selectedQtys[item.product] ?? '0')
    if (qty.isZero() || qty.isNegative()) return acc
    return acc.plus(qty.mul(item.unit_price))
  }, new Decimal(0)) ?? new Decimal(0)

  if (isLoading) {
    return (
      <div data-testid="return-dialog" role="dialog" aria-modal="true">
        <p>Carregando itens da venda...</p>
      </div>
    )
  }

  return (
    <div data-testid="return-dialog" role="dialog" aria-modal="true">
      <h3>Devolução de Itens</h3>
      <p>
        Venda: <strong>{sale?.number}</strong>
      </p>

      {error && <p data-testid="return-error" style={{ color: 'red' }}>{error}</p>}

      {sale && sale.items.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Produto</th>
              <th>Quantidade</th>
              <th>Devolver</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item) => (
              <tr key={item.id}>
                <td>{item.product_name}</td>
                <td>{item.quantity}</td>
                <td>
                  <input
                    type="number"
                    min="0"
                    max={item.quantity}
                    step="1"
                    data-testid={`return-qty-${item.product}`}
                    value={selectedQtys[item.product] ?? ''}
                    onChange={(e) =>
                      setSelectedQtys((prev) => ({
                        ...prev,
                        [item.product]: e.target.value,
                      }))
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {(totalQty > 0 || !totalCredit.isZero()) && (
        <p data-testid="return-summary">
          Isso irá reduzir o estoque em {totalQty} unidades e gerar um crédito de R$ {totalCredit.toFixed(2)}
        </p>
      )}

      <div>
        <label htmlFor="return-reason">Motivo</label>
        <textarea
          id="return-reason"
          data-testid="return-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>

      <button onClick={onClose} disabled={returnMutation.isPending} type="button">
        Cancelar
      </button>
      <button
        onClick={handleSubmit}
        disabled={returnMutation.isPending}
        type="button"
      >
        {returnMutation.isPending ? 'Processando...' : 'Confirmar'}
      </button>
    </div>
  )
}
