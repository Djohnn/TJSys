import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import { isApiProblemError } from '@/api/problem'
import type { PaginatedResponse, Category } from './catalogApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import type { CategoryFormData } from './catalogSchemas'

export default function CategoriesPage() {
  const { selectedTenant } = useTenant()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formName, setFormName] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const tenantId = selectedTenant?.tenant_id ?? ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['categories', tenantId, page],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<Category>>(`/catalog/categories/?page=${page}`, {
        tenantId,
        signal,
      }) as Promise<PaginatedResponse<Category>>,
    enabled: !!tenantId,
  })

  const createMutation = useMutation({
    mutationFn: (body: CategoryFormData) =>
      apiRequest<Category>('/catalog/categories/', {
        method: 'POST',
        tenantId,
        body,
      }) as Promise<Category>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', tenantId] })
      setShowForm(false)
      setFormName('')
      setSubmitError(null)
    },
    onError: (err) => {
      if (isApiProblemError(err) && err.problem.errors) {
        setSubmitError(Object.values(err.problem.errors).flat().join(', '))
      } else if (isApiProblemError(err)) {
        setSubmitError(err.problem.detail)
      } else {
        setSubmitError('Erro ao criar categoria.')
      }
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: CategoryFormData }) =>
      apiRequest<Category>(`/catalog/categories/${id}/`, {
        method: 'PATCH',
        tenantId,
        body,
      }) as Promise<Category>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', tenantId] })
      setEditingId(null)
      setFormName('')
      setSubmitError(null)
    },
    onError: (err) => {
      if (isApiProblemError(err) && err.problem.errors) {
        setSubmitError(Object.values(err.problem.errors).flat().join(', '))
      } else if (isApiProblemError(err)) {
        setSubmitError(err.problem.detail)
      } else {
        setSubmitError('Erro ao atualizar categoria.')
      }
    },
  })

  if (isLoading) return <LoadingState message="Carregando categorias..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar categorias.</p>

  const categories = data?.results ?? []
  const totalPages = data ? Math.ceil(data.count / 25) : 1

  function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    createMutation.mutate({ name: formName })
  }

  function handleEditSubmit(e: React.FormEvent, id: string) {
    e.preventDefault()
    setSubmitError(null)
    updateMutation.mutate({ id, body: { name: formName } })
  }

  function startEdit(category: Category) {
    setEditingId(category.id)
    setFormName(category.name)
    setSubmitError(null)
  }

  function cancelForm() {
    setShowForm(false)
    setEditingId(null)
    setFormName('')
    setSubmitError(null)
  }

  return (
    <div data-testid="categories-page">
      <h2>Categorias</h2>

      {!showForm && categories.length > 0 && (
        <button onClick={() => { setShowForm(true); setFormName(''); setSubmitError(null) }} type="button">
          Nova Categoria
        </button>
      )}

      {showForm && (
        <form onSubmit={handleCreateSubmit} data-testid="category-form">
          {submitError && (
            <div data-testid="form-error" role="alert" style={{ color: 'red' }}>
              {submitError}
            </div>
          )}
          <div>
            <label htmlFor="category-name">Nome</label>
            <input
              id="category-name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </div>
          <div>
            <button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Salvando...' : 'Salvar'}
            </button>
            <button type="button" onClick={cancelForm} disabled={createMutation.isPending}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {categories.length === 0 && !showForm && (
        <EmptyState
          title="Nenhuma categoria"
          description="Crie sua primeira categoria para começar."
          action={
            <button onClick={() => { setShowForm(true); setFormName(''); setSubmitError(null) }} type="button">
              Criar Categoria
            </button>
          }
        />
      )}

      {categories.length > 0 && (
        <table data-testid="categories-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <tr key={category.id} data-testid="category-row">
                {editingId === category.id ? (
                  <>
                    <td colSpan={3}>
                      <form onSubmit={(e) => handleEditSubmit(e, category.id)} data-testid="category-form">
                        {submitError && (
                          <div data-testid="form-error" role="alert" style={{ color: 'red' }}>
                            {submitError}
                          </div>
                        )}
                        <div>
                          <label htmlFor="category-name">Nome</label>
                          <input
                            id="category-name"
                            value={formName}
                            onChange={(e) => setFormName(e.target.value)}
                          />
                        </div>
                        <div>
                          <button type="submit" disabled={updateMutation.isPending}>
                            {updateMutation.isPending ? 'Salvando...' : 'Salvar'}
                          </button>
                          <button type="button" onClick={cancelForm} disabled={updateMutation.isPending}>
                            Cancelar
                          </button>
                        </div>
                      </form>
                    </td>
                  </>
                ) : (
                  <>
                    <td>{category.name}</td>
                    <td>{category.is_active ? 'Ativo' : 'Inativo'}</td>
                    <td>
                      <button onClick={() => startEdit(category)} type="button">
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
