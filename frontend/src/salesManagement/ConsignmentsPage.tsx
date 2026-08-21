import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import { isApiProblemError } from '@/api/problem'
import type { PaginatedResponse } from './catalogApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

export interface ConsignmentItem {
  id: string
  product: string
  product_name: string
  product_sku: string
  quantity: string
  returned_quantity: string
  unit_price: string
  discount: string
  line_total: string
  notes: string
}

export interface Consignment {
  id: string
  branch: string
  branch_name: string
  customer: string
  customer_name: string
  operator: string
  operator_name: string
  status: string
  consignment_number: string
  expected_return_date: string | null
  actual_return_date: string | null
  notes: string
  gross_total: string
  discount_total: string
  net_total: string
  converted_sale: string | null
  items: ConsignmentItem[]
  created_at: string
  updated_at: string
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  active: 'Ativo',
  closed: 'Fechado',
  cancelled: 'Cancelado',
}

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  draft: 'neutral',
  active: 'warning',
  closed: 'success',
  cancelled: 'danger',
}

export default function ConsignmentsPage() {
  const { selectedTenant } = useTenant()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const tenantId = selectedTenant?.tenant_id ?? ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['consignments', tenantId, page, q],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<Consignment>>(`/sales/consignments/?page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}`, {
        tenantId,
        signal,
      }) as Promise<PaginatedResponse<Consignment>>,
    enabled: !!tenantId,
  })

  const convertMutation = useMutation({
    mutationFn: (consignmentId: string) =>
      apiRequest<unknown>(`/sales/consignments/${consignmentId}/convert/`, {
        method: 'POST',
        tenantId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consignments', tenantId] })
    },
  })

  if (isLoading) return <LoadingState message="Carregando consignados..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar consignados.</p>

  const consignments = data?.results ?? []
  const totalPages = data ? Math.ceil(data.count / 25) : 1

  return (
    <div data-testid="consignments-page" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neutral-900">Consignados</h2>
      </div>

      {consignments.length > 0 && (
        <div className="flex gap-2">
          <input
            type="search"
            placeholder="Buscar por número..."
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1) }}
            className="w-full max-w-xs px-3 py-2 border border-border rounded-lg text-sm"
            data-testid="consignment-search-input"
          />
        </div>
      )}

      {consignments.length === 0 && (
        <EmptyState
          title="Nenhum consignado"
          description="Crie um consignado para começar."
        />
      )}

      {consignments.length > 0 && (
        <Card>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="consignments-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Número</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Cliente</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Total</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Previsão Retorno</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Ações</th>
                </tr>
              </thead>
              <tbody>
                {consignments.map((consignment) => (
                  <tr key={consignment.id} data-testid="consignment-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-3 text-neutral-700 font-medium">{consignment.consignment_number}</td>
                    <td className="px-4 py-3 text-neutral-700">{consignment.customer_name}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANTS[consignment.status] || 'neutral'}>
                        {STATUS_LABELS[consignment.status] || consignment.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">R$ {consignment.net_total}</td>
                    <td className="px-4 py-3 text-neutral-700">{consignment.expected_return_date || '-'}</td>
                    <td className="px-4 py-3 flex gap-2">
                      {['draft', 'active'].includes(consignment.status) && (
                        <Button
                          onClick={() => convertMutation.mutate(consignment.id)}
                          variant="primary"
                          size="sm"
                          disabled={convertMutation.isPending}
                        >
                          Converter
                        </Button>
                      )}
                    </td>
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
