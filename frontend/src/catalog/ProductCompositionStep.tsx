import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import type { ReactNode } from 'react'

import { useTenant } from '@/tenant/TenantProvider'
import {
  fetchProduct,
  fetchProducts,
  fetchComposition,
  createCompositionItem,
  deleteCompositionItem,
} from './catalogApi'
import { compositionSchema, type CompositionFormData } from './catalogSchemas'
import Button from '@/components/ui/Button'
import { formatQuantity } from '@/components/formatQuantity'
import { isApiProblemError } from '@/api/problem'

interface ProductCompositionStepProps {
  productId: string
}

export default function ProductCompositionStep({ productId }: ProductCompositionStepProps): ReactNode {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''
  const queryClient = useQueryClient()

  const { data: product } = useQuery({
    queryKey: ['product-composition-info', tenantId, productId],
    queryFn: () => fetchProduct(tenantId, productId),
    enabled: !!tenantId && !!productId,
  })

  const { data: compositionItems, isLoading: compositionLoading } = useQuery({
    queryKey: ['product-composition', tenantId, productId],
    queryFn: () => fetchComposition(tenantId, productId),
    enabled: !!tenantId && !!productId,
  })

  const { data: productsData } = useQuery({
    queryKey: ['products-for-composition', tenantId],
    queryFn: () => fetchProducts(tenantId, {}),
    enabled: !!tenantId,
  })

  const {
    register: registerComposition,
    handleSubmit: handleCompositionSubmit,
    reset: resetComposition,
    formState: { errors: compositionErrors },
  } = useForm<CompositionFormData>({
    resolver: zodResolver(compositionSchema),
    defaultValues: { component: '', quantity: '' },
  })

  const compositionAddMutation = useMutation({
    mutationFn: (data: CompositionFormData) =>
      createCompositionItem(tenantId, productId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-composition', tenantId, productId] })
      resetComposition()
    },
  })

  const compositionDeleteMutation = useMutation({
    mutationFn: (itemId: string) =>
      deleteCompositionItem(tenantId, productId, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-composition', tenantId, productId] })
    },
  })

  const handleAddComposition = useCallback(() => {
    handleCompositionSubmit((data) => compositionAddMutation.mutate(data))()
  }, [handleCompositionSubmit, compositionAddMutation])

  const nonKitProducts = productsData?.results.filter(
    (p) => p.product_kind !== 'kit' && p.is_active,
  ) ?? []

  const isKit = product?.product_kind === 'kit'
  const hasNoActiveComposition = !compositionItems || compositionItems.length === 0

  return (
    <div data-testid="product-composition-step" className="space-y-4">
      <h2 className="text-xl font-bold text-neutral-900 mb-6">Composição</h2>

      {product && !isKit && (
        <div role="status" data-testid="composition-not-kit" className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
          A composição está disponível somente para produtos do tipo Kit.
        </div>
      )}

      {compositionAddMutation.isError && (
        <div role="alert" className="text-danger text-sm" data-testid="composition-feedback">
          {isApiProblemError(compositionAddMutation.error)
            ? compositionAddMutation.error.problem.detail
            : 'Erro ao adicionar componente.'}
        </div>
      )}

      {isKit && hasNoActiveComposition && (
        <div
          role="alert"
          className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700"
          data-testid="composition-kit-warning"
        >
          Este produto é do tipo Kit mas não possui composição ativa. Adicione componentes abaixo.
        </div>
      )}

      {compositionLoading ? (
        <p className="text-sm text-neutral-500">Carregando composição...</p>
      ) : (
        <div data-testid="composition-section">
          {compositionItems && compositionItems.length > 0 && (
            <table data-testid="composition-table" className="w-full text-sm border border-border rounded-lg">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-3 py-2 text-left font-medium text-neutral-600">Componente</th>
                  <th className="px-3 py-2 text-left font-medium text-neutral-600">Qtd.</th>
                  <th className="px-3 py-2 text-left font-medium text-neutral-600">Ações</th>
                </tr>
              </thead>
              <tbody>
                {compositionItems.map((item) => (
                  <tr key={item.id} data-testid="composition-row" className="border-b border-border last:border-0">
                    <td className="px-3 py-2">{item.component_sku}</td>
                    <td className="px-3 py-2">{item.unit_precision == null ? item.quantity : formatQuantity(item.quantity, { precision: item.unit_precision, symbol: item.unit_symbol })}</td>
                    <td className="px-3 py-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => compositionDeleteMutation.mutate(item.id)}
                        disabled={compositionDeleteMutation.isPending}
                        data-testid={`delete-composition-${item.id}`}
                      >
                        Remover
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {isKit && <div className="flex items-end gap-3 p-3 bg-neutral-50 rounded-lg border border-border mt-4">
            <div>
              <label htmlFor="composition-component" className="block text-sm font-medium text-neutral-700 mb-1">Componente</label>
              <select
                id="composition-component"
                {...registerComposition('component')}
                className="w-56 px-3 py-2 border border-border rounded-lg text-sm"
                data-testid="composition-component-select"
              >
                <option value="">Selecione...</option>
                {nonKitProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {compositionErrors.component && <span role="alert" className="text-xs text-red-600 mt-1 block">{compositionErrors.component.message}</span>}
            </div>
            <div>
              <label htmlFor="composition-quantity" className="block text-sm font-medium text-neutral-700 mb-1">Quantidade</label>
              <input
                id="composition-quantity"
                {...registerComposition('quantity')}
                className="w-28 px-3 py-2 border border-border rounded-lg text-sm"
                data-testid="composition-quantity-input"
                placeholder="1.00"
              />
              {compositionErrors.quantity && <span role="alert" className="text-xs text-red-600 mt-1 block">{compositionErrors.quantity.message}</span>}
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleAddComposition}
              disabled={compositionAddMutation.isPending}
              loading={compositionAddMutation.isPending}
              data-testid="add-composition-button"
            >
              Adicionar
            </Button>
          </div>}
        </div>
      )}
    </div>
  )
}
