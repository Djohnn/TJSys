import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import type { PaginatedResponse } from './catalogApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

export interface CustomerHistoryEntry {
  id: string
  customer: string
  customer_name: string
  event_type: string
  reference_id: string | null
  reference_model: string
  title: string
  description: string
  amount: string | null
  metadata: Record<string, unknown>
  created_by: string | null
  created_by_name: string
  created_at: string
  updated_at: string
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  sale: 'Venda',
  return: 'Devolução',
  payment: 'Pagamento',
  activity: 'Atividade',
  note: 'Nota',
  communication: 'Comunicação',
  opportunity: 'Oportunidade',
}

const EVENT_TYPE_VARIANTS: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  sale: 'success',
  return: 'danger',
  payment: 'success',
  activity: 'warning',
  note: 'neutral',
  communication: 'neutral',
  opportunity: 'warning',
}

export default function CustomerHistoryPage() {
  const { selectedTenant } = useTenant()
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const tenantId = selectedTenant?.tenant_id ?? ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['customer-history', tenantId, page, q],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<CustomerHistoryEntry>>(`/crm/customer-history/?page=${page}${q ? `&customer=${encodeURIComponent(q)}` : ''}`, {
        tenantId,
        signal,
      }) as Promise<PaginatedResponse<CustomerHistoryEntry>>,
    enabled: !!tenantId,
  })

  if (isLoading) return <LoadingState message="Carregando histórico..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar histórico.</p>

  const entries = data?.results ?? []
  const totalPages = data ? Math.ceil(data.count / 25) : 1

  return (
    <div data-testid="customer-history-page" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neutral-900">Histórico do Cliente</h2>
      </div>

      {entries.length > 0 && (
        <div className="flex gap-2">
          <input
            type="search"
            placeholder="Filtrar por cliente..."
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1) }}
            className="w-full max-w-xs px-3 py-2 border border-border rounded-lg text-sm"
            data-testid="history-search-input"
          />
        </div>
      )}

      {entries.length === 0 && (
        <EmptyState
          title="Nenhum registro"
          description="O histórico do cliente aparecerá aqui."
        />
      )}

      {entries.length > 0 && (
        <Card>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="customer-history-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Data</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Tipo</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Título</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Cliente</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Valor</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Criado por</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} data-testid="history-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-3 text-neutral-700">{new Date(entry.created_at).toLocaleDateString('pt-BR')}</td>
                    <td className="px-4 py-3">
                      <Badge variant={EVENT_TYPE_VARIANTS[entry.event_type] || 'neutral'}>
                        {EVENT_TYPE_LABELS[entry.event_type] || entry.event_type}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-neutral-700 font-medium">{entry.title}</td>
                    <td className="px-4 py-3 text-neutral-700">{entry.customer_name}</td>
                    <td className="px-4 py-3 text-neutral-700">{entry.amount ? `R$ ${entry.amount}` : '-'}</td>
                    <td className="px-4 py-3 text-neutral-700">{entry.created_by_name || '-'}</td>
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
