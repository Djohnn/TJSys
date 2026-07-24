import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import { isApiProblemError } from '@/api/problem'
import type { PaginatedResponse } from '@/organization/organizationApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import InvitationForm from './InvitationForm'
import type { InviteFormData } from './accessSchemas'

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  accepted: 'Aceito',
  expired: 'Expirado',
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  manager: 'Gerente',
  operator: 'Operador',
}

interface Invitation {
  id: number
  email: string
  role: string
  status: string
  expires_at: string
  created_at: string
}

export default function InvitationsPage() {
  const { selectedTenant } = useTenant()
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const tenantId = selectedTenant?.tenant_id ?? ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['invitations', tenantId],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<Invitation>>('/invitations/', {
        tenantId,
        signal,
      }) as Promise<PaginatedResponse<Invitation>>,
    enabled: !!tenantId,
  })

  const createMutation = useMutation({
    mutationFn: (body: InviteFormData) =>
      apiRequest<Invitation>('/invitations/', {
        method: 'POST',
        tenantId,
        body,
      }) as Promise<Invitation>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations', tenantId] })
      setShowForm(false)
      setSubmitError(null)
    },
    onError: (err) => {
      if (isApiProblemError(err) && err.problem.errors) {
        const messages = Object.values(err.problem.errors).flat().join(', ')
        setSubmitError(messages || err.problem.detail)
      } else if (isApiProblemError(err)) {
        setSubmitError(err.problem.detail)
      } else {
        setSubmitError('Erro ao criar convite.')
      }
    },
  })

  const resendMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest(`/invitations/${id}/resend/`, {
        method: 'POST',
        tenantId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations', tenantId] })
    },
    onError: (err) => {
      if (isApiProblemError(err)) {
        setSubmitError(err.problem.detail)
      } else {
        setSubmitError('Erro ao reenviar convite.')
      }
    },
  })

  if (isLoading) return <LoadingState />
  if (isError) return <p data-testid="error-state" className="p-4 text-danger">Erro ao carregar convites.</p>

  const invitations = data?.results ?? []
  const filtered = statusFilter
    ? invitations.filter((inv) => inv.status === statusFilter)
    : invitations

  return (
    <div data-testid="invitations-page" className="p-6">
      <Card
        title="Convites"
        actions={
          !showForm && (
            <Button variant="primary" size="sm" onClick={() => setShowForm(true)}>
              Novo Convite
            </Button>
          )
        }
      >
        {showForm && (
          <div className="mb-6">
            <InvitationForm
              onSubmit={(data) => createMutation.mutate(data)}
              onCancel={() => { setShowForm(false); setSubmitError(null) }}
              isPending={createMutation.isPending}
              submitError={submitError}
              setSubmitError={setSubmitError}
            />
          </div>
        )}

        <div className="mb-4 flex items-center gap-2">
          <label htmlFor="status-filter" className="text-sm font-medium text-neutral-700">Filtrar por status</label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            data-testid="status-filter"
            className="px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Todos</option>
            <option value="pending">Pendente</option>
            <option value="accepted">Aceito</option>
            <option value="expired">Expirado</option>
          </select>
        </div>

        {filtered.length === 0 && !showForm && (
          <EmptyState
            title="Nenhum convite"
            description="Convide usuários para fazer parte da organização."
          />
        )}

        {filtered.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="invitations-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600">Email</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600">Função</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600">Expira em</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((invitation) => (
                  <tr key={invitation.id} data-testid="invitation-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-3 text-neutral-700">{invitation.email}</td>
                    <td className="px-4 py-3">
                      <Badge variant="neutral">{ROLE_LABELS[invitation.role] ?? invitation.role}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={invitation.status === 'accepted' ? 'success' : invitation.status === 'pending' ? 'warning' : 'danger'}>
                        {STATUS_LABELS[invitation.status] ?? invitation.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{new Date(invitation.expires_at).toLocaleDateString('pt-BR')}</td>
                    <td className="px-4 py-3">
                      {invitation.status === 'pending' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => resendMutation.mutate(invitation.id)}
                          loading={resendMutation.isPending}
                        >
                          Reenviar
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
