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

export interface BankReconciliation {
  id: string
  account: string
  account_name: string
  statement_date: string
  statement_balance: string
  system_balance: string
  difference: string
  status: string
  notes: string
  reconciled_by: string | null
  reconciled_by_name: string
  reconciled_at: string | null
  created_at: string
  updated_at: string
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  matched: 'Conciliado',
  partial: 'Parcial',
  cancelled: 'Cancelado',
}

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  pending: 'neutral',
  matched: 'success',
  partial: 'warning',
  cancelled: 'danger',
}

export default function BankReconciliationPage() {
  const { selectedTenant } = useTenant()
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const tenantId = selectedTenant?.tenant_id ?? ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['bank-reconciliations', tenantId, page, q],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<BankReconciliation>>(`/financial/bank-reconciliations/?page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}`, {
        tenantId,
        signal,
      }) as Promise<PaginatedResponse<BankReconciliation>>,
    enabled: !!tenantId,
  })

  if (isLoading) return <LoadingState message="Carregando conciliações bancárias..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar conciliações bancárias.</p>

  const reconciliations = data?.results ?? []
  const totalPages = data ? Math.ceil(data.count / 25) : 1

  return (
    <div data-testid="bank-reconciliation-page" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neutral-900">Conciliação Bancária</h2>
      </div>

      {reconciliations.length > 0 && (
        <div className="flex gap-2">
          <input
            type="search"
            placeholder="Buscar por conta..."
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1) }}
            className="w-full max-w-xs px-3 py-2 border border-border rounded-lg text-sm"
            data-testid="bankreconciliation-search-input"
          />
        </div>
      )}

      {reconciliations.length === 0 && (
        <EmptyState
          title="Nenhuma conciliação bancária"
          description="Crie uma conciliação para começar."
        />
      )}

      {reconciliations.length > 0 && (
        <Card>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="bank-reconciliations-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Conta</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Data</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Saldo Extrato</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Saldo Sistema</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Diferença</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody>
                {reconciliations.map((reconciliation) => (
                  <tr key={reconciliation.id} data-testid="bankreconciliation-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-3 text-neutral-700 font-medium">{reconciliation.account_name}</td>
                    <td className="px-4 py-3 text-neutral-700">{new Date(reconciliation.statement_date).toLocaleDateString('pt-BR')}</td>
                    <td className="px-4 py-3 text-neutral-700">
                      {parseFloat(reconciliation.statement_balance).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className="px-4 py-3 text-neutral-700">
                      {parseFloat(reconciliation.system_balance).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-medium ${parseFloat(reconciliation.difference) === 0 ? 'text-success' : 'text-danger'}`}>
                        {parseFloat(reconciliation.difference).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANTS[reconciliation.status] || 'neutral'}>
                        {STATUS_LABELS[reconciliation.status] || reconciliation.status}
                      </Badge>
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
