import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Decimal from 'decimal.js'

import { isApiProblemError } from '@/api/problem'
import { useTenant } from '@/tenant/TenantProvider'
import Button from '@/components/ui/Button'
import {
  createProductPrice,
  createProductPricingSnapshot,
  createProductPriceTier,
  deleteProductPriceTier,
  fetchProductPriceTiers,
  fetchProductPrices,
  updateProductPrice,
} from './catalogApi'
import type { ProductPricingSnapshot, ProductPriceTier, ProductPrice } from './catalogApi'
import { priceTierSchema, type PriceTierFormData } from './catalogSchemas'

interface ProductPricesStepProps { productId: string }
type PriceRecord = ProductPrice | ProductPricingSnapshot
type TierRecord = ProductPriceTier | ProductPricingSnapshot['tiers'][number]

export default function ProductPricesStep({ productId }: ProductPricesStepProps): ReactNode {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''
  const queryClient = useQueryClient()
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [baseAmount, setBaseAmount] = useState('')
  const [referenceTime] = useState(() => Date.now())
  const [r4CommandId] = useState(createCommandId)

  const basePriceQuery = useQuery({
    queryKey: ['product-prices', tenantId, productId],
    queryFn: () => fetchProductPrices(tenantId, productId),
    enabled: Boolean(tenantId && productId),
  })
  const r4Snapshot = isPricingSnapshot(basePriceQuery.data) ? basePriceQuery.data : null
  const basePrices: PriceRecord[] = r4Snapshot
    ? [r4Snapshot]
    : collectionResults<ProductPrice>(basePriceQuery.data)
  const effectiveBasePrices = basePrices.filter((price) => {
    if ('is_active' in price && price.is_active === false) return false
    const validFrom = Date.parse(price.valid_from ?? '')
    const validTo = price.valid_to ? Date.parse(price.valid_to) : null
    return (!Number.isNaN(validFrom) ? validFrom <= referenceTime : true)
      && (validTo === null || Number.isNaN(validTo) || validTo > referenceTime)
  })
  const basePrice = effectiveBasePrices.length === 1 ? effectiveBasePrices[0] : null

  useEffect(() => { setBaseAmount(basePrice?.amount ?? '') }, [basePrice?.id, basePrice?.amount])

  const tiersQuery = useQuery({
    queryKey: ['product-price-tiers', tenantId, productId],
    queryFn: () => fetchProductPriceTiers(tenantId, productId),
    enabled: Boolean(tenantId && productId),
  })
  const priceTiers: TierRecord[] = r4Snapshot?.tiers ?? collectionResults<ProductPriceTier>(tiersQuery.data)
  const shouldUseR4Write = r4Snapshot !== null || effectiveBasePrices.length === 0

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
      if (!basePrice || r4Snapshot) throw new Error('Use o salvamento do card R4 para atualizar as faixas.')
      return createProductPriceTier(tenantId, productId, { ...data, price: basePrice.id })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-price-tiers', tenantId, productId] })
      resetTier()
      setFeedback({ kind: 'success', text: 'Faixa de preço adicionada.' })
    },
    onError: (error) => setFeedback({ kind: 'error', text: problemMessage(error, 'Erro ao adicionar faixa de preço.') }),
  })

  const tierDeleteMutation = useMutation({
    mutationFn: (tierId: string) => deleteProductPriceTier(tenantId, productId, tierId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-price-tiers', tenantId, productId] })
      setFeedback({ kind: 'success', text: 'Faixa de preço removida.' })
    },
    onError: (error) => setFeedback({ kind: 'error', text: problemMessage(error, 'Erro ao remover faixa de preço.') }),
  })

  const basePriceMutation = useMutation({
    mutationFn: () => {
      if (shouldUseR4Write) {
        return createProductPricingSnapshot(tenantId, productId, {
          command_id: r4CommandId,
          product_id: productId,
          amount: baseAmount,
          tiers: priceTiers.map((tier) => ({ min_quantity: tier.min_quantity, amount: tier.amount })),
        })
      }
      if (basePrice) return updateProductPrice(tenantId, productId, basePrice.id, { amount: baseAmount }, basePrice.version)
      return createProductPrice(tenantId, productId, { amount: baseAmount })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-prices', tenantId, productId] })
      setFeedback({ kind: 'success', text: 'Preço de venda varejo salvo.' })
    },
    onError: (error) => setFeedback({ kind: 'error', text: problemMessage(error, 'Erro ao salvar preço de venda varejo.') }),
  })

  const handleAddTier = useCallback(() => {
    handleTierSubmit((data) => tierCreateMutation.mutate(data))()
  }, [handleTierSubmit, tierCreateMutation])

  return (
    <div data-testid="product-prices-step" className="space-y-4">
      <h2 className="mb-6 text-xl font-bold text-neutral-900">Custo / Varejo / Atacado / Margens</h2>
      {feedback && <div role={feedback.kind === 'error' ? 'alert' : 'status'} aria-live="polite" data-testid="price-feedback" className={feedback.kind === 'error' ? 'text-danger text-sm' : 'text-success text-sm'}>{feedback.text}</div>}

      <section data-testid="base-price-section" className="space-y-2">
        <h3 className="border-b border-border pb-2 text-lg font-semibold text-neutral-800">Venda varejo</h3>
        {basePriceQuery.isLoading ? <p role="status" aria-live="polite" className="text-sm text-neutral-700">Carregando preço de venda varejo...</p> : basePriceQuery.isError ? (
          <div role="alert" aria-live="assertive" data-testid="base-price-load-error" className="text-sm text-danger">
            {problemMessage(basePriceQuery.error, 'Não foi possível carregar o preço de venda varejo.')}
            <Button type="button" variant="ghost" size="sm" onClick={() => basePriceQuery.refetch()}>Tentar novamente</Button>
          </div>
        ) : effectiveBasePrices.length > 1 ? (
          <p role="alert" data-testid="base-price-conflict" className="text-sm text-danger">Foram encontrados múltiplos preços de venda varejo. Corrija o cadastro antes de vender.</p>
        ) : (
          <>
            {r4Snapshot && <dl data-testid="r4-pricing-summary" className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-4" aria-label="Resumo de precificação">
              <Metric label="Custo" value={formatMoney(r4Snapshot.cost, r4Snapshot.currency)} />
              <Metric label="Venda varejo" value={formatMoney(r4Snapshot.amount, r4Snapshot.currency)} />
              <Metric label="Margem varejo" value={formatPercent(r4Snapshot.retail_margin ?? marginFromValues(r4Snapshot.amount, r4Snapshot.cost))} />
              <Metric label="Atacado" value={r4Snapshot.tiers.length ? `${r4Snapshot.tiers.length} faixa(s)` : 'Nenhuma faixa'} />
            </dl>}
            {effectiveBasePrices.length === 0 && <p data-testid="base-price-empty" className="text-sm text-neutral-700">Nenhum preço base cadastrado. Nenhum preço de venda varejo cadastrado.</p>}
            <div className="flex items-end gap-3">
              <div><label htmlFor="base-price-amount" className="mb-1 block text-sm font-medium text-neutral-700">Valor de venda varejo</label><input id="base-price-amount" value={baseAmount} onChange={(event) => setBaseAmount(event.target.value)} className="w-32 rounded-lg border border-border px-3 py-2 text-sm" placeholder="0.00" data-testid="base-price-amount" /></div>
              <Button type="button" variant="secondary" size="sm" onClick={() => basePriceMutation.mutate()} disabled={basePriceQuery.isError || !baseAmount || basePriceMutation.isPending} loading={basePriceMutation.isPending} data-testid="save-base-price">Salvar venda varejo</Button>
            </div>
          </>
        )}
      </section>

      <section className="space-y-4" aria-labelledby="wholesale-heading">
        <h3 id="wholesale-heading" className="border-b border-border pb-2 text-lg font-semibold text-neutral-800">Venda atacado por quantidade</h3>
        {tiersQuery.isLoading && !r4Snapshot ? <p role="status" aria-live="polite" className="text-sm text-neutral-700">Carregando faixas de atacado...</p> : !r4Snapshot && tiersQuery.isError ? (
          <div role="alert" aria-live="assertive" data-testid="price-tiers-load-error" className="text-sm text-danger">
            {problemMessage(tiersQuery.error, 'Não foi possível carregar as faixas de atacado.')}
            <Button type="button" variant="ghost" size="sm" onClick={() => tiersQuery.refetch()}>Tentar novamente</Button>
          </div>
        ) : (
          <div data-testid="price-tiers-section">
            {priceTiers.length > 0 && <table data-testid="price-tiers-table" className="w-full border border-border text-sm"><thead><tr className="border-b border-border bg-neutral-50"><th scope="col" className="px-3 py-2 text-left font-medium text-neutral-600">Qtd. mínima</th><th scope="col" className="px-3 py-2 text-left font-medium text-neutral-600">Venda atacado</th><th scope="col" className="px-3 py-2 text-left font-medium text-neutral-600">Margem</th><th scope="col" className="px-3 py-2 text-left font-medium text-neutral-600">Ações</th></tr></thead><tbody>{priceTiers.map((tier) => <tr key={tier.id} data-testid="price-tier-row" className="border-b border-border last:border-0"><td className="px-3 py-2">{tier.min_quantity}</td><td className="px-3 py-2">{tier.amount}</td><td className="px-3 py-2">{'margin' in tier ? formatPercent(tier.margin ?? marginFromValues(tier.amount, r4Snapshot?.cost)) : 'Não informado'}</td><td className="px-3 py-2"><Button type="button" variant="ghost" size="sm" aria-label={`Remover faixa de atacado a partir de ${tier.min_quantity} unidades`} onClick={() => tierDeleteMutation.mutate(tier.id)} disabled={Boolean(basePriceQuery.isError || r4Snapshot || tierDeleteMutation.isPending)} data-testid={`delete-tier-${tier.id}`}>Remover</Button></td></tr>)}</tbody></table>}
            {priceTiers.length === 0 && <p data-testid="price-tiers-empty" className="text-sm text-neutral-700">Nenhuma faixa de venda atacado cadastrada.</p>}
            {!r4Snapshot && <div className="mt-4 flex items-end gap-3 rounded-lg border border-border bg-neutral-50 p-3"><div><label htmlFor="tier-min-quantity" className="mb-1 block text-sm font-medium text-neutral-700">Qtd. mínima</label><input id="tier-min-quantity" {...registerTier('min_quantity')} aria-invalid={Boolean(tierErrors.min_quantity)} aria-describedby={tierErrors.min_quantity ? 'tier-min-quantity-error' : undefined} className="w-28 rounded-lg border border-border px-3 py-2 text-sm" data-testid="tier-min-quantity-input" placeholder="1" />{tierErrors.min_quantity && <span id="tier-min-quantity-error" role="alert" className="mt-1 block text-xs text-danger">{tierErrors.min_quantity.message}</span>}</div><div><label htmlFor="tier-amount" className="mb-1 block text-sm font-medium text-neutral-700">Venda atacado</label><input id="tier-amount" {...registerTier('amount')} aria-invalid={Boolean(tierErrors.amount)} aria-describedby={tierErrors.amount ? 'tier-amount-error' : undefined} className="w-28 rounded-lg border border-border px-3 py-2 text-sm" data-testid="tier-amount-input" placeholder="0.00" />{tierErrors.amount && <span id="tier-amount-error" role="alert" className="mt-1 block text-xs text-danger">{tierErrors.amount.message}</span>}</div><Button type="button" variant="secondary" size="sm" onClick={handleAddTier} disabled={Boolean(basePriceQuery.isError || !basePrice || tierCreateMutation.isPending)} loading={tierCreateMutation.isPending} data-testid="add-tier-button">Adicionar</Button></div>}
          </div>
        )}
      </section>
    </div>
  )
}

export function SprintR4Page(): ReactNode {
  const { productId } = useParams<{ productId: string }>()
  if (!productId) return <div role="alert">Produto inválido.</div>
  return <main aria-labelledby="r4-title" className="mx-auto max-w-[1100px]"><h1 id="r4-title" className="mb-6 text-2xl font-bold text-neutral-900">Venda varejo</h1><ProductPricesStep productId={productId} /></main>
}

function isPricingSnapshot(value: unknown): value is ProductPricingSnapshot {
  return Boolean(value && typeof value === 'object' && 'amount' in value && 'tiers' in value && !('results' in value))
}

function collectionResults<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  if (value && typeof value === 'object' && 'results' in value && Array.isArray(value.results)) return value.results as T[]
  return []
}

function createCommandId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `r4-${Date.now()}`
}

function problemMessage(error: unknown, fallback: string): string {
  if (!isApiProblemError(error)) return fallback
  return error.problem.status === 409 ? `Conflito: ${error.problem.detail || error.problem.title}` : error.problem.detail || error.problem.title
}

function marginFromValues(amount: string | null | undefined, cost: string | null | undefined): string | null {
  if (!amount || !cost) return null
  const sale = new Decimal(amount)
  if (sale.isZero() || sale.isNegative()) return null
  return sale.minus(new Decimal(cost)).div(sale).times(100).toDecimalPlaces(2).toFixed(2)
}

function formatMoney(value: string | null | undefined, currency = 'BRL'): string {
  return value === null || value === undefined ? 'Não informado' : `${currency} ${new Decimal(value).toFixed(2)}`
}

function formatPercent(value: string | null | undefined): string {
  return value === null || value === undefined ? 'Não informado' : `${new Decimal(value).toFixed(2)}%`
}

function Metric({ label, value }: { label: string; value: string }): ReactNode {
  return <div><dt className="text-sm text-neutral-700">{label}</dt><dd className="mt-1 font-semibold text-neutral-900">{value}</dd></div>
}
