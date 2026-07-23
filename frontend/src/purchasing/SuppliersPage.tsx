import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import { isApiProblemError } from '@/api/problem'
import { fetchSuppliers, createSupplier, updateSupplier } from './purchasingApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
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
    <div data-testid="suppliers-page">
      <h2>Fornecedores</h2>

      <div>
        <input
          placeholder="Buscar por nome ou CNPJ..."
          value={searchQ}
          onChange={(e) => { setSearchQ(e.target.value); setPage(1) }}
          data-testid="search-input"
        />
        <select
          value={activeFilter}
          onChange={(e) => { setActiveFilter(e.target.value); setPage(1) }}
          aria-label="Filtrar por status"
        >
          <option value="">Todos</option>
          <option value="true">Ativos</option>
          <option value="false">Inativos</option>
        </select>
      </div>

      {!showForm && suppliers.length > 0 && (
        <button onClick={() => setShowForm(true)} type="button">
          Novo Fornecedor
        </button>
      )}

      {showForm && (
        <SupplierForm
          onSubmit={(data) => createMutation.mutate(data)}
          onCancel={() => { setShowForm(false); setSubmitError(null) }}
          isPending={createMutation.isPending}
          submitError={submitError}
          setSubmitError={setSubmitError}
        />
      )}

      {suppliers.length === 0 && !showForm && (
        <EmptyState
          title="Nenhum fornecedor"
          description="Crie seu primeiro fornecedor para começar."
          action={
            <button onClick={() => setShowForm(true)} type="button">
              Criar Fornecedor
            </button>
          }
        />
      )}

      {suppliers.length > 0 && (
        <table data-testid="suppliers-table">
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
            {suppliers.map((supplier) => (
              <tr key={supplier.id} data-testid="supplier-row">
                {editingId === supplier.id ? (
                  <>
                    <td colSpan={5}>
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
                    <td>{supplier.name}</td>
                    <td>{supplier.cnpj || '-'}</td>
                    <td>{supplier.ie || '-'}</td>
                    <td>{supplier.is_active ? 'Ativo' : 'Inativo'}</td>
                    <td>
                      <button onClick={() => setEditingId(supplier.id)} type="button">
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
