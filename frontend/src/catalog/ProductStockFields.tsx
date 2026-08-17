import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type {
  FieldErrors,
  UseFormRegister,
  UseFormSetValue,
  UseFormWatch,
} from 'react-hook-form'

import { useTenant } from '@/tenant/TenantProvider'
import {
  fetchBranches,
  fetchStockLocations,
  type Branch,
  type StockLocation,
} from '@/inventory/inventoryApi'
import type { ProductFormData } from './catalogSchemas'

interface ProductStockFieldsProps {
  register: UseFormRegister<ProductFormData>
  errors?: FieldErrors<ProductFormData>['stock']
  setValue: UseFormSetValue<ProductFormData>
  watch: UseFormWatch<ProductFormData>
}

function errorMessage(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('message' in error)) return undefined
  const message = (error as { message?: unknown }).message
  return typeof message === 'string' ? message : undefined
}

export default function ProductStockFields({
  register,
  errors,
  setValue,
  watch,
}: ProductStockFieldsProps): ReactNode {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''
  const branch = watch('stock.branch') ?? ''

  const { data: branchesData } = useQuery({
    queryKey: ['branches', tenantId, 1],
    queryFn: ({ signal }) => fetchBranches(tenantId, signal),
    enabled: !!tenantId,
  })

  const { data: locationsData } = useQuery({
    queryKey: ['stock-locations', tenantId, branch],
    queryFn: ({ signal }) => fetchStockLocations(tenantId, { branch }, signal),
    enabled: !!tenantId && !!branch,
  })

  const branches: Branch[] = branchesData?.results ?? []
  const locations: StockLocation[] = locationsData?.results ?? []
  const branchError = errorMessage(errors?.branch)
  const locationError = errorMessage(errors?.location)
  const currentQuantityError = errorMessage(errors?.current_quantity)
  const initialQuantityError = errorMessage(errors?.initial_quantity)
  const minimumQuantityError = errorMessage(errors?.minimum_quantity)
  const maximumQuantityError = errorMessage(errors?.maximum_quantity)
  const reorderPointError = errorMessage(errors?.reorder_point)

  return (
    <div data-testid="product-stock-fields" className="space-y-4">
      <div>
        <label htmlFor="product-stock-branch" className="block text-sm font-medium text-neutral-700 mb-1">
          Filial
        </label>
        <select
          id="product-stock-branch"
          {...register('stock.branch', {
            onChange: () => setValue('stock.location', ''),
          })}
          className="w-full px-3 py-2 border border-border rounded-lg text-sm"
        >
          <option value="">Selecione...</option>
          {branches.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
        {branchError && <span role="alert" className="text-xs text-red-600 mt-1 block">{branchError}</span>}
      </div>

      <div>
        <label htmlFor="product-stock-location" className="block text-sm font-medium text-neutral-700 mb-1">
          Local de estoque
        </label>
        <select
          id="product-stock-location"
          data-testid="stock-location-select"
          {...register('stock.location')}
          disabled={!branch}
          className="w-full px-3 py-2 border border-border rounded-lg text-sm"
        >
          <option value="">Selecione...</option>
          {locations.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
        {locationError && <span role="alert" className="text-xs text-red-600 mt-1 block">{locationError}</span>}
      </div>

      <div>
        <label htmlFor="product-stock-current-quantity" className="block text-sm font-medium text-neutral-700 mb-1">
          Quantidade atual
        </label>
        <input
          id="product-stock-current-quantity"
          type="number"
          step="any"
          disabled
          {...register('stock.current_quantity')}
          className="w-full px-3 py-2 border border-border rounded-lg text-sm disabled:bg-neutral-100"
        />
        {currentQuantityError && <span role="alert" className="text-xs text-red-600 mt-1 block">{currentQuantityError}</span>}
      </div>

      <div>
        <label htmlFor="product-stock-initial-quantity" className="block text-sm font-medium text-neutral-700 mb-1">
          Quantidade inicial
        </label>
        <input
          id="product-stock-initial-quantity"
          type="number"
          step="any"
          {...register('stock.initial_quantity')}
          className="w-full px-3 py-2 border border-border rounded-lg text-sm"
        />
        {initialQuantityError && <span role="alert" className="text-xs text-red-600 mt-1 block">{initialQuantityError}</span>}
      </div>

      <div>
        <label htmlFor="product-stock-minimum-quantity" className="block text-sm font-medium text-neutral-700 mb-1">
          Quantidade mínima
        </label>
        <input
          id="product-stock-minimum-quantity"
          type="number"
          step="any"
          {...register('stock.minimum_quantity')}
          className="w-full px-3 py-2 border border-border rounded-lg text-sm"
        />
        {minimumQuantityError && <span role="alert" className="text-xs text-red-600 mt-1 block">{minimumQuantityError}</span>}
      </div>

      <div>
        <label htmlFor="product-stock-maximum-quantity" className="block text-sm font-medium text-neutral-700 mb-1">
          Quantidade máxima
        </label>
        <input
          id="product-stock-maximum-quantity"
          type="number"
          step="any"
          {...register('stock.maximum_quantity')}
          className="w-full px-3 py-2 border border-border rounded-lg text-sm"
        />
        {maximumQuantityError && <span role="alert" className="text-xs text-red-600 mt-1 block">{maximumQuantityError}</span>}
      </div>

      <div>
        <label htmlFor="product-stock-reorder-point" className="block text-sm font-medium text-neutral-700 mb-1">
          Ponto de reposição
        </label>
        <input
          id="product-stock-reorder-point"
          type="number"
          step="any"
          {...register('stock.reorder_point')}
          className="w-full px-3 py-2 border border-border rounded-lg text-sm"
        />
        {reorderPointError && <span role="alert" className="text-xs text-red-600 mt-1 block">{reorderPointError}</span>}
      </div>

      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <input type="checkbox" {...register('stock.allow_negative')} className="rounded border-border" />
        Permitir estoque negativo
      </label>
    </div>
  )
}
