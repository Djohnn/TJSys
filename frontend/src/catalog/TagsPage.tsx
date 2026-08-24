import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import { isApiProblemError } from '@/api/problem'
import type { PaginatedResponse } from './catalogApi'
import { COLOR_OPTIONS, DEFAULT_TAG_COLOR, isTagColorSelected, resolveTagColor } from './tagColors'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

export interface Tag {
  id: string
  name: string
  color: string
  is_active: boolean
  version: number
}

export default function TagsPage() {
  const { selectedTenant } = useTenant()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formName, setFormName] = useState('')
  const [formColor, setFormColor] = useState(DEFAULT_TAG_COLOR)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const tenantId = selectedTenant?.tenant_id ?? ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['tags', tenantId, page, q],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<Tag>>(`/catalog/tags/?page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}`, {
        tenantId,
        signal,
      }) as Promise<PaginatedResponse<Tag>>,
    enabled: !!tenantId,
  })

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiRequest<Tag>('/catalog/tags/', {
        method: 'POST',
        tenantId,
        body,
      }) as Promise<Tag>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags', tenantId] })
      setShowForm(false)
      setFormName('')
      setFormColor(DEFAULT_TAG_COLOR)
      setSubmitError(null)
    },
    onError: (err) => {
      if (isApiProblemError(err) && err.problem.errors) {
        setSubmitError(Object.values(err.problem.errors).flat().join(', '))
      } else if (isApiProblemError(err)) {
        setSubmitError(err.problem.detail)
      } else {
        setSubmitError('Erro ao criar tag.')
      }
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiRequest<Tag>(`/catalog/tags/${id}/`, {
        method: 'PATCH',
        tenantId,
        body,
      }) as Promise<Tag>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags', tenantId] })
      setEditingId(null)
      setFormName('')
      setFormColor(DEFAULT_TAG_COLOR)
      setSubmitError(null)
    },
    onError: (err) => {
      if (isApiProblemError(err) && err.problem.errors) {
        setSubmitError(Object.values(err.problem.errors).flat().join(', '))
      } else if (isApiProblemError(err)) {
        setSubmitError(err.problem.detail)
      } else {
        setSubmitError('Erro ao atualizar tag.')
      }
    },
  })

  if (isLoading) return <LoadingState message="Carregando tags..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar tags.</p>

  const tags = data?.results ?? []
  const totalPages = data ? Math.ceil(data.count / 25) : 1

  function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    createMutation.mutate({ name: formName, color: resolveTagColor(formColor) })
  }

  function handleEditSubmit(e: React.FormEvent, id: string) {
    e.preventDefault()
    setSubmitError(null)
    updateMutation.mutate({ id, body: { name: formName, color: resolveTagColor(formColor) } })
  }

  function startEdit(tag: Tag) {
    setEditingId(tag.id)
    setFormName(tag.name)
    setFormColor(tag.color)
    setSubmitError(null)
  }

  function cancelForm() {
    setShowForm(false)
    setEditingId(null)
    setFormName('')
    setFormColor(DEFAULT_TAG_COLOR)
    setSubmitError(null)
  }

  return (
    <div data-testid="tags-page" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neutral-900">Tags</h2>
        {!showForm && tags.length > 0 && (
          <Button onClick={() => { setShowForm(true); setFormName(''); setFormColor(DEFAULT_TAG_COLOR); setSubmitError(null) }} variant="primary">Nova Tag</Button>
        )}
      </div>

      {tags.length > 0 && (
        <div className="flex gap-2">
          <input
            type="search"
            placeholder="Buscar por nome..."
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1) }}
            className="w-full max-w-xs px-3 py-2 border border-border rounded-lg text-sm"
            data-testid="tag-search-input"
          />
        </div>
      )}

      {showForm && (
        <Card title="Nova Tag">
          <form onSubmit={handleCreateSubmit} data-testid="tag-form" className="space-y-4">
            {submitError && (
              <div data-testid="form-error" role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {submitError}
              </div>
            )}
            <div>
              <label htmlFor="tag-name" className="block text-sm font-medium text-neutral-700 mb-1">Nome</label>
              <input
                id="tag-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm"
              />
            </div>
            <div>
              <label htmlFor="tag-color" className="block text-sm font-medium text-neutral-700 mb-1">Cor</label>
              <div className="flex gap-2 flex-wrap">
                {COLOR_OPTIONS.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    onClick={() => setFormColor(color.value)}
                    className={`w-8 h-8 rounded-full border-2 ${isTagColorSelected(formColor, color.value) ? 'border-neutral-900' : 'border-transparent'}`}
                    style={{ backgroundColor: `var(${color.value})` }}
                    title={color.label}
                  />
                ))}
              </div>
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

      {tags.length === 0 && !showForm && (
        <EmptyState
          title="Nenhuma tag"
          description="Crie sua primeira tag para começar."
          action={
            <Button onClick={() => { setShowForm(true); setFormName(''); setFormColor(DEFAULT_TAG_COLOR); setSubmitError(null) }} variant="primary">Criar Tag</Button>
          }
        />
      )}

      {tags.length > 0 && (
        <Card>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="tags-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Cor</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Nome</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Ações</th>
                </tr>
              </thead>
              <tbody>
                {tags.map((tag) => (
                  <tr key={tag.id} data-testid="tag-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                    {editingId === tag.id ? (
                      <>
                        <td colSpan={4} className="p-4">
                          <form onSubmit={(e) => handleEditSubmit(e, tag.id)} data-testid="tag-form" className="space-y-4">
                            {submitError && (
                              <div data-testid="form-error" role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                                {submitError}
                              </div>
                            )}
                            <div>
                              <label htmlFor="tag-name-edit" className="block text-sm font-medium text-neutral-700 mb-1">Nome</label>
                              <input
                                id="tag-name-edit"
                                value={formName}
                                onChange={(e) => setFormName(e.target.value)}
                                className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                              />
                            </div>
                            <div>
                              <label htmlFor="tag-color-edit" className="block text-sm font-medium text-neutral-700 mb-1">Cor</label>
                              <div className="flex gap-2 flex-wrap">
                                {COLOR_OPTIONS.map((color) => (
                                  <button
                                    key={color.value}
                                    type="button"
                                    onClick={() => setFormColor(color.value)}
                                    className={`w-8 h-8 rounded-full border-2 ${isTagColorSelected(formColor, color.value) ? 'border-neutral-900' : 'border-transparent'}`}
                                    style={{ backgroundColor: `var(${color.value})` }}
                                    title={color.label}
                                  />
                                ))}
                              </div>
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
                        <td className="px-4 py-3">
                          <div className="w-6 h-6 rounded-full" style={{ backgroundColor: tag.color }} />
                        </td>
                        <td className="px-4 py-3 text-neutral-700">{tag.name}</td>
                        <td className="px-4 py-3">
                          <Badge variant={tag.is_active ? 'success' : 'neutral'}>{tag.is_active ? 'Ativo' : 'Inativo'}</Badge>
                        </td>
                        <td className="px-4 py-3 flex gap-2">
                          <Button onClick={() => startEdit(tag)} variant="ghost" size="sm">Editar</Button>
                          {tag.is_active ? (
                            <Button onClick={() => updateMutation.mutate({ id: tag.id, body: { is_active: false } })} variant="ghost" size="sm">Desativar</Button>
                          ) : (
                            <Button onClick={() => updateMutation.mutate({ id: tag.id, body: { is_active: true } })} variant="ghost" size="sm">Ativar</Button>
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
