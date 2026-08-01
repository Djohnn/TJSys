import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import { fetchBrands, createBrand, updateBrand } from './catalogApi'
import type { Brand } from './catalogApi'
import { isApiProblemError } from '@/api/problem'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

export default function BrandsPage() {
  const { selectedTenant } = useTenant()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formName, setFormName] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const tenantId = selectedTenant?.tenant_id ?? ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['brands', tenantId, page, q],
    queryFn: ({ signal }) => fetchBrands(tenantId, { page, q: q || undefined }, signal),
    enabled: !!tenantId,
  })

  const createMutation = useMutation({
    mutationFn: (body: { name: string }) => createBrand(tenantId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brands', tenantId] })
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
        setSubmitError('Erro ao criar marca.')
      }
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      updateBrand(tenantId, id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brands', tenantId] })
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
        setSubmitError('Erro ao atualizar marca.')
      }
    },
  })

  if (isLoading) return <LoadingState message="Carregando marcas..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar marcas.</p>

  const brands = data?.results ?? []
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

  function startEdit(brand: Brand) {
    setEditingId(brand.id)
    setFormName(brand.name)
    setSubmitError(null)
  }

  function cancelForm() {
    setShowForm(false)
    setEditingId(null)
    setFormName('')
    setSubmitError(null)
  }

  return (
    <div data-testid="brands-page" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neutral-900">Marcas</h2>
        {!showForm && brands.length > 0 && (
          <Button onClick={() => { setShowForm(true); setFormName(''); setSubmitError(null) }} variant="primary">Nova Marca</Button>
        )}
      </div>

      {brands.length > 0 && (
        <div className="flex gap-2">
          <input
            type="search"
            placeholder="Buscar por nome..."
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1) }}
            className="w-full max-w-xs px-3 py-2 border border-border rounded-lg text-sm"
            data-testid="brand-search-input"
          />
        </div>
      )}

      {showForm && (
        <Card title="Nova Marca">
          <form onSubmit={handleCreateSubmit} data-testid="brand-form" className="space-y-4">
            {submitError && (
              <div data-testid="form-error" role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {submitError}
              </div>
            )}
            <div>
              <label htmlFor="brand-name" className="block text-sm font-medium text-neutral-700 mb-1">Nome</label>
              <input
                id="brand-name"
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

      {brands.length === 0 && !showForm && (
        <EmptyState
          title="Nenhuma marca"
          description="Crie sua primeira marca para começar."
          action={
            <Button onClick={() => { setShowForm(true); setFormName(''); setSubmitError(null) }} variant="primary">Criar Marca</Button>
          }
        />
      )}

      {brands.length > 0 && (
        <Card>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="brands-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Nome</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Ações</th>
                </tr>
              </thead>
              <tbody>
                {brands.map((brand) => (
                  <tr key={brand.id} data-testid="brand-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                    {editingId === brand.id ? (
                      <>
                        <td colSpan={3} className="p-4">
                          <form onSubmit={(e) => handleEditSubmit(e, brand.id)} data-testid="brand-form" className="space-y-4">
                            {submitError && (
                              <div data-testid="form-error" role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                                {submitError}
                              </div>
                            )}
                            <div>
                              <label htmlFor="brand-name-edit" className="block text-sm font-medium text-neutral-700 mb-1">Nome</label>
                              <input
                                id="brand-name-edit"
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
                        <td className="px-4 py-3 text-neutral-700">{brand.name}</td>
                        <td className="px-4 py-3">
                          <Badge variant={brand.is_active ? 'success' : 'neutral'}>{brand.is_active ? 'Ativo' : 'Inativo'}</Badge>
                        </td>
                        <td className="px-4 py-3 flex gap-2">
                          <Button onClick={() => startEdit(brand)} variant="ghost" size="sm">Editar</Button>
                          {brand.is_active ? (
                            <Button onClick={() => updateMutation.mutate({ id: brand.id, body: { is_active: false } })} variant="ghost" size="sm">Desativar</Button>
                          ) : (
                            <Button onClick={() => updateMutation.mutate({ id: brand.id, body: { is_active: true } })} variant="ghost" size="sm">Ativar</Button>
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
