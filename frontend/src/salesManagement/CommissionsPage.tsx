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

export interface Commission {
  id: string
  sale: string
  sale_number: string
  rule: string
  rule_name: string
  operator: string
  operator_name: string
  status: string
  sale_value: string
  commission_value: string
  notes: string
  approved_at: string | null
  paid_at: string | null
  created_at: string
  updated_at: string
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  approved: 'Aprovada',
  paid: 'Paga',
  cancelled: 'Cancelada',
}

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  pending: 'warning',
  approved: 'success',
  paid: 'success',
  cancelled: 'danger',
}

export default function CommissionsPage() {
  const { selectedTenant } = useTenant()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const tenantId = selectedTenant?.tenant_id ?? ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['commissions', tenantId, page, q],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<Commission>>(`/sales/commissions/?page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}`, {
        tenantId,
        signal,
      }) as Promise<PaginatedResponse<Commission>>,
    enabled: !!tenantId,
  })

  const approveMutation = useMutation({
    mutationFn: (commissionId: string) =>
      apiRequest<unknown>(`/sales/commissions/${commissionId}/approve/`, {
        method: 'POST',
        tenantId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commissions', tenantId] })
    },
  })

  const payMutation = useMutation({
    mutationFn: (commissionId: string) =>
      apiRequest<unknown>(`/sales/commissions/${commissionId}/pay/`, {
        method: 'POST',
        tenantId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commissions', tenantId] })
    },
  })

  const cancelMutation = useMutation({
    mutationFn: (commissionId: string) =>
      apiRequest<unknown>(`/sales/commissions/${commissionId}/cancel/`, {
        method: 'POST',
        tenantId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commissions', tenantId] })
    },
  })

  if (isLoading) return <LoadingState message="Carregando comissões..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar comissões.</p>

  const commissions = data?.results ?? []
  const totalPages = data ? Math.ceil(data.count / 25) : 1

  return (
    <div data-testid="commissions-page" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neutral-900">Comissões</h2>
      </div>

      {commissions.length > 0 && (
        <div className="flex gap-2">
          <input
            type="search"
            placeholder="Buscar por operador..."
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1) }}
            className="w-full max-w-xs px-3 py-2 border border-border rounded-lg text-sm"
            data-testid="commission-search-input"
          />
        </div>
      )}

      {commissions.length === 0 && (
        <EmptyState
          title="Nenhuma comissão"
          description="As comissões aparecerão aqui quando forem geradas."
        />
      )}

      {commissions.length > 0 && (
        <Card>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="commissions-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Venda</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Operador</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Regra</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Valor Venda</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Comissão</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Ações</th>
                </tr>
              </thead>
              <tbody>
                {commissions.map((commission) => (
                  <tr key={commission.id} data-testid="commission-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-3 text-neutral-700 font-medium">{commission.sale_number}</td>
                    <td className="px-4 py-3 text-neutral-700">{commission.operator_name}</td>
                    <td className="px-4 py-3 text-neutral-700">{commission.rule_name}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANTS[commission.status] || 'neutral'}>
                        {STATUS_LABELS[commission.status] || commission.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">R$ {commission.sale_value}</td>
                    <td className="px-4 py-3 text-neutral-700">R$ {commission.commission_value}</td>
                    <td className="px-4 py-3 flex gap-2">
                      {commission.status === 'pending' && (
                        <>
                          <Button
                            onClick={() => approveMutation.mutate(commission.id)}
                            variant="primary"
                            size="sm"
                            disabled={approveMutation.isPending}
                          >
                            Aprovar
                          </Button>
                          <Button
                            onClick={() => cancelMutation.mutate(commission.id)}
                            variant="danger"
                            size="sm"
                            disabled={cancelMutation.isPending}
                          >
                            Cancelar
                          </Button>
                        </>
                      )}
                      {commission.status === 'approved' && (
                        <Button
                          onClick={() => payMutation.mutate(commission.id)}
                          variant="primary"
                          size="sm"
                          disabled={payMutation.isPending}
                        >
                          Pagar
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
