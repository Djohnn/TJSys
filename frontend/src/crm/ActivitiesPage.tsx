import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import type { PaginatedResponse } from './crmApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

export interface ActivityType {
  id: string
  name: string
  description: string
  color: string
  icon: string
  is_active: boolean
}

export interface Activity {
  id: string
  activity_type: string
  activity_type_name: string
  customer: string
  customer_name: string
  opportunity: string | null
  opportunity_title: string
  assigned_to: string | null
  assigned_to_name: string
  title: string
  description: string
  status: string
  due_date: string | null
  completed_at: string | null
  notes: string
  reminder_date: string | null
  is_recurring: boolean
  recurrence_interval: string
  created_at: string
  updated_at: string
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  completed: 'Concluída',
  cancelled: 'Cancelada',
}

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  pending: 'warning',
  completed: 'success',
  cancelled: 'danger',
}

export default function ActivitiesPage() {
  const { selectedTenant } = useTenant()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const tenantId = selectedTenant?.tenant_id ?? ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['activities', tenantId, page, q],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<Activity>>(`/crm/activities/?page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}`, {
        tenantId,
        signal,
      }) as Promise<PaginatedResponse<Activity>>,
    enabled: !!tenantId,
  })

  const completeMutation = useMutation({
    mutationFn: (activityId: string) =>
      apiRequest<unknown>(`/crm/activities/${activityId}/complete/`, {
        method: 'POST',
        tenantId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activities', tenantId] })
    },
  })

  const cancelMutation = useMutation({
    mutationFn: (activityId: string) =>
      apiRequest<unknown>(`/crm/activities/${activityId}/cancel/`, {
        method: 'POST',
        tenantId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activities', tenantId] })
    },
  })

  if (isLoading) return <LoadingState message="Carregando atividades..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar atividades.</p>

  const activities = data?.results ?? []
  const totalPages = data ? Math.ceil(data.count / 25) : 1

  return (
    <div data-testid="activities-page" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neutral-900">Atividades</h2>
      </div>

      {activities.length > 0 && (
        <div className="flex gap-2">
          <input
            type="search"
            placeholder="Buscar por título..."
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1) }}
            className="w-full max-w-xs px-3 py-2 border border-border rounded-lg text-sm"
            data-testid="activity-search-input"
          />
        </div>
      )}

      {activities.length === 0 && (
        <EmptyState
          title="Nenhuma atividade"
          description="Crie uma atividade para começar."
        />
      )}

      {activities.length > 0 && (
        <Card>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="activities-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Título</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Tipo</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Cliente</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Vencimento</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Atribuído</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Ações</th>
                </tr>
              </thead>
              <tbody>
                {activities.map((activity) => (
                  <tr key={activity.id} data-testid="activity-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-3 text-neutral-700 font-medium">{activity.title}</td>
                    <td className="px-4 py-3 text-neutral-700">{activity.activity_type_name}</td>
                    <td className="px-4 py-3 text-neutral-700">{activity.customer_name}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANTS[activity.status] || 'neutral'}>
                        {STATUS_LABELS[activity.status] || activity.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{activity.due_date || '-'}</td>
                    <td className="px-4 py-3 text-neutral-700">{activity.assigned_to_name || '-'}</td>
                    <td className="px-4 py-3 flex gap-2">
                      {activity.status === 'pending' && (
                        <>
                          <Button
                            onClick={() => completeMutation.mutate(activity.id)}
                            variant="primary"
                            size="sm"
                            disabled={completeMutation.isPending}
                          >
                            Concluir
                          </Button>
                          <Button
                            onClick={() => cancelMutation.mutate(activity.id)}
                            variant="danger"
                            size="sm"
                            disabled={cancelMutation.isPending}
                          >
                            Cancelar
                          </Button>
                        </>
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
