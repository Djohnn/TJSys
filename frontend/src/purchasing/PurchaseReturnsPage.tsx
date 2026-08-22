import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import type { PaginatedResponse } from './purchasingApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

export interface PurchaseReturn {
  id: string
  receipt: string
  receipt_code: string
  purchase_order_code: string
  supplier_name: string
  reason: string
  status: string
  idempotency_key: string
  created_at: string
  updated_at: string
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  completed: 'Concluída',
  cancelled: 'Cancelada',
}

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  draft: 'neutral',
  completed: 'success',
  cancelled: 'danger',
}

export default function PurchaseReturnsPage() {
  const { selectedTenant } = useTenant()
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const tenantId = selectedTenant?.tenant_id ?? ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['supplier-returns', tenantId, page, q],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<PurchaseReturn>>(`/purchasing/supplier-returns/?page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}`, {
        tenantId,
        signal,
      }) as Promise<PaginatedResponse<PurchaseReturn>>,
    enabled: !!tenantId,
  })

  if (isLoading) return <LoadingState message="Carregando devoluções de compra..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar devoluções de compra.</p>

  const returns = data?.results ?? []
  const totalPages = data ? Math.ceil(data.count / 25) : 1

  return (
    <div data-testid="purchase-returns-page" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neutral-900">Devoluções de Compra</h2>
      </div>

      {returns.length > 0 && (
        <div className="flex gap-2">
          <input
            type="search"
            placeholder="Buscar por motivo..."
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1) }}
            className="w-full max-w-xs px-3 py-2 border border-border rounded-lg text-sm"
            data-testid="purchasereturn-search-input"
          />
        </div>
      )}

      {returns.length === 0 && (
        <EmptyState
          title="Nenhuma devolução de compra"
          description="As devoluções aparecerão aqui."
        />
      )}

      {returns.length > 0 && (
        <Card>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="purchase-returns-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Recebimento</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Pedido</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Fornecedor</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Motivo</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Criado em</th>
                </tr>
              </thead>
              <tbody>
                {returns.map((returnItem) => (
                  <tr key={returnItem.id} data-testid="purchasereturn-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-3 text-neutral-700 font-medium">{returnItem.receipt_code}</td>
                    <td className="px-4 py-3 text-neutral-700">{returnItem.purchase_order_code}</td>
                    <td className="px-4 py-3 text-neutral-700">{returnItem.supplier_name}</td>
                    <td className="px-4 py-3 text-neutral-700 max-w-xs truncate">{returnItem.reason}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANTS[returnItem.status] || 'neutral'}>
                        {STATUS_LABELS[returnItem.status] || returnItem.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{new Date(returnItem.created_at).toLocaleDateString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {totalPages > 1 && (
        <nav aria-label="Paginação" className="flex items-center justify-center gap-3">
          <Button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} variant="secondary" size="sm">Anterior</Button>
          <span className="text-sm text-neutral-600">Página {page} de {totalPages}</span>
          <Button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} variant="secondary" size="sm">Próxima</Button>
        </nav>
      )}
    </div>
  )
}
