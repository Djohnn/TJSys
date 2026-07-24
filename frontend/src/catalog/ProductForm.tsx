import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import type { PaginatedResponse, Category, Unit } from './catalogApi'
import { productSchema, type ProductFormData } from './catalogSchemas'
import Button from '@/components/ui/Button'

interface ProductFormProps {
  initialData?: ProductFormData
  onSubmit: (data: ProductFormData) => void
  onCancel: () => void
  isPending: boolean
  submitError: string | null
  setSubmitError: (err: string | null) => void
}

export default function ProductForm({
  initialData,
  onSubmit,
  onCancel,
  isPending,
  submitError,
  setSubmitError,
}: ProductFormProps): ReactNode {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''

  const { data: categoriesData } = useQuery({
    queryKey: ['categories', tenantId, 1],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<Category>>('/catalog/categories/?page=1', {
        tenantId,
        signal,
      }) as Promise<PaginatedResponse<Category>>,
    enabled: !!tenantId,
  })

  const { data: unitsData } = useQuery({
    queryKey: ['units', tenantId, 1],
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
    defaultValues: initialData ?? { name: '', sku: '', barcode: '', category: null, unit: null, is_active: true },
  })

  const categories = categoriesData?.results ?? []
  const units = unitsData?.results ?? []

  return (
    <form
      onSubmit={handleSubmit((data) => {
        setSubmitError(null)
        onSubmit(data)
      })}
      data-testid="product-form"
    >
      {submitError && (
        <div data-testid="form-error" role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {submitError}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label htmlFor="product-name" className="block text-sm font-medium text-neutral-700 mb-1">Nome</label>
          <input id="product-name" {...register('name')} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
          {errors.name && <span role="alert" className="text-xs text-red-600 mt-1 block">{errors.name.message}</span>}
        </div>

        <div>
          <label htmlFor="product-sku" className="block text-sm font-medium text-neutral-700 mb-1">SKU</label>
          <input id="product-sku" {...register('sku')} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
        </div>

        <div>
          <label htmlFor="product-barcode" className="block text-sm font-medium text-neutral-700 mb-1">Código de Barras</label>
          <input id="product-barcode" {...register('barcode')} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
        </div>

        <div>
          <label htmlFor="product-category" className="block text-sm font-medium text-neutral-700 mb-1">Categoria</label>
          <select id="product-category" {...register('category')} className="w-full px-3 py-2 border border-border rounded-lg text-sm">
            <option value="">Selecione...</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="product-unit" className="block text-sm font-medium text-neutral-700 mb-1">Unidade</label>
          <select id="product-unit" {...register('unit')} className="w-full px-3 py-2 border border-border rounded-lg text-sm">
            <option value="">Selecione...</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input type="checkbox" {...register('is_active')} className="rounded border-border" />
            Ativo
          </label>
        </div>

        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={isPending} loading={isPending}>
            {isPending ? 'Salvando...' : 'Salvar'}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel} disabled={isPending}>
            Cancelar
          </Button>
        </div>
      </div>
    </form>
  )
}
