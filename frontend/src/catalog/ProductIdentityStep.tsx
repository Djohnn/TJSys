import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { ReactNode } from 'react'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import type { PaginatedResponse, Category, Unit } from './catalogApi'
import { catalogKeys } from './catalogQueryKeys'
import { productSchema, type ProductFormData } from './catalogSchemas'
import CategoryQuickCreateModal from './CategoryQuickCreateModal'
import UnitQuickCreateModal from './UnitQuickCreateModal'

const PRODUCT_KIND_OPTIONS = [
  { value: '', label: 'Selecione...' },
  { value: 'insumo', label: 'Insumo' },
  { value: 'revenda', label: 'Revenda' },
  { value: 'servico', label: 'Serviço' },
  { value: 'brinde', label: 'Brinde' },
  { value: 'kit', label: 'Kit' },
  { value: 'outro', label: 'Outro' },
]

interface ProductIdentityStepProps {
  initialData?: ProductFormData
  onSubmit: (data: ProductFormData) => void
}

export default function ProductIdentityStep({ initialData, onSubmit }: ProductIdentityStepProps): ReactNode {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''

  const [showCatModal, setShowCatModal] = useState(false)
  const [showUnitModal, setShowUnitModal] = useState(false)

  const { data: categoriesData } = useQuery({
    queryKey: [...catalogKeys.categories(tenantId), 1],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<Category>>('/catalog/categories/?page=1', {
        tenantId,
        signal,
      }) as Promise<PaginatedResponse<Category>>,
    enabled: !!tenantId,
  })

  const { data: unitsData } = useQuery({
    queryKey: [...catalogKeys.units(tenantId), 1],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<Unit>>('/catalog/units/?page=1', {
        tenantId,
        signal,
      }) as Promise<PaginatedResponse<Unit>>,
    enabled: !!tenantId,
  })

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: initialData ?? {
      name: '',
      sku: '',
      barcode: '',
      category: null,
      unit: null,
      is_active: true,
      product_kind: '',
      brand: '',
      model: '',
      tags: '',
      scale_code: '',
      tracks_inventory: false,
    },
  })

  const categories = categoriesData?.results ?? []
  const units = unitsData?.results ?? []

  return (
    <div data-testid="product-identity-step">
      <h2 className="text-xl font-bold text-neutral-900 mb-6">Identidade do Produto</h2>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-4"
      >
        <div>
          <label htmlFor="pi-name" className="block text-sm font-medium text-neutral-700 mb-1">Nome</label>
          <input id="pi-name" {...register('name')} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
          {errors.name && <span role="alert" className="text-xs text-red-600 mt-1 block">{errors.name.message}</span>}
        </div>

        <div>
          <label htmlFor="pi-sku" className="block text-sm font-medium text-neutral-700 mb-1">SKU</label>
          <input id="pi-sku" {...register('sku')} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
        </div>

        <div>
          <label htmlFor="pi-description" className="block text-sm font-medium text-neutral-700 mb-1">Descrição</label>
          <textarea id="pi-description" {...register('description')} className="w-full px-3 py-2 border border-border rounded-lg text-sm" rows={4} />
        </div>

        <div>
          <label htmlFor="pi-category" className="block text-sm font-medium text-neutral-700 mb-1">Categoria</label>
          <div className="flex items-center gap-2">
            <select id="pi-category" {...register('category')} className="flex-1 px-3 py-2 border border-border rounded-lg text-sm">
              <option value="">Selecione...</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {tenantId && (
              <button
                type="button"
                onClick={() => setShowCatModal(true)}
                className="text-xs text-primary-600 hover:text-primary-800 cursor-pointer whitespace-nowrap"
                data-testid="quick-create-category-btn"
              >
                + Nova
              </button>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="pi-brand" className="block text-sm font-medium text-neutral-700 mb-1">Marca</label>
          <input id="pi-brand" {...register('brand')} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
        </div>

        <div>
          <label htmlFor="pi-unit" className="block text-sm font-medium text-neutral-700 mb-1">Unidade</label>
          <div className="flex items-center gap-2">
            <select id="pi-unit" {...register('unit')} className="flex-1 px-3 py-2 border border-border rounded-lg text-sm">
              <option value="">Selecione...</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            {tenantId && (
              <button
                type="button"
                onClick={() => setShowUnitModal(true)}
                className="text-xs text-primary-600 hover:text-primary-800 cursor-pointer whitespace-nowrap"
                data-testid="quick-create-unit-btn"
              >
                + Nova
              </button>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="pi-barcode" className="block text-sm font-medium text-neutral-700 mb-1">Código de Barras</label>
          <input id="pi-barcode" {...register('barcode')} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
        </div>

        <div>
          <label htmlFor="pi-tags" className="block text-sm font-medium text-neutral-700 mb-1">Tags (separadas por vírgula)</label>
          <input id="pi-tags" {...register('tags')} className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="tag1, tag2, tag3" />
        </div>

        <div>
          <label htmlFor="pi-product-kind" className="block text-sm font-medium text-neutral-700 mb-1">Tipo de Produto</label>
          <select id="pi-product-kind" {...register('product_kind')} className="w-full px-3 py-2 border border-border rounded-lg text-sm">
            {PRODUCT_KIND_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" {...register('is_active')} className="rounded border-border" />
          Ativo
        </label>

        <div className="pt-4">
          <button
            type="submit"
            className="px-6 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 cursor-pointer"
          >
            Continuar
          </button>
        </div>
      </form>

      <CategoryQuickCreateModal open={showCatModal} tenantId={tenantId} onClose={() => setShowCatModal(false)} />
      <UnitQuickCreateModal open={showUnitModal} tenantId={tenantId} onClose={() => setShowUnitModal(false)} />
    </div>
  )
}
