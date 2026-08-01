import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import { isApiProblemError } from '@/api/problem'
import type { PaginatedResponse, Unit } from './catalogApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

export default function UnitsPage() {
  const { selectedTenant } = useTenant()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formSymbol, setFormSymbol] = useState('')
  const [formPrecision, setFormPrecision] = useState('0')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const tenantId = selectedTenant?.tenant_id ?? ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['units', tenantId, page, q],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<Unit>>(`/catalog/units/?page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}`, {
        tenantId,
        signal,
      }) as Promise<PaginatedResponse<Unit>>,
    enabled: !!tenantId,
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiRequest<Unit>(`/catalog/units/${id}/`, {
        method: 'PATCH',
        tenantId,
        body,
      }) as Promise<Unit>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['units', tenantId] })
      setEditingId(null)
      setFormName('')
      setFormSymbol('')
      setFormPrecision('0')
      setSubmitError(null)
    },
    onError: (err) => {
      if (isApiProblemError(err) && err.problem.errors) {
        setSubmitError(Object.values(err.problem.errors).flat().join(', '))
      } else if (isApiProblemError(err)) {
        setSubmitError(err.problem.detail)
      } else {
        setSubmitError('Erro ao atualizar unidade.')
      }
    },
  })

  if (isLoading) return <LoadingState message="Carregando unidades..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar unidades.</p>

  const units = data?.results ?? []
  const totalPages = data ? Math.ceil(data.count / 25) : 1

  function handleEditSubmit(e: React.FormEvent, id: string) {
    e.preventDefault()
    setSubmitError(null)
    updateMutation.mutate({ id, body: { name: formName, symbol: formSymbol, precision: parseInt(formPrecision, 10) || 0 } })
  }

  function startEdit(unit: Unit) {
    setEditingId(unit.id)
    setFormName(unit.name)
    setFormSymbol(unit.symbol || unit.abbreviation)
    setFormPrecision(String(unit.precision ?? 0))
    setSubmitError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setFormName('')
    setFormSymbol('')
    setFormPrecision('0')
    setSubmitError(null)
  }

  return (
    <div data-testid="units-page" className="p-6 space-y-6">
      <h2 className="text-2xl font-bold text-neutral-900">Unidades</h2>

      {units.length > 0 && (
        <div className="flex gap-2">
          <input
            type="search"
            placeholder="Buscar por nome ou símbolo..."
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1) }}
            className="w-full max-w-xs px-3 py-2 border border-border rounded-lg text-sm"
            data-testid="unit-search-input"
          />
        </div>
      )}

      {units.length === 0 && (
        <EmptyState
          title="Nenhuma unidade"
          description="Nenhuma unidade de medida cadastrada."
        />
      )}

      {units.length > 0 && (
        <Card>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="units-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Nome</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Símbolo</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Precisão</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Ações</th>
                </tr>
              </thead>
              <tbody>
                {units.map((unit) => (
                  <tr key={unit.id} data-testid="unit-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                    {editingId === unit.id ? (
                      <>
                        <td colSpan={4} className="p-4">
                          <form onSubmit={(e) => handleEditSubmit(e, unit.id)} data-testid="unit-form" className="space-y-4">
                            {submitError && (
                              <div data-testid="form-error" role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                                {submitError}
                              </div>
                            )}
                            <div>
                              <label htmlFor="unit-name-edit" className="block text-sm font-medium text-neutral-700 mb-1">Nome</label>
                              <input
                                id="unit-name-edit"
                                value={formName}
                                onChange={(e) => setFormName(e.target.value)}
                                className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                              />
                            </div>
                            <div>
                              <label htmlFor="unit-symbol-edit" className="block text-sm font-medium text-neutral-700 mb-1">Símbolo</label>
                              <input
                                id="unit-symbol-edit"
                                value={formSymbol}
                                onChange={(e) => setFormSymbol(e.target.value)}
                                className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                              />
                            </div>
                            <div>
                              <label htmlFor="unit-precision-edit" className="block text-sm font-medium text-neutral-700 mb-1">Precisão</label>
                              <input
                                id="unit-precision-edit"
                                type="number"
                                min="0"
                                max="10"
                                value={formPrecision}
                                onChange={(e) => setFormPrecision(e.target.value)}
                                className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button type="submit" disabled={updateMutation.isPending} loading={updateMutation.isPending}>
                                {updateMutation.isPending ? 'Salvando...' : 'Salvar'}
                              </Button>
                              <Button type="button" variant="secondary" onClick={cancelEdit} disabled={updateMutation.isPending}>
                                Cancelar
                              </Button>
                            </div>
                          </form>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-neutral-700">{unit.name}</td>
                        <td className="px-4 py-3 text-neutral-700">{unit.symbol || unit.abbreviation}</td>
                        <td className="px-4 py-3 text-neutral-700">{unit.precision ?? 0}</td>
                        <td className="px-4 py-3">
                          <Button onClick={() => startEdit(unit)} variant="ghost" size="sm">Editar</Button>
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
