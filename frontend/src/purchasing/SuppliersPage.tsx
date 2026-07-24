import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import { isApiProblemError } from '@/api/problem'
import { fetchSuppliers, createSupplier, updateSupplier } from './purchasingApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import SupplierForm from './SupplierForm'
import type { SupplierFormData } from './purchasingSchemas'

export default function SuppliersPage() {
  const { selectedTenant } = useTenant()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [searchQ, setSearchQ] = useState('')
  const [activeFilter, setActiveFilter] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const tenantId = selectedTenant?.tenant_id ?? ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['suppliers', tenantId, page, searchQ, activeFilter],
    queryFn: ({ signal }) =>
      fetchSuppliers(tenantId, { page, q: searchQ || undefined, active: activeFilter || undefined }, signal),
    enabled: !!tenantId,
  })

  const createMutation = useMutation({
    mutationFn: (body: SupplierFormData) =>
      createSupplier(tenantId, body, crypto.randomUUID?.() ?? Math.random().toString()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers', tenantId] })
      setShowForm(false)
      setSubmitError(null)
    },
    onError: (err) => {
      if (isApiProblemError(err) && err.problem.errors) {
        setSubmitError(Object.values(err.problem.errors).flat().join(', '))
      } else if (isApiProblemError(err)) {
        setSubmitError(err.problem.detail)
      } else {
        setSubmitError('Erro ao criar fornecedor.')
      }
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: SupplierFormData }) =>
      updateSupplier(tenantId, id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers', tenantId] })
      setEditingId(null)
      setSubmitError(null)
    },
    onError: (err) => {
      if (isApiProblemError(err) && err.problem.errors) {
        setSubmitError(Object.values(err.problem.errors).flat().join(', '))
      } else if (isApiProblemError(err)) {
        setSubmitError(err.problem.detail)
      } else {
        setSubmitError('Erro ao atualizar fornecedor.')
      }
    },
  })

  if (isLoading) return <LoadingState message="Carregando fornecedores..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar fornecedores.</p>

  const suppliers = data?.results ?? []
  const totalPages = data ? Math.ceil(data.count / 25) : 1

  return (
    <div data-testid="suppliers-page" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neutral-900">Fornecedores</h2>
        {!showForm && suppliers.length > 0 && (
          <Button onClick={() => setShowForm(true)} variant="primary">Novo Fornecedor</Button>
        )}
      </div>

      <Card>
        <div className="flex flex-wrap gap-3">
          <input
            placeholder="Buscar por nome ou CNPJ..."
            value={searchQ}
            onChange={(e) => { setSearchQ(e.target.value); setPage(1) }}
            data-testid="search-input"
            className="w-full px-3 py-2 border border-border rounded-lg text-sm"
          />
          <select
            value={activeFilter}
            onChange={(e) => { setActiveFilter(e.target.value); setPage(1) }}
            aria-label="Filtrar por status"
            className="w-full px-3 py-2 border border-border rounded-lg text-sm"
          >
            <option value="">Todos</option>
            <option value="true">Ativos</option>
            <option value="false">Inativos</option>
          </select>
        </div>
      </Card>

      {showForm && (
        <Card title="Novo Fornecedor">
          <SupplierForm
            onSubmit={(data) => createMutation.mutate(data)}
            onCancel={() => { setShowForm(false); setSubmitError(null) }}
            isPending={createMutation.isPending}
            submitError={submitError}
            setSubmitError={setSubmitError}
          />
        </Card>
      )}

      {suppliers.length === 0 && !showForm && (
        <EmptyState
          title="Nenhum fornecedor"
          description="Crie seu primeiro fornecedor para começar."
          action={
            <Button onClick={() => setShowForm(true)} variant="primary">Criar Fornecedor</Button>
          }
        />
      )}

      {suppliers.length > 0 && (
        <Card>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="suppliers-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Nome</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">CNPJ</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">IE</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Ações</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((supplier) => (
                  <tr key={supplier.id} data-testid="supplier-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                    {editingId === supplier.id ? (
                      <>
                        <td colSpan={5} className="p-4">
                          <SupplierForm
                            initialData={{ name: supplier.name, cnpj: supplier.cnpj, ie: supplier.ie, is_active: supplier.is_active }}
                            onSubmit={(data) => updateMutation.mutate({ id: supplier.id, body: data })}
                            onCancel={() => { setEditingId(null); setSubmitError(null) }}
                            isPending={updateMutation.isPending}
                            submitError={submitError}
                            setSubmitError={setSubmitError}
                          />
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-neutral-700">{supplier.name}</td>
                        <td className="px-4 py-3 text-neutral-700">{supplier.cnpj || '-'}</td>
                        <td className="px-4 py-3 text-neutral-700">{supplier.ie || '-'}</td>
                        <td className="px-4 py-3">
                          <Badge variant={supplier.is_active ? 'success' : 'neutral'}>{supplier.is_active ? 'Ativo' : 'Inativo'}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Button onClick={() => setEditingId(supplier.id)} variant="ghost" size="sm">Editar</Button>
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
