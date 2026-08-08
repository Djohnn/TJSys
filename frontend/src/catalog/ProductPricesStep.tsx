import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'

import { useTenant } from '@/tenant/TenantProvider'
import { isApiProblemError } from '@/api/problem'
import {
  fetchProductPriceTiers,
  createProductPriceTier,
  deleteProductPriceTier,
} from './catalogApi'
import { priceTierSchema, type PriceTierFormData } from './catalogSchemas'
import Button from '@/components/ui/Button'

interface ProductPricesStepProps {
  productId: string
}

export default function ProductPricesStep({ productId }: ProductPricesStepProps): ReactNode {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''
  const queryClient = useQueryClient()

  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const { data: priceTiersData, isLoading: tiersLoading } = useQuery({
    queryKey: ['product-price-tiers', tenantId, productId],
    queryFn: () => fetchProductPriceTiers(tenantId, productId),
    enabled: !!tenantId && !!productId,
  })
  const priceTiers = Array.isArray(priceTiersData)
    ? priceTiersData
    : priceTiersData?.results ?? []

  const {
    register: registerTier,
    handleSubmit: handleTierSubmit,
    reset: resetTier,
    formState: { errors: tierErrors },
  } = useForm<PriceTierFormData>({
    resolver: zodResolver(priceTierSchema),
    defaultValues: { min_quantity: '', amount: '' },
  })

  const tierCreateMutation = useMutation({
    mutationFn: (data: PriceTierFormData) =>
      createProductPriceTier(tenantId, productId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-price-tiers', tenantId, productId] })
      resetTier()
      setFeedback({ kind: 'success', text: 'Faixa de preço adicionada.' })
    },
    onError: (err) => {
      setFeedback({ kind: 'error', text: isApiProblemError(err) ? err.problem.detail : 'Erro ao adicionar faixa de preço.' })
    },
  })

  const tierDeleteMutation = useMutation({
    mutationFn: (tierId: string) =>
      deleteProductPriceTier(tenantId, productId, tierId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-price-tiers', tenantId, productId] })
      setFeedback({ kind: 'success', text: 'Faixa de preço removida.' })
    },
    onError: (err) => {
      setFeedback({ kind: 'error', text: isApiProblemError(err) ? err.problem.detail : 'Erro ao remover faixa de preço.' })
    },
  })

  const handleAddTier = useCallback(() => {
    handleTierSubmit((data) => tierCreateMutation.mutate(data))()
  }, [handleTierSubmit, tierCreateMutation])

  return (
    <div data-testid="product-prices-step" className="space-y-4">
      <h2 className="text-xl font-bold text-neutral-900 mb-6">Preços</h2>

      {feedback && (
        <div role={feedback.kind === 'error' ? 'alert' : 'status'} className={feedback.kind === 'error' ? 'text-danger text-sm' : 'text-success text-sm'} data-testid="price-feedback">
          {feedback.text}
        </div>
      )}

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-neutral-800 border-b border-border pb-2">Preços por Quantidade</h3>

        {tiersLoading ? (
          <p className="text-sm text-neutral-500">Carregando faixas de preço...</p>
        ) : (
          <div data-testid="price-tiers-section">
            {priceTiers && priceTiers.length > 0 && (
              <table data-testid="price-tiers-table" className="w-full text-sm border border-border rounded-lg">
                <thead>
                  <tr className="bg-neutral-50 border-b border-border">
                    <th className="px-3 py-2 text-left font-medium text-neutral-600">Qtd. Mínima</th>
                    <th className="px-3 py-2 text-left font-medium text-neutral-600">Valor</th>
                    <th className="px-3 py-2 text-left font-medium text-neutral-600">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {priceTiers.map((tier) => (
                    <tr key={tier.id} data-testid="price-tier-row" className="border-b border-border last:border-0">
                      <td className="px-3 py-2">{tier.min_quantity}</td>
                      <td className="px-3 py-2">{tier.amount}</td>
                      <td className="px-3 py-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => tierDeleteMutation.mutate(tier.id)}
                          disabled={tierDeleteMutation.isPending}
                          data-testid={`delete-tier-${tier.id}`}
                        >
                          Remover
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="flex items-end gap-3 p-3 bg-neutral-50 rounded-lg border border-border mt-4">
              <div>
                <label htmlFor="tier-min-quantity" className="block text-sm font-medium text-neutral-700 mb-1">Qtd. Mínima</label>
                <input
                  id="tier-min-quantity"
                  {...registerTier('min_quantity')}
                  className="w-28 px-3 py-2 border border-border rounded-lg text-sm"
                  data-testid="tier-min-quantity-input"
                  placeholder="1"
                />
                {tierErrors.min_quantity && <span role="alert" className="text-xs text-red-600 mt-1 block">{tierErrors.min_quantity.message}</span>}
              </div>
              <div>
                <label htmlFor="tier-amount" className="block text-sm font-medium text-neutral-700 mb-1">Valor</label>
                <input
                  id="tier-amount"
                  {...registerTier('amount')}
                  className="w-28 px-3 py-2 border border-border rounded-lg text-sm"
                  data-testid="tier-amount-input"
                  placeholder="0.00"
                />
                {tierErrors.amount && <span role="alert" className="text-xs text-red-600 mt-1 block">{tierErrors.amount.message}</span>}
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleAddTier}
                disabled={tierCreateMutation.isPending}
                loading={tierCreateMutation.isPending}
                data-testid="add-tier-button"
              >
                Adicionar
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
