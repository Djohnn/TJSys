import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import type { PaginatedResponse } from './salesManagementApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

export interface QuoteItem {
  id: string
  product: string
  product_name: string
  product_sku: string
  quantity: string
  unit_price: string
  discount: string
  notes: string
}

export interface Quote {
  id: string
  branch: string
  branch_name: string
  customer: string | null
  customer_name: string
  operator: string
  operator_name: string
  status: string
  quote_number: string
  valid_until: string | null
  notes: string
  gross_total: string
  discount_total: string
  net_total: string
  converted_sale: string | null
  items: QuoteItem[]
  created_at: string
  updated_at: string
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  sent: 'Enviado',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
  converted: 'Convertido',
  expired: 'Expirado',
}

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  draft: 'neutral',
  sent: 'warning',
  approved: 'success',
  rejected: 'danger',
  converted: 'success',
  expired: 'neutral',
}

export default function QuotesPage() {
  const { selectedTenant } = useTenant()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const tenantId = selectedTenant?.tenant_id ?? ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['quotes', tenantId, page, q],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<Quote>>(`/sales/quotes/?page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}`, {
        tenantId,
        signal,
      }) as Promise<PaginatedResponse<Quote>>,
    enabled: !!tenantId,
  })

  const convertMutation = useMutation({
    mutationFn: (quoteId: string) =>
      apiRequest<unknown>(`/sales/quotes/${quoteId}/convert/`, {
        method: 'POST',
        tenantId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes', tenantId] })
    },
  })

  if (isLoading) return <LoadingState message="Carregando orçamentos..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar orçamentos.</p>

  const quotes = data?.results ?? []
  const totalPages = data ? Math.ceil(data.count / 25) : 1

  return (
    <div data-testid="quotes-page" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neutral-900">Orçamentos</h2>
      </div>

      {quotes.length > 0 && (
        <div className="flex gap-2">
          <input
            type="search"
            placeholder="Buscar por número..."
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1) }}
            className="w-full max-w-xs px-3 py-2 border border-border rounded-lg text-sm"
            data-testid="quote-search-input"
          />
        </div>
      )}

      {quotes.length === 0 && (
        <EmptyState
          title="Nenhum orçamento"
          description="Crie um orçamento para começar."
        />
      )}

      {quotes.length > 0 && (
        <Card>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="quotes-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Número</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Cliente</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Total</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Validade</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Ações</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((quote) => (
                  <tr key={quote.id} data-testid="quote-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-3 text-neutral-700 font-medium">{quote.quote_number}</td>
                    <td className="px-4 py-3 text-neutral-700">{quote.customer_name || 'Sem cliente'}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANTS[quote.status] || 'neutral'}>
                        {STATUS_LABELS[quote.status] || quote.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">R$ {quote.net_total}</td>
                    <td className="px-4 py-3 text-neutral-700">{quote.valid_until || '-'}</td>
                    <td className="px-4 py-3 flex gap-2">
                      {['draft', 'sent', 'approved'].includes(quote.status) && (
                        <Button
                          onClick={() => convertMutation.mutate(quote.id)}
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
