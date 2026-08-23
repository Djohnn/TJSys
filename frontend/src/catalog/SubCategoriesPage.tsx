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

export interface SubCategory {
  id: string
  category: string
  category_name: string
  name: string
  code: string
  is_active: boolean
  version: number
}

export default function SubCategoriesPage() {
  const { selectedTenant } = useTenant()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formCategory, setFormCategory] = useState<string>('')
  const [formName, setFormName] = useState('')
  const [formCode, setFormCode] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const tenantId = selectedTenant?.tenant_id ?? ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['subcategories', tenantId, page, q],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<SubCategory>>(`/catalog/subcategories/?page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}`, {
        tenantId,
        signal,
      }) as Promise<PaginatedResponse<SubCategory>>,
    enabled: !!tenantId,
  })

  const { data: allCategories } = useQuery({
    queryKey: ['categories', tenantId, 'all'],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<Category>>('/catalog/categories/?page=1&page_size=1000', {
        tenantId,
        signal,
      }) as Promise<PaginatedResponse<Category>>,
    enabled: !!tenantId,
  })

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiRequest<SubCategory>('/catalog/subcategories/', {
        method: 'POST',
        tenantId,
        body,
      }) as Promise<SubCategory>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subcategories', tenantId] })
      setShowForm(false)
      setFormCategory('')
      setFormName('')
      setFormCode('')
      setSubmitError(null)
    },
    onError: (err) => {
      if (isApiProblemError(err) && err.problem.errors) {
        setSubmitError(Object.values(err.problem.errors).flat().join(', '))
      } else if (isApiProblemError(err)) {
        setSubmitError(err.problem.detail)
      } else {
        setSubmitError('Erro ao criar subcategoria.')
      }
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiRequest<SubCategory>(`/catalog/subcategories/${id}/`, {
        method: 'PATCH',
        tenantId,
        body,
      }) as Promise<SubCategory>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subcategories', tenantId] })
      setEditingId(null)
      setFormCategory('')
      setFormName('')
      setFormCode('')
      setSubmitError(null)
    },
    onError: (err) => {
      if (isApiProblemError(err) && err.problem.errors) {
        setSubmitError(Object.values(err.problem.errors).flat().join(', '))
      } else if (isApiProblemError(err)) {
        setSubmitError(err.problem.detail)
      } else {
        setSubmitError('Erro ao atualizar subcategoria.')
      }
    },
  })

  if (isLoading) return <LoadingState message="Carregando subcategorias..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar subcategorias.</p>

  const subcategories = data?.results ?? []
  const categoryOptions = allCategories?.results ?? []
  const totalPages = data ? Math.ceil(data.count / 25) : 1

  function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    createMutation.mutate({ category: formCategory, name: formName, code: formCode })
  }

  function handleEditSubmit(e: React.FormEvent, id: string) {
    e.preventDefault()
    setSubmitError(null)
    updateMutation.mutate({ id, body: { category: formCategory, name: formName, code: formCode } })
  }

  function startEdit(subcategory: SubCategory) {
    setEditingId(subcategory.id)
    setFormCategory(subcategory.category)
    setFormName(subcategory.name)
    setFormCode(subcategory.code)
    setSubmitError(null)
  }

  function cancelForm() {
    setShowForm(false)
    setEditingId(null)
    setFormCategory('')
    setFormName('')
    setFormCode('')
    setSubmitError(null)
  }

  function renderCategoryDropdown() {
    return (
      <div>
        <label htmlFor="subcategory-category" className="block text-sm font-medium text-neutral-700 mb-1">Categoria</label>
        <select
          id="subcategory-category"
          value={formCategory}
          onChange={(e) => setFormCategory(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded-lg text-sm"
          data-testid="subcategory-category-select"
        >
          <option value="">Selecione uma categoria</option>
          {categoryOptions.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
    )
  }

  return (
    <div data-testid="subcategories-page" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neutral-900">Subcategorias</h2>
        {!showForm && subcategories.length > 0 && (
          <Button onClick={() => { setShowForm(true); setFormCategory(''); setFormName(''); setFormCode(''); setSubmitError(null) }} variant="primary">Nova Subcategoria</Button>
        )}
      </div>

      {subcategories.length > 0 && (
        <div className="flex gap-2">
          <input
            type="search"
            placeholder="Buscar por nome..."
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1) }}
            className="w-full max-w-xs px-3 py-2 border border-border rounded-lg text-sm"
            data-testid="subcategory-search-input"
          />
        </div>
      )}

      {showForm && (
        <Card title="Nova Subcategoria">
          <form onSubmit={handleCreateSubmit} data-testid="subcategory-form" className="space-y-4">
            {submitError && (
              <div data-testid="form-error" role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {submitError}
              </div>
            )}
            {renderCategoryDropdown()}
            <div>
              <label htmlFor="subcategory-name" className="block text-sm font-medium text-neutral-700 mb-1">Nome</label>
              <input
                id="subcategory-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm"
              />
            </div>
            <div>
              <label htmlFor="subcategory-code" className="block text-sm font-medium text-neutral-700 mb-1">Código (opcional)</label>
              <input
                id="subcategory-code"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
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

      {subcategories.length === 0 && !showForm && (
        <EmptyState
          title="Nenhuma subcategoria"
          description="Crie sua primeira subcategoria para começar."
          action={
            <Button onClick={() => { setShowForm(true); setFormCategory(''); setFormName(''); setFormCode(''); setSubmitError(null) }} variant="primary">Criar Subcategoria</Button>
          }
        />
      )}

      {subcategories.length > 0 && (
        <Card>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="subcategories-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Categoria</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Nome</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Código</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Ações</th>
                </tr>
              </thead>
              <tbody>
                {subcategories.map((subcategory) => (
                  <tr key={subcategory.id} data-testid="subcategory-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                    {editingId === subcategory.id ? (
                      <>
                        <td colSpan={5} className="p-4">
                          <form onSubmit={(e) => handleEditSubmit(e, subcategory.id)} data-testid="subcategory-form" className="space-y-4">
                            {submitError && (
                              <div data-testid="form-error" role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                                {submitError}
                              </div>
                            )}
                            {renderCategoryDropdown()}
                            <div>
                              <label htmlFor="subcategory-name-edit" className="block text-sm font-medium text-neutral-700 mb-1">Nome</label>
                              <input
                                id="subcategory-name-edit"
                                value={formName}
                                onChange={(e) => setFormName(e.target.value)}
                                className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                              />
                            </div>
                            <div>
                              <label htmlFor="subcategory-code-edit" className="block text-sm font-medium text-neutral-700 mb-1">Código</label>
                              <input
                                id="subcategory-code-edit"
                                value={formCode}
                                onChange={(e) => setFormCode(e.target.value)}
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
                        <td className="px-4 py-3 text-neutral-700">{subcategory.category_name}</td>
                        <td className="px-4 py-3 text-neutral-700">{subcategory.name}</td>
                        <td className="px-4 py-3 text-neutral-700">{subcategory.code || '-'}</td>
                        <td className="px-4 py-3">
                          <Badge variant={subcategory.is_active ? 'success' : 'neutral'}>{subcategory.is_active ? 'Ativo' : 'Inativo'}</Badge>
                        </td>
                        <td className="px-4 py-3 flex gap-2">
                          <Button onClick={() => startEdit(subcategory)} variant="ghost" size="sm">Editar</Button>
                          {subcategory.is_active ? (
                            <Button onClick={() => updateMutation.mutate({ id: subcategory.id, body: { is_active: false } })} variant="ghost" size="sm">Desativar</Button>
                          ) : (
                            <Button onClick={() => updateMutation.mutate({ id: subcategory.id, body: { is_active: true } })} variant="ghost" size="sm">Ativar</Button>
                          )}
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
