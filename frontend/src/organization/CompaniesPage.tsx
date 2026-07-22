import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import { isApiProblemError } from '@/api/problem'
import type { PaginatedResponse, Company } from './organizationApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import CompanyForm from './CompanyForm'
import type { CompanyFormData } from './organizationSchemas'

export default function CompaniesPage() {
  const { selectedTenant } = useTenant()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const tenantId = selectedTenant?.tenant_id ?? ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['companies', tenantId, page],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<Company>>(`/companies/?page=${page}`, {
        tenantId,
        signal,
      }) as Promise<PaginatedResponse<Company>>,
    enabled: !!tenantId,
  })

  const createMutation = useMutation({
    mutationFn: (body: CompanyFormData) =>
      apiRequest<Company>('/companies/', {
        method: 'POST',
        tenantId,
        body,
      }) as Promise<Company>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies', tenantId] })
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
        setSubmitError('Erro ao criar empresa.')
      }
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: CompanyFormData }) =>
      apiRequest<Company>(`/companies/${id}/`, {
        method: 'PATCH',
        tenantId,
        body,
      }) as Promise<Company>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies', tenantId] })
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
        setSubmitError('Erro ao atualizar empresa.')
      }
    },
  })

  if (isLoading) return <LoadingState message="Carregando empresas..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar empresas.</p>

  const companies = data?.results ?? []
  const totalPages = data ? Math.ceil(data.count / 25) : 1

  return (
    <div data-testid="companies-page">
      <h2>Empresas</h2>

      {!showForm && companies.length > 0 && (
        <button onClick={() => setShowForm(true)} type="button">
          Nova Empresa
        </button>
      )}

      {showForm && (
        <CompanyForm
          onSubmit={(data) => createMutation.mutate(data)}
          onCancel={() => { setShowForm(false); setSubmitError(null) }}
          isPending={createMutation.isPending}
          submitError={submitError}
          setSubmitError={setSubmitError}
        />
      )}

      {companies.length === 0 && !showForm && (
        <EmptyState
          title="Nenhuma empresa"
          description="Crie sua primeira empresa para começar."
          action={
            <button onClick={() => setShowForm(true)} type="button">
              Criar Empresa
            </button>
          }
        />
      )}

      {companies.length > 0 && (
        <table data-testid="companies-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>CNPJ</th>
              <th>IE</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => (
              <tr key={company.id} data-testid="company-row">
                {editingId === company.id ? (
                  <>
                    <td colSpan={5}>
                      <CompanyForm
                        initialData={{ name: company.name, cnpj: company.cnpj, ie: company.ie, is_active: company.is_active }}
                        onSubmit={(data) => updateMutation.mutate({ id: company.id, body: data })}
                        onCancel={() => { setEditingId(null); setSubmitError(null) }}
                        isPending={updateMutation.isPending}
                        submitError={submitError}
                        setSubmitError={setSubmitError}
                      />
                    </td>
                  </>
                ) : (
                  <>
                    <td>{company.name}</td>
                    <td>{company.cnpj || '-'}</td>
                    <td>{company.ie || '-'}</td>
                    <td>{company.is_active ? 'Ativo' : 'Inativo'}</td>
                    <td>
                      <button onClick={() => setEditingId(company.id)} type="button">
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
