import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import { isApiProblemError } from '@/api/problem'
import type { PaginatedResponse, Company } from './organizationApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
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

  if (isLoading) return <LoadingState />
  if (isError) return <p data-testid="error-state" className="p-4 text-danger">Erro ao carregar empresas.</p>

  const companies = data?.results ?? []
  const totalPages = data ? Math.ceil(data.count / 25) : 1

  return (
    <div data-testid="companies-page" className="p-6">
      <Card
        title="Empresas"
        actions={
          !showForm && companies.length > 0 && (
            <Button variant="primary" size="sm" onClick={() => setShowForm(true)}>
              Nova Empresa
            </Button>
          )
        }
      >
        {showForm && (
          <div className="mb-6">
            <CompanyForm
              onSubmit={(data) => createMutation.mutate(data)}
              onCancel={() => { setShowForm(false); setSubmitError(null) }}
              isPending={createMutation.isPending}
              submitError={submitError}
              setSubmitError={setSubmitError}
            />
          </div>
        )}

        {companies.length === 0 && !showForm && (
          <EmptyState
            title="Nenhuma empresa"
            description="Crie sua primeira empresa para começar."
            action={
              <Button variant="primary" onClick={() => setShowForm(true)}>
                Criar Empresa
              </Button>
            }
          />
        )}

        {companies.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="companies-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600">Nome</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600">CNPJ</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600">IE</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600">Ações</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((company) => (
                  <tr key={company.id} data-testid="company-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                    {editingId === company.id ? (
                      <>
                        <td colSpan={5} className="px-4 py-3">
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
                        <td className="px-4 py-3 text-neutral-700">{company.name}</td>
                        <td className="px-4 py-3 text-neutral-700">{company.cnpj || '-'}</td>
                        <td className="px-4 py-3 text-neutral-700">{company.ie || '-'}</td>
                        <td className="px-4 py-3">
                          <Badge variant={company.is_active ? 'success' : 'danger'}>{company.is_active ? 'Ativo' : 'Inativo'}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Button variant="ghost" size="sm" onClick={() => setEditingId(company.id)}>
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
