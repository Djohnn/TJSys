import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import { isApiProblemError } from '@/api/problem'
import type { PaginatedResponse, Category } from './catalogApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
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
    <div data-testid="categories-page" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neutral-900">Categorias</h2>
        {!showForm && categories.length > 0 && (
          <Button onClick={() => { setShowForm(true); setFormName(''); setSubmitError(null) }} variant="primary">Nova Categoria</Button>
        )}
      </div>

      {showForm && (
        <Card title="Nova Categoria">
          <form onSubmit={handleCreateSubmit} data-testid="category-form" className="space-y-4">
            {submitError && (
              <div data-testid="form-error" role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {submitError}
              </div>
            )}
            <div>
              <label htmlFor="category-name" className="block text-sm font-medium text-neutral-700 mb-1">Nome</label>
              <input
                id="category-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={createMutation.isPending} loading={createMutation.isPending}>
                {createMutation.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
              <Button type="button" variant="secondary" onClick={cancelForm} disabled={createMutation.isPending}>
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      {categories.length === 0 && !showForm && (
        <EmptyState
          title="Nenhuma categoria"
          description="Crie sua primeira categoria para começar."
          action={
            <Button onClick={() => { setShowForm(true); setFormName(''); setSubmitError(null) }} variant="primary">Criar Categoria</Button>
          }
        />
      )}

      {categories.length > 0 && (
        <Card>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="categories-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Nome</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Ações</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <tr key={category.id} data-testid="category-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                    {editingId === category.id ? (
                      <>
                        <td colSpan={3} className="p-4">
                          <form onSubmit={(e) => handleEditSubmit(e, category.id)} data-testid="category-form" className="space-y-4">
                            {submitError && (
                              <div data-testid="form-error" role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                                {submitError}
                              </div>
                            )}
                            <div>
                              <label htmlFor="category-name" className="block text-sm font-medium text-neutral-700 mb-1">Nome</label>
                              <input
                                id="category-name"
                                value={formName}
                                onChange={(e) => setFormName(e.target.value)}
                                className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button type="submit" disabled={updateMutation.isPending} loading={updateMutation.isPending}>
                                {updateMutation.isPending ? 'Salvando...' : 'Salvar'}
                              </Button>
                              <Button type="button" variant="secondary" onClick={cancelForm} disabled={updateMutation.isPending}>
                                Cancelar
                              </Button>
                            </div>
                          </form>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-neutral-700">{category.name}</td>
                        <td className="px-4 py-3">
                          <Badge variant={category.is_active ? 'success' : 'neutral'}>{category.is_active ? 'Ativo' : 'Inativo'}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Button onClick={() => startEdit(category)} variant="ghost" size="sm">Editar</Button>
                        </td>
                      </>
                    )}
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
