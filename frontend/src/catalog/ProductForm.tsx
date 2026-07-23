import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import type { PaginatedResponse, Category, Unit } from './catalogApi'
import { productSchema, type ProductFormData } from './catalogSchemas'

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
        <div data-testid="form-error" role="alert" style={{ color: 'red' }}>
          {submitError}
        </div>
      )}

      <div>
        <label htmlFor="product-name">Nome</label>
        <input id="product-name" {...register('name')} />
        {errors.name && <span role="alert" style={{ color: 'red' }}>{errors.name.message}</span>}
      </div>

      <div>
        <label htmlFor="product-sku">SKU</label>
        <input id="product-sku" {...register('sku')} />
      </div>

      <div>
        <label htmlFor="product-barcode">Código de Barras</label>
        <input id="product-barcode" {...register('barcode')} />
      </div>

      <div>
        <label htmlFor="product-category">Categoria</label>
        <select id="product-category" {...register('category')}>
          <option value="">Selecione...</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="product-unit">Unidade</label>
        <select id="product-unit" {...register('unit')}>
          <option value="">Selecione...</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label>
          <input type="checkbox" {...register('is_active')} />
          Ativo
        </label>
      </div>

      <div>
        <button type="submit" disabled={isPending}>
          {isPending ? 'Salvando...' : 'Salvar'}
        </button>
        <button type="button" onClick={onCancel} disabled={isPending}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
