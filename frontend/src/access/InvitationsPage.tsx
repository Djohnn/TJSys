import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import { isApiProblemError } from '@/api/problem'
import type { PaginatedResponse } from '@/organization/organizationApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
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

  if (isLoading) return <LoadingState message="Carregando convites..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar convites.</p>

  const invitations = data?.results ?? []
  const filtered = statusFilter
    ? invitations.filter((inv) => inv.status === statusFilter)
    : invitations

  return (
    <div data-testid="invitations-page">
      <h2>Convites</h2>

      {!showForm && (
        <button onClick={() => setShowForm(true)} type="button">
          Novo Convite
        </button>
      )}

      {showForm && (
        <InvitationForm
          onSubmit={(data) => createMutation.mutate(data)}
          onCancel={() => { setShowForm(false); setSubmitError(null) }}
          isPending={createMutation.isPending}
          submitError={submitError}
          setSubmitError={setSubmitError}
        />
      )}

      <div>
        <label htmlFor="status-filter">Filtrar por status</label>
        <select
          id="status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          data-testid="status-filter"
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
        <table data-testid="invitations-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Função</th>
              <th>Status</th>
              <th>Expira em</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((invitation) => (
              <tr key={invitation.id} data-testid="invitation-row">
                <td>{invitation.email}</td>
                <td>{ROLE_LABELS[invitation.role] ?? invitation.role}</td>
                <td>{STATUS_LABELS[invitation.status] ?? invitation.status}</td>
                <td>{new Date(invitation.expires_at).toLocaleDateString('pt-BR')}</td>
                <td>
                  {invitation.status === 'pending' && (
                    <button
                      onClick={() => resendMutation.mutate(invitation.id)}
                      type="button"
                      disabled={resendMutation.isPending}
                    >
                      Reenviar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
