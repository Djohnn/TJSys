import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import {
  fetchProducts,
  fetchCategories,
  fetchBrands,
  fetchLabelTemplates,
  generateLabels,
} from './catalogApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

interface SelectedItem {
  productId: string
  quantity: number
}

export default function LabelsPage() {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [brandFilter, setBrandFilter] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [selectedItems, setSelectedItems] = useState<Map<string, SelectedItem>>(new Map())
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['products', tenantId, page, search, categoryFilter],
    queryFn: ({ signal }) =>
      fetchProducts(tenantId, {
        page,
        q: search || undefined,
        category: categoryFilter || undefined,
      }, signal),
    enabled: !!tenantId,
  })

  const { data: categoriesData } = useQuery({
    queryKey: ['categories', tenantId],
    queryFn: ({ signal }) => fetchCategories(tenantId, {}, signal),
    enabled: !!tenantId,
  })

  const { data: brandsData } = useQuery({
    queryKey: ['brands', tenantId],
    queryFn: ({ signal }) => fetchBrands(tenantId, {}, signal),
    enabled: !!tenantId,
  })

  const { data: templatesData } = useQuery({
    queryKey: ['label-templates', tenantId],
    queryFn: ({ signal }) => fetchLabelTemplates(tenantId, signal),
    enabled: !!tenantId,
  })

  const templates = useMemo(() => templatesData?.results ?? [], [templatesData])
  const products = useMemo(() => productsData?.results ?? [], [productsData])
  const categories = useMemo(() => categoriesData?.results ?? [], [categoriesData])
  const brands = useMemo(() => brandsData?.results ?? [], [brandsData])
  const totalPages = useMemo(
    () => (productsData ? Math.ceil(productsData.count / 25) : 1),
    [productsData],
  )

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (brandFilter && p.brand?.toLowerCase() !== brandFilter.toLowerCase()) return false
      return true
    })
  }, [products, brandFilter])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const toggleItem = useCallback((productId: string) => {
    setSelectedItems((prev) => {
      const next = new Map(prev)
      if (next.has(productId)) {
        next.delete(productId)
      } else {
        next.set(productId, { productId, quantity: 1 })
      }
      return next
    })
  }, [])

  const setQuantity = useCallback((productId: string, quantity: number) => {
    setSelectedItems((prev) => {
      const next = new Map(prev)
      const existing = next.get(productId)
      if (existing) {
        next.set(productId, { ...existing, quantity: Math.max(1, quantity) })
      }
      return next
    })
  }, [])

  const handleGenerate = useCallback(async () => {
    if (!selectedTemplateId) {
      setError('Selecione um modelo de etiqueta.')
      return
    }
    if (selectedItems.size === 0) {
      setError('Selecione ao menos um produto.')
      return
    }
    setError(null)
    setGenerating(true)
    try {
      const items = Array.from(selectedItems.values()).map((item) => ({
        product_id: item.productId,
        quantity: item.quantity,
      }))
      const blob = await generateLabels(tenantId, {
        template_id: selectedTemplateId,
        items,
      })
      const url = URL.createObjectURL(blob)
      setPreviewUrl(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar etiquetas.')
    } finally {
      setGenerating(false)
    }
  }, [tenantId, selectedTemplateId, selectedItems])

  if (productsLoading) return <LoadingState message="Carregando produtos..." />

  return (
    <div data-testid="labels-page" className="p-6 space-y-6">
      <h2 className="text-2xl font-bold text-neutral-900">Gerar Etiquetas</h2>

      <Card>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="label-search" className="block text-sm font-medium text-neutral-700 mb-1">
              Buscar Produto
            </label>
            <input
              id="label-search"
              type="search"
              placeholder="Nome ou SKU..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm"
              data-testid="label-product-search"
            />
          </div>

          <div>
            <label htmlFor="label-category" className="block text-sm font-medium text-neutral-700 mb-1">
              Categoria
            </label>
            <select
              id="label-category"
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); setPage(1) }}
              className="px-3 py-2 border border-border rounded-lg text-sm bg-white"
              data-testid="label-category-filter"
            >
              <option value="">Todas</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="label-brand" className="block text-sm font-medium text-neutral-700 mb-1">
              Marca
            </label>
            <select
              id="label-brand"
              value={brandFilter}
              onChange={(e) => { setBrandFilter(e.target.value); setPage(1) }}
              className="px-3 py-2 border border-border rounded-lg text-sm bg-white"
              data-testid="label-brand-filter"
            >
              <option value="">Todas</option>
              {brands.map((b) => (
                <option key={b.id} value={b.name}>{b.name}</option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap gap-3 items-end mb-4">
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="label-template" className="block text-sm font-medium text-neutral-700 mb-1">
              Modelo de Etiqueta
            </label>
            <select
              id="label-template"
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white"
              data-testid="label-template-select"
            >
              <option value="">Selecione um modelo...</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.columns}x{t.rows} — {t.width_mm}x{t.height_mm}mm)
                </option>
              ))}
            </select>
          </div>

          <Button
            variant="primary"
            onClick={handleGenerate}
            disabled={generating || selectedItems.size === 0}
            data-testid="label-generate-button"
          >
            {generating ? 'Gerando...' : 'Gerar Etiquetas'}
          </Button>
        </div>

      {error && (
          <div data-testid="label-generate-error" className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}
      </Card>

      {filteredProducts.length === 0 ? (
        <EmptyState
          title="Nenhum produto encontrado"
          description="Ajuste os filtros ou busque por outro termo."
        />
      ) : (
        <Card>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="labels-product-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 w-12">
                    <input
                      type="checkbox"
                      onChange={() => {
                        const allSelected = filteredProducts.length === selectedItems.size
                        setSelectedItems(() => {
                          if (allSelected) return new Map()
                          const m = new Map<string, SelectedItem>()
                          filteredProducts.forEach((p) => m.set(p.id, { productId: p.id, quantity: 1 }))
                          return m
                        })
                      }}
                      checked={filteredProducts.length > 0 && filteredProducts.every((p) => selectedItems.has(p.id))}
                      data-testid="label-select-all"
                    />
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600">SKU</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600">Nome</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600">Categoria</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600">Marca</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 w-24">Qtd.</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <tr
                    key={product.id}
                    className="border-b border-border hover:bg-neutral-50"
                    data-testid={`label-product-row-${product.id}`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedItems.has(product.id)}
                        onChange={() => toggleItem(product.id)}
                        data-testid={`label-checkbox-${product.id}`}
                      />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{product.sku}</td>
                    <td className="px-4 py-3">{product.name}</td>
                    <td className="px-4 py-3 text-neutral-500">{product.category_name || '-'}</td>
                    <td className="px-4 py-3 text-neutral-500">{product.brand || '-'}</td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min={1}
                        value={selectedItems.get(product.id)?.quantity ?? 1}
                        onChange={(e) => setQuantity(product.id, parseInt(e.target.value, 10) || 1)}
                        disabled={!selectedItems.has(product.id)}
                        className="w-16 px-2 py-1 border border-border rounded text-sm"
                        data-testid={`label-qty-${product.id}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-neutral-500">
                Página {page} de {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </Button>
                <Button
                  variant="secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {previewUrl && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-neutral-900">Pré-visualização</h3>
            <a
              data-testid="label-download-link"
              href={previewUrl}
              download="etiquetas.pdf"
              className="px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700"
            >
              Baixar PDF
            </a>
          </div>
          <iframe
            data-testid="label-pdf-preview"
            title="Pré-visualização das etiquetas"
            src={previewUrl}
            className="w-full h-[32rem] rounded-lg border border-border"
          />
        </Card>
      )}
    </div>
  )
}
