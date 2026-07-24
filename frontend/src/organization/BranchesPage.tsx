import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import { isApiProblemError } from '@/api/problem'
import type { PaginatedResponse, Branch } from './organizationApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import BranchForm from './BranchForm'
import type { BranchFormData } from './organizationSchemas'

export default function BranchesPage() {
  const { selectedTenant } = useTenant()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const tenantId = selectedTenant?.tenant_id ?? ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['branches', tenantId, page],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<Branch>>(`/branches/?page=${page}`, {
        tenantId,
        signal,
      }) as Promise<PaginatedResponse<Branch>>,
    enabled: !!tenantId,
  })

  const createMutation = useMutation({
    mutationFn: (body: BranchFormData) =>
      apiRequest<Branch>('/branches/', {
        method: 'POST',
        tenantId,
        body,
      }) as Promise<Branch>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches', tenantId] })
      setShowForm(false)
      setSubmitError(null)
    },
    onError: (err) => {
      if (isApiProblemError(err) && err.problem.errors) {
        setSubmitError(Object.values(err.problem.errors).flat().join(', '))
      } else if (isApiProblemError(err)) {
        setSubmitError(err.problem.detail)
      } else {
        setSubmitError('Erro ao criar filial.')
      }
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: BranchFormData }) =>
      apiRequest<Branch>(`/branches/${id}/`, {
        method: 'PATCH',
        tenantId,
        body,
      }) as Promise<Branch>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches', tenantId] })
      setEditingId(null)
      setSubmitError(null)
    },
    onError: (err) => {
      if (isApiProblemError(err) && err.problem.errors) {
        setSubmitError(Object.values(err.problem.errors).flat().join(', '))
      } else if (isApiProblemError(err)) {
        setSubmitError(err.problem.detail)
      } else {
        setSubmitError('Erro ao atualizar filial.')
      }
    },
  })

  if (isLoading) return <LoadingState />
  if (isError) return <p data-testid="error-state" className="p-4 text-danger">Erro ao carregar filiais.</p>

  const branches = data?.results ?? []
  const totalPages = data ? Math.ceil(data.count / 25) : 1

  return (
    <div data-testid="branches-page" className="p-6">
      <Card
        title="Filiais"
        actions={
          !showForm && branches.length > 0 && (
            <Button variant="primary" size="sm" onClick={() => setShowForm(true)}>
              Nova Filial
            </Button>
          )
        }
      >
        {showForm && (
          <div className="mb-6">
            <BranchForm
              onSubmit={(data) => createMutation.mutate(data)}
              onCancel={() => { setShowForm(false); setSubmitError(null) }}
              isPending={createMutation.isPending}
              submitError={submitError}
              setSubmitError={setSubmitError}
            />
          </div>
        )}

        {branches.length === 0 && !showForm && (
          <EmptyState
            title="Nenhuma filial"
            description="Crie sua primeira filial para começar."
            action={
              <Button variant="primary" onClick={() => setShowForm(true)}>
                Criar Filial
              </Button>
            }
          />
        )}

        {branches.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="branches-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600">Nome</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600">Empresa</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600">IE</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600">Ações</th>
                </tr>
              </thead>
              <tbody>
                {branches.map((branch) => (
                  <tr key={branch.id} data-testid="branch-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                    {editingId === branch.id ? (
                      <>
                        <td colSpan={5} className="px-4 py-3">
                          <BranchForm
                            initialData={{ company: branch.company, name: branch.name, ie: branch.ie, is_active: branch.is_active }}
                            onSubmit={(data) => updateMutation.mutate({ id: branch.id, body: data })}
                            onCancel={() => { setEditingId(null); setSubmitError(null) }}
                            isPending={updateMutation.isPending}
                            submitError={submitError}
                            setSubmitError={setSubmitError}
                          />
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-neutral-700">{branch.name}</td>
                        <td className="px-4 py-3 text-neutral-700">{branch.company_name}</td>
                        <td className="px-4 py-3 text-neutral-700">{branch.ie || '-'}</td>
                        <td className="px-4 py-3">
                          <Badge variant={branch.is_active ? 'success' : 'danger'}>{branch.is_active ? 'Ativo' : 'Inativo'}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Button variant="ghost" size="sm" onClick={() => setEditingId(branch.id)}>
                            Editar
                          </Button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <nav aria-label="Paginação" className="flex items-center justify-center gap-4 mt-6">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </Button>
            <span className="text-sm text-text-muted">Página {page} de {totalPages}</span>
            <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Próxima
            </Button>
          </nav>
        )}
      </Card>
    </div>
  )
}
