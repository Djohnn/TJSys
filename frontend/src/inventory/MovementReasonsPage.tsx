import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import type { PaginatedResponse } from './catalogApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

export interface MovementReason {
  id: string
  name: string
  description: string
  direction: string
  requires_authorization: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

const DIRECTION_LABELS: Record<string, string> = {
  in: 'Entrada',
  out: 'Saída',
  transfer: 'Transferência',
}

const DIRECTION_VARIANTS: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  in: 'success',
  out: 'danger',
  transfer: 'warning',
}

export default function MovementReasonsPage() {
  const { selectedTenant } = useTenant()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const tenantId = selectedTenant?.tenant_id ?? ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['movement-reasons', tenantId, page, q],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<MovementReason>>(`/inventory/movement-reasons/?page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}`, {
        tenantId,
        signal,
      }) as Promise<PaginatedResponse<MovementReason>>,
    enabled: !!tenantId,
  })

  if (isLoading) return <LoadingState message="Carregando motivos de movimentação..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar motivos de movimentação.</p>

  const movementReasons = data?.results ?? []
  const totalPages = data ? Math.ceil(data.count / 25) : 1

  return (
    <div data-testid="movement-reasons-page" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neutral-900">Motivos de Movimentação</h2>
      </div>

      {movementReasons.length > 0 && (
        <div className="flex gap-2">
          <input
            type="search"
            placeholder="Buscar por nome..."
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1) }}
            className="w-full max-w-xs px-3 py-2 border border-border rounded-lg text-sm"
            data-testid="movementreason-search-input"
          />
        </div>
      )}

      {movementReasons.length === 0 && (
        <EmptyState
          title="Nenhum motivo de movimentação"
          description="Crie um motivo de movimentação para começar."
        />
      )}

      {movementReasons.length > 0 && (
        <Card>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="movement-reasons-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Nome</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Direção</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Autorização</th>
                </tr>
              </thead>
              <tbody>
                {movementReasons.map((reason) => (
                  <tr key={reason.id} data-testid="movementreason-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-3 text-neutral-700 font-medium">{reason.name}</td>
                    <td className="px-4 py-3">
                      <Badge variant={DIRECTION_VARIANTS[reason.direction] || 'neutral'}>
                        {DIRECTION_LABELS[reason.direction] || reason.direction}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={reason.is_active ? 'success' : 'danger'}>
                        {reason.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={reason.requires_authorization ? 'warning' : 'neutral'}>
                        {reason.requires_authorization ? 'Sim' : 'Não'}
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
