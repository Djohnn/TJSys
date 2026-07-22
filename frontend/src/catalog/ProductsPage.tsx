import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import { isApiProblemError } from '@/api/problem'
import type { PaginatedResponse, Product, Category } from './catalogApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import ProductForm from './ProductForm'
import type { ProductFormData } from './catalogSchemas'

export default function ProductsPage() {
  const { selectedTenant } = useTenant()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState(searchParams.get('q') ?? '')
  const tenantId = selectedTenant?.tenant_id ?? ''

  const page = Number(searchParams.get('page') ?? '1')
  const q = searchParams.get('q') ?? ''
  const category = searchParams.get('category') ?? ''
  const active = searchParams.get('active') ?? ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['products', tenantId, page, q, category, active],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams()
      params.set('page', String(page))
      if (q) params.set('q', q)
      if (category) params.set('category', category)
      if (active) params.set('active', active)
      return apiRequest<PaginatedResponse<Product>>(`/catalog/products/?${params.toString()}`, {
        tenantId,
        signal,
      }) as Promise<PaginatedResponse<Product>>
    },
    enabled: !!tenantId,
  })

  const { data: categoriesData } = useQuery({
    queryKey: ['categories', tenantId],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<Category>>('/catalog/categories/', {
        tenantId,
        signal,
      }) as Promise<PaginatedResponse<Category>>,
    enabled: !!tenantId,
  })

  const createMutation = useMutation({
    mutationFn: (body: ProductFormData) =>
      apiRequest<Product>('/catalog/products/', {
        method: 'POST',
        tenantId,
        body,
      }) as Promise<Product>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', tenantId] })
      setShowForm(false)
      setSubmitError(null)
    },
    onError: (err) => {
      if (isApiProblemError(err) && err.problem.errors) {
        setSubmitError(Object.values(err.problem.errors).flat().join(', '))
      } else if (isApiProblemError(err)) {
        setSubmitError(err.problem.detail)
      } else {
        setSubmitError('Erro ao criar produto.')
      }
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: ProductFormData }) =>
      apiRequest<Product>(`/catalog/products/${id}/`, {
        method: 'PATCH',
        tenantId,
        body,
      }) as Promise<Product>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products', tenantId] })
      setEditingId(null)
      setSubmitError(null)
    },
    onError: (err) => {
      if (isApiProblemError(err) && err.problem.errors) {
        setSubmitError(Object.values(err.problem.errors).flat().join(', '))
      } else if (isApiProblemError(err)) {
        setSubmitError(err.problem.detail)
      } else {
        setSubmitError('Erro ao atualizar produto.')
      }
    },
  })

  const categories = categoriesData?.results ?? []

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams(searchParams)
    if (searchInput) {
      params.set('q', searchInput)
    } else {
      params.delete('q')
    }
    params.set('page', '1')
    setSearchParams(params)
  }

  function handleCategoryChange(value: string) {
    const params = new URLSearchParams(searchParams)
    if (value) {
      params.set('category', value)
    } else {
      params.delete('category')
    }
    params.set('page', '1')
    setSearchParams(params)
  }

  function handleActiveChange(value: string) {
    const params = new URLSearchParams(searchParams)
    if (value) {
      params.set('active', value)
    } else {
      params.delete('active')
    }
    params.set('page', '1')
    setSearchParams(params)
  }

  if (isLoading) return <LoadingState message="Carregando produtos..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar produtos.</p>

  const products = data?.results ?? []
  const totalPages = data ? Math.ceil(data.count / 25) : 1

  return (
    <div data-testid="products-page">
      <h2>Produtos</h2>

      <form onSubmit={handleSearch}>
        <input
          aria-label="Buscar produtos"
          placeholder="Buscar por nome ou código..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <button type="submit">Buscar</button>
      </form>

      <div>
        <label htmlFor="filter-category">Categoria</label>
        <select
          id="filter-category"
          value={category}
          onChange={(e) => handleCategoryChange(e.target.value)}
        >
          <option value="">Todas</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="filter-active">Status</label>
        <select
          id="filter-active"
          value={active}
          onChange={(e) => handleActiveChange(e.target.value)}
        >
          <option value="">Todos</option>
          <option value="true">Ativo</option>
          <option value="false">Inativo</option>
        </select>
      </div>

      {!showForm && products.length > 0 && (
        <button onClick={() => setShowForm(true)} type="button">
          Novo Produto
        </button>
      )}

      {showForm && (
        <ProductForm
          onSubmit={(data) => createMutation.mutate(data)}
          onCancel={() => { setShowForm(false); setSubmitError(null) }}
          isPending={createMutation.isPending}
          submitError={submitError}
          setSubmitError={setSubmitError}
        />
      )}

      {products.length === 0 && !showForm && (
        <EmptyState
          title="Nenhum produto"
          description="Crie seu primeiro produto para começar."
          action={
            <button onClick={() => setShowForm(true)} type="button">
              Criar Produto
            </button>
          }
        />
      )}

      {products.length > 0 && (
        <table data-testid="products-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>SKU</th>
              <th>Categoria</th>
              <th>Unidade</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id} data-testid="product-row">
                {editingId === product.id ? (
                  <>
                    <td colSpan={6}>
                      <ProductForm
                        initialData={{
                          name: product.name,
                          sku: product.sku,
                          barcode: product.barcode,
                          category: product.category,
                          unit: product.unit,
                          is_active: product.is_active,
                        }}
                        onSubmit={(data) => updateMutation.mutate({ id: product.id, body: data })}
                        onCancel={() => { setEditingId(null); setSubmitError(null) }}
                        isPending={updateMutation.isPending}
                        submitError={submitError}
                        setSubmitError={setSubmitError}
                      />
                    </td>
                  </>
                ) : (
                  <>
                    <td>{product.name}</td>
                    <td>{product.sku || '-'}</td>
                    <td>{product.category_name || '-'}</td>
                    <td>{product.unit_name || '-'}</td>
                    <td>{product.is_active ? 'Ativo' : 'Inativo'}</td>
                    <td>
                      <button onClick={() => setEditingId(product.id)} type="button">
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
          <button disabled={page <= 1} onClick={() => {
            const params = new URLSearchParams(searchParams)
            params.set('page', String(page - 1))
            setSearchParams(params)
          }} type="button">
            Anterior
          </button>
          <span>Página {page} de {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => {
            const params = new URLSearchParams(searchParams)
            params.set('page', String(page + 1))
            setSearchParams(params)
          }} type="button">
            Próxima
          </button>
        </nav>
      )}
    </div>
  )
}
