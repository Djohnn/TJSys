import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import { useTenant } from '@/tenant/TenantProvider'
import { isApiProblemError } from '@/api/problem'
import {
  fetchProductPriceTiers,
  createProductPriceTier,
  deleteProductPriceTier,
  fetchProductPrices,
  createProductPrice,
  updateProductPrice,
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
  const [baseAmount, setBaseAmount] = useState('')
  const [referenceTime] = useState(() => Date.now())

  const {
    data: basePricesData,
    isLoading: basePriceLoading,
    isError: basePriceError,
    refetch: refetchBasePrice,
  } = useQuery({
    queryKey: ['product-prices', tenantId, productId],
    queryFn: () => fetchProductPrices(tenantId, productId),
    enabled: !!tenantId && !!productId,
  })
  const basePrices = Array.isArray(basePricesData)
    ? basePricesData
    : basePricesData?.results ?? []
  const effectiveBasePrices = basePrices.filter((price) => {
    if (price.is_active === false) return false
    const validFrom = Date.parse(price.valid_from)
    const validTo = price.valid_to ? Date.parse(price.valid_to) : null
    return (!Number.isNaN(validFrom) ? validFrom <= referenceTime : true)
      && (validTo === null || Number.isNaN(validTo) || validTo > referenceTime)
  })
  const basePrice = effectiveBasePrices.length === 1 ? effectiveBasePrices[0] : null

  useEffect(() => {
    setBaseAmount(basePrice?.amount ?? '')
  }, [basePrice?.id, basePrice?.amount])

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
    mutationFn: (data: PriceTierFormData) => {
      if (!basePrice) throw new Error('Cadastre um preço base antes das faixas.')
      return createProductPriceTier(tenantId, productId, { ...data, price: basePrice.id })
    },
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

  const basePriceMutation = useMutation({
    mutationFn: () => {
      const data = { amount: baseAmount }
      if (basePrice) {
        return updateProductPrice(tenantId, productId, basePrice.id, data, basePrice.version)
      }
      return createProductPrice(tenantId, productId, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-prices', tenantId, productId] })
      setFeedback({ kind: 'success', text: 'Preço base salvo.' })
    },
    onError: (err) => {
      setFeedback({ kind: 'error', text: isApiProblemError(err) ? err.problem.detail : 'Erro ao salvar preço base.' })
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

      <section data-testid="base-price-section" className="space-y-2">
        <h3 className="text-lg font-semibold text-neutral-800 border-b border-border pb-2">Preço base</h3>
        {basePriceLoading ? (
          <p className="text-sm text-neutral-500">Carregando preço base...</p>
        ) : basePriceError ? (
          <div role="alert" data-testid="base-price-load-error" className="text-sm text-danger">
            Não foi possível carregar o preço base.
            <Button type="button" variant="ghost" size="sm" onClick={() => refetchBasePrice()}>
              Tentar novamente
            </Button>
          </div>
        ) : effectiveBasePrices.length > 1 ? (
          <p role="alert" data-testid="base-price-conflict" className="text-sm text-danger">
            Foram encontrados múltiplos preços base. Corrija o cadastro antes de vender.
          </p>
        ) : (
          <>
            {effectiveBasePrices.length === 0 && (
              <p data-testid="base-price-empty" className="text-sm text-neutral-500">Nenhum preço base cadastrado.</p>
            )}
            <div className="flex items-end gap-3">
              <div>
                <label htmlFor="base-price-amount" className="block text-sm font-medium text-neutral-700 mb-1">Valor</label>
                <input
                  id="base-price-amount"
                  value={baseAmount}
                  onChange={(event) => setBaseAmount(event.target.value)}
                  className="w-32 px-3 py-2 border border-border rounded-lg text-sm"
                  placeholder="0.00"
                  data-testid="base-price-amount"
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => basePriceMutation.mutate()}
                disabled={basePriceError || !baseAmount || basePriceMutation.isPending}
                loading={basePriceMutation.isPending}
                data-testid="save-base-price"
              >
                Salvar preço base
              </Button>
            </div>
          </>
        )}
      </section>

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
                          disabled={basePriceError || tierDeleteMutation.isPending}
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
                disabled={basePriceError || !basePrice || tierCreateMutation.isPending}
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
