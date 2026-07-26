import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import MemberEditForm from './MemberEditForm'
import { isApiProblemError } from '@/api/problem'
import type { PaginatedResponse } from '@/organization/organizationApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import type { MemberUpdateFormData } from './accessSchemas'

const ROLE_CAPABILITIES: Record<string, string[]> = {
  admin: ['organization.read', 'catalog.view', 'inventory.view', 'sales.view', 'financial.view', 'users.manage', 'users.read'],
  manager: ['organization.read', 'catalog.view', 'inventory.view', 'sales.view', 'financial.view', 'users.read'],
  operator: ['catalog.view', 'inventory.view', 'sales.view'],
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  manager: 'Gerente',
  operator: 'Operador',
}

interface Member {
  id: number
  email?: string
  user?: {
    id: number
    email: string
    name: string
  }
  role: string
  is_active: boolean
  branch_ids?: string[]
}

function hasCapability(role: string, capability: string): boolean {
  const caps = ROLE_CAPABILITIES[role]
  if (!caps) return false
  return caps.includes(capability)
}

export default function MembersPage() {
  const { selectedTenant } = useTenant()
  const queryClient = useQueryClient()
  const [editingId, setEditingId] = useState<number | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const tenantId = selectedTenant?.tenant_id ?? ''
  const currentRole = selectedTenant?.role ?? ''

  const canManage = hasCapability(currentRole, 'users.manage')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['memberships', tenantId],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<Member>>('/memberships/', {
        tenantId,
        signal,
      }) as Promise<PaginatedResponse<Member>>,
    enabled: !!tenantId,
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: MemberUpdateFormData }) =>
      apiRequest<Member>(`/memberships/${id}/`, {
        method: 'PATCH',
        tenantId,
        body,
      }) as Promise<Member>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memberships', tenantId] })
      setEditingId(null)
      setSubmitError(null)
    },
    onError: (err) => {
      if (isApiProblemError(err) && err.problem.errors) {
        const messages = Object.values(err.problem.errors).flat().join(', ')
        setSubmitError(messages || err.problem.detail)
      } else if (isApiProblemError(err)) {
        setSubmitError(err.problem.detail)
      } else {
        setSubmitError('Erro ao atualizar membro.')
      }
    },
  })

  if (isLoading) return <LoadingState />
  if (isError) return <p data-testid="error-state" className="p-4 text-danger">Erro ao carregar membros.</p>

  const members = data?.results ?? []

  return (
    <div data-testid="members-page" className="p-6">
      <Card title="Membros">
        {members.length === 0 && (
          <EmptyState
            title="Nenhum membro"
            description="Convide usuários para fazer parte da organização."
          />
        )}

        {members.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="members-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600">Email</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600">Nome</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600">Função</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600">Filiais</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600">Status</th>
                  {canManage && <th className="px-4 py-3 text-left font-semibold text-neutral-600">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id} data-testid="member-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                    {editingId === member.id ? (
                      <td colSpan={canManage ? 6 : 5} className="px-4 py-3">
                        <MemberEditForm
                          member={member}
                          onSubmit={(data) => updateMutation.mutate({ id: member.id, body: data })}
                          onCancel={() => { setEditingId(null); setSubmitError(null) }}
                          isPending={updateMutation.isPending}
                          submitError={submitError}
                          setSubmitError={setSubmitError}
                        />
                      </td>
                    ) : (
                      <>
                      <td className="px-4 py-3 text-neutral-700">
                        {member.email ?? member.user?.email ?? '-'}
                      </td>
                      <td className="px-4 py-3 text-neutral-500">
                        {member.user?.name ?? '—'}
                      </td>
                        <td className="px-4 py-3">
                          <Badge variant={member.role === 'admin' ? 'info' : member.role === 'manager' ? 'warning' : 'neutral'}>
                            {ROLE_LABELS[member.role] ?? member.role}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-neutral-700">
                          {member.branch_ids?.length ? member.branch_ids.join(', ') : '-'}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={member.is_active ? 'success' : 'danger'}>{member.is_active ? 'Ativo' : 'Inativo'}</Badge>
                        </td>
                        {canManage && (
                          <td className="px-4 py-3">
                            <Button variant="ghost" size="sm" onClick={() => setEditingId(member.id)}>
                              Editar
                            </Button>
                          </td>
                        )}
                      </>
                    )}
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
