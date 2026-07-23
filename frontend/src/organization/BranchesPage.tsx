import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import { isApiProblemError } from '@/api/problem'
import type { PaginatedResponse, Branch } from './organizationApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
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

  if (isLoading) return <LoadingState message="Carregando filiais..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar filiais.</p>

  const branches = data?.results ?? []
  const totalPages = data ? Math.ceil(data.count / 25) : 1

  return (
    <div data-testid="branches-page">
      <h2>Filiais</h2>

      {!showForm && branches.length > 0 && (
        <button onClick={() => setShowForm(true)} type="button">
          Nova Filial
        </button>
      )}

      {showForm && (
        <BranchForm
          onSubmit={(data) => createMutation.mutate(data)}
          onCancel={() => { setShowForm(false); setSubmitError(null) }}
          isPending={createMutation.isPending}
          submitError={submitError}
          setSubmitError={setSubmitError}
        />
      )}

      {branches.length === 0 && !showForm && (
        <EmptyState
          title="Nenhuma filial"
          description="Crie sua primeira filial para começar."
          action={
            <button onClick={() => setShowForm(true)} type="button">
              Criar Filial
            </button>
          }
        />
      )}

      {branches.length > 0 && (
        <table data-testid="branches-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Empresa</th>
              <th>IE</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {branches.map((branch) => (
              <tr key={branch.id} data-testid="branch-row">
                {editingId === branch.id ? (
                  <>
                    <td colSpan={5}>
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
                    <td>{branch.name}</td>
                    <td>{branch.company_name}</td>
                    <td>{branch.ie || '-'}</td>
                    <td>{branch.is_active ? 'Ativo' : 'Inativo'}</td>
                    <td>
                      <button onClick={() => setEditingId(branch.id)} type="button">
                        Editar
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {totalPages > 1 && (
        <nav aria-label="Paginação">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} type="button">
            Anterior
          </button>
          <span>Página {page} de {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} type="button">
            Próxima
          </button>
        </nav>
      )}
    </div>
  )
}
