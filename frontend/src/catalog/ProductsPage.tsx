import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import { isApiProblemError } from '@/api/problem'
import type { PaginatedResponse, Product, Category } from './catalogApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
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
    <div data-testid="products-page" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neutral-900">Produtos</h2>
        {!showForm && products.length > 0 && (
          <Button onClick={() => setShowForm(true)} variant="primary">Novo Produto</Button>
        )}
      </div>

      <Card>
        <div className="flex flex-wrap gap-3">
          <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-[200px]">
            <input
              aria-label="Buscar produtos"
              placeholder="Buscar por nome ou código..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm"
            />
            <Button type="submit" size="sm" variant="secondary">Buscar</Button>
          </form>

          <div className="flex items-center gap-2">
            <label htmlFor="filter-category" className="text-sm text-neutral-600">Categoria</label>
            <select
              id="filter-category"
              value={category}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm"
            >
              <option value="">Todas</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="filter-active" className="text-sm text-neutral-600">Status</label>
            <select
              id="filter-active"
              value={active}
              onChange={(e) => handleActiveChange(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm"
            >
              <option value="">Todos</option>
              <option value="true">Ativo</option>
              <option value="false">Inativo</option>
            </select>
          </div>
        </div>
      </Card>

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
            <Button onClick={() => setShowForm(true)} variant="primary">Criar Produto</Button>
          }
        />
      )}

      {products.length > 0 && (
        <Card>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="products-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Nome</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">SKU</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Categoria</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Unidade</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Ações</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id} data-testid="product-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                    {editingId === product.id ? (
                      <>
                        <td colSpan={6} className="p-4">
                          <ProductForm
                            productId={product.id}
                            initialData={{
                              name: product.name,
                              sku: product.sku,
                              barcode: product.barcode,
                              category: product.category,
                              unit: product.unit,
                              is_active: product.is_active,
                              product_kind: product.product_kind ?? '',
                              brand: product.brand ?? '',
                              model: product.model ?? '',
                              tags: Array.isArray(product.tags) ? product.tags.join(', ') : '',
                              scale_code: product.scale_code ?? '',
                              tracks_inventory: product.tracks_inventory ?? false,
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
                        <td className="px-4 py-3 text-neutral-700">{product.name}</td>
                        <td className="px-4 py-3 text-neutral-700">{product.sku || '-'}</td>
                        <td className="px-4 py-3 text-neutral-700">{product.category_name || '-'}</td>
                        <td className="px-4 py-3 text-neutral-700">{product.unit_name || '-'}</td>
                        <td className="px-4 py-3">
                          <Badge variant={product.is_active ? 'success' : 'neutral'}>{product.is_active ? 'Ativo' : 'Inativo'}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Button onClick={() => setEditingId(product.id)} variant="ghost" size="sm">Editar</Button>
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
          <Button disabled={page <= 1} onClick={() => {
            const params = new URLSearchParams(searchParams)
            params.set('page', String(page - 1))
            setSearchParams(params)
          }} variant="secondary" size="sm">Anterior</Button>
          <span className="text-sm text-neutral-600">Página {page} de {totalPages}</span>
          <Button disabled={page >= totalPages} onClick={() => {
            const params = new URLSearchParams(searchParams)
            params.set('page', String(page + 1))
            setSearchParams(params)
          }} variant="secondary" size="sm">Próxima</Button>
        </nav>
      )}
    </div>
  )
}
