import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import { fetchBranches, fetchStockLocations } from '@/inventory/inventoryApi'
import Skeleton from '@/components/ui/Skeleton'

interface ProductStockFieldsProps {
  register: any
  errors: any
  currentQuantity?: string
  setValue?: any
  watch?: any
}

export default function ProductStockFields({
  register,
  errors,
  currentQuantity = '0',
  setValue,
  watch,
}: ProductStockFieldsProps): ReactNode {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''

  const { data: branchesData, isLoading: branchesLoading } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: ({ signal }) => fetchBranches(tenantId, signal),
    enabled: !!tenantId,
  })
  const branches = branchesData?.results ?? []

  const selectedBranch = watch?.('stock.branch') ?? ''
  const { data: locationsData, isLoading: locationsLoading } = useQuery({
    queryKey: ['stock-locations', tenantId, selectedBranch],
    queryFn: ({ signal }) => fetchStockLocations(tenantId, { branch: selectedBranch }, signal),
    enabled: !!tenantId && !!selectedBranch,
  })

  const locations = locationsData?.results ?? []

  return (
    <div data-testid="product-stock-fields" className="space-y-4 rounded-lg border border-border bg-neutral-50/60 p-4">
      <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-neutral-500">Configuração de estoque</h3>

      <div>
        <label htmlFor="stock-branch" className="block text-sm font-medium text-neutral-700 mb-1">Filial</label>
        {branchesLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <select
            id="stock-branch"
            {...register('stock.branch', {
              onChange: () => {
                if (setValue) setValue('stock.location', '')
              },
            })}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white"
            data-testid="stock-branch-select"
          >
            <option value="">Selecione...</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}
        {errors?.branch && (
          <p role="alert" className="text-xs text-red-600 mt-1">{errors.branch.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="stock-location" className="block text-sm font-medium text-neutral-700 mb-1">Local de estoque</label>
        {locationsLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <select
            id="stock-location"
            {...register('stock.location')}
            disabled={!selectedBranch}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white disabled:bg-neutral-100"
            data-testid="stock-location-select"
          >
            <option value="">Selecione...</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name} ({l.code})</option>
            ))}
          </select>
        )}
        {errors?.location && (
          <p role="alert" className="text-xs text-red-600 mt-1">{errors.location.message}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="stock-current-qty" className="block text-sm font-medium text-neutral-700 mb-1">Quantidade atual</label>
          <input
            id="stock-current-qty"
            value={currentQuantity}
            disabled
            className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-neutral-100"
            data-testid="stock-current-quantity"
          />
        </div>

        <div>
          <label htmlFor="stock-initial-qty" className="block text-sm font-medium text-neutral-700 mb-1">Quantidade inicial</label>
          <input
            id="stock-initial-qty"
            type="number"
            step="0.000001"
            {...register('stock.initial_quantity')}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm"
            data-testid="stock-initial-quantity"
          />
          {errors?.initial_quantity && (
            <p role="alert" className="text-xs text-red-600 mt-1">{errors.initial_quantity.message}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="stock-min-qty" className="block text-sm font-medium text-neutral-700 mb-1">Quantidade mínima</label>
          <input
            id="stock-min-qty"
            type="number"
            step="0.000001"
            {...register('stock.minimum_quantity')}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm"
            data-testid="stock-minimum-quantity"
          />
          {errors?.minimum_quantity && (
            <p role="alert" className="text-xs text-red-600 mt-1">{errors.minimum_quantity.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="stock-max-qty" className="block text-sm font-medium text-neutral-700 mb-1">Quantidade máxima</label>
          <input
            id="stock-max-qty"
            type="number"
            step="0.000001"
            {...register('stock.maximum_quantity')}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm"
            data-testid="stock-maximum-quantity"
          />
          {errors?.maximum_quantity && (
            <p role="alert" className="text-xs text-red-600 mt-1">{errors.maximum_quantity.message}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="stock-reorder" className="block text-sm font-medium text-neutral-700 mb-1">Ponto de reposição</label>
          <input
            id="stock-reorder"
            type="number"
            step="0.000001"
            {...register('stock.reorder_point')}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm"
            data-testid="stock-reorder-point"
          />
          {errors?.reorder_point && (
            <p role="alert" className="text-xs text-red-600 mt-1">{errors.reorder_point.message}</p>
          )}
        </div>

        <label className="flex items-end gap-2 text-sm text-neutral-700 pb-2">
          <input
            type="checkbox"
            {...register('stock.allow_negative')}
            className="rounded border-border"
            data-testid="stock-allow-negative"
          />
          Permitir estoque negativo
        </label>
      </div>
    </div>
  )
}
