import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useCallback } from 'react'
import type { ReactNode } from 'react'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import { isApiProblemError } from '@/api/problem'
import type { PaginatedResponse, Category, Unit } from './catalogApi'
import { catalogKeys } from './catalogQueryKeys'
import {
  fetchProductFiscalData,
  upsertProductFiscalData,
  fetchProductPriceTiers,
  createProductPriceTier,
  deleteProductPriceTier,
} from './catalogApi'
import {
  productSchema,
  type ProductFormData,
  fiscalDataSchema,
  type FiscalDataFormData,
  priceTierSchema,
  type PriceTierFormData,
} from './catalogSchemas'
import Button from '@/components/ui/Button'
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

const FISCAL_TYPE_OPTIONS = [
  { value: '', label: 'Selecione...' },
  { value: 'revenda', label: 'Revenda' },
  { value: 'industrializacao', label: 'Industrialização' },
  { value: 'servico', label: 'Serviço' },
  { value: 'uso_consumo', label: 'Uso e consumo' },
  { value: 'outro', label: 'Outro' },
]

const ORIGIN_CODE_OPTIONS = [
  { value: '0', label: '0 - Nacional' },
  { value: '1', label: '1 - Estrangeira (importação direta)' },
  { value: '2', label: '2 - Estrangeira (mercado interno)' },
  { value: '3', label: '3 - Nacional (conteúdo de importação > 40%)' },
  { value: '4', label: '4 - Nacional (conformidade com processos)' },
  { value: '5', label: '5 - Nacional (conteúdo de importação ≤ 40%)' },
  { value: '6', label: '6 - Estrangeira (importação direta, sem similar)' },
  { value: '7', label: '7 - Estrangeira (mercado interno, sem similar)' },
  { value: '8', label: '8 - Nacional (conteúdo de importação > 70%)' },
]

interface ProductFormProps {
  productId?: string | null
  initialData?: ProductFormData
  onSubmit: (data: ProductFormData) => void
  onCancel: () => void
  isPending: boolean
  submitError: string | null
  setSubmitError: (err: string | null) => void
}

export default function ProductForm({
  productId,
  initialData,
  onSubmit,
  onCancel,
  isPending,
  submitError,
  setSubmitError,
}: ProductFormProps): ReactNode {
  const { selectedTenant } = useTenant()
  const queryClient = useQueryClient()
  const tenantId = selectedTenant?.tenant_id ?? ''

  const [showCatModal, setShowCatModal] = useState(false)
  const [showUnitModal, setShowUnitModal] = useState(false)
  const [fiscalWarning, setFiscalWarning] = useState<string | null>(null)

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
      description: '',
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

  const showSubresources = !!productId

  const { data: fiscalData, isLoading: fiscalLoading } = useQuery({
    queryKey: ['product-fiscal-data', tenantId, productId],
    queryFn: () => fetchProductFiscalData(tenantId, productId!),
    enabled: showSubresources && !!tenantId,
  })

  const { data: priceTiersData, isLoading: tiersLoading } = useQuery({
    queryKey: ['product-price-tiers', tenantId, productId],
    queryFn: () => fetchProductPriceTiers(tenantId, productId!),
    enabled: showSubresources && !!tenantId,
  })
  const priceTiers = Array.isArray(priceTiersData)
    ? priceTiersData
    : priceTiersData?.results ?? []

  const {
    register: registerFiscal,
    handleSubmit: handleFiscalSubmit,
    formState: { errors: fiscalErrors },
  } = useForm<FiscalDataFormData>({
    resolver: zodResolver(fiscalDataSchema),
    values: fiscalData
      ? {
          fiscal_type: fiscalData.fiscal_type ?? '',
          ncm: fiscalData.ncm ?? '',
          cest: fiscalData.cest ?? '',
          origin_code: fiscalData.origin_code ?? '0',
          fiscal_class: fiscalData.fiscal_class ?? '',
        }
      : undefined,
  })

  const fiscalMutation = useMutation({
    mutationFn: (data: FiscalDataFormData) =>
      upsertProductFiscalData(tenantId, productId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-fiscal-data', tenantId, productId] })
      setFiscalWarning(null)
    },
    onError: (err) => {
      if (isApiProblemError(err)) {
        setFiscalWarning(err.problem.detail ?? 'Erro ao salvar dados fiscais.')
      } else {
        setFiscalWarning('Erro ao salvar dados fiscais.')
      }
    },
  })

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
      createProductPriceTier(tenantId, productId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-price-tiers', tenantId, productId] })
      resetTier()
    },
  })

  const tierDeleteMutation = useMutation({
    mutationFn: (tierId: string) =>
      deleteProductPriceTier(tenantId, productId!, tierId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-price-tiers', tenantId, productId] })
    },
  })

  const handleSaveFiscal = useCallback(() => {
    handleFiscalSubmit((data) => fiscalMutation.mutate(data))()
  }, [handleFiscalSubmit, fiscalMutation])

  const handleAddTier = useCallback(() => {
    handleTierSubmit((data) => tierCreateMutation.mutate(data))()
  }, [handleTierSubmit, tierCreateMutation])

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

      <div className="space-y-6">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-neutral-800 border-b border-border pb-2">Dados Básicos</h3>

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
            <div className="flex items-center gap-2">
              <select id="product-category" {...register('category')} className="flex-1 px-3 py-2 border border-border rounded-lg text-sm">
                <option value="">Selecione...</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
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
            <label htmlFor="product-unit" className="block text-sm font-medium text-neutral-700 mb-1">Unidade</label>
            <div className="flex items-center gap-2">
              <select id="product-unit" {...register('unit')} className="flex-1 px-3 py-2 border border-border rounded-lg text-sm">
                <option value="">Selecione...</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
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
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" {...register('is_active')} className="rounded border-border" />
              Ativo
            </label>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-neutral-800 border-b border-border pb-2">Dados Comerciais</h3>

          <div>
            <label htmlFor="product-kind" className="block text-sm font-medium text-neutral-700 mb-1">Tipo de Produto</label>
            <select id="product-kind" {...register('product_kind')} className="w-full px-3 py-2 border border-border rounded-lg text-sm" data-testid="product-kind-select">
              {PRODUCT_KIND_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="product-brand" className="block text-sm font-medium text-neutral-700 mb-1">Marca</label>
            <input id="product-brand" {...register('brand')} className="w-full px-3 py-2 border border-border rounded-lg text-sm" data-testid="product-brand-input" />
          </div>

          <div>
            <label htmlFor="product-model" className="block text-sm font-medium text-neutral-700 mb-1">Modelo</label>
            <input id="product-model" {...register('model')} className="w-full px-3 py-2 border border-border rounded-lg text-sm" data-testid="product-model-input" />
          </div>

          <div>
            <label htmlFor="product-tags" className="block text-sm font-medium text-neutral-700 mb-1">Tags (separadas por vírgula)</label>
            <input id="product-tags" {...register('tags')} className="w-full px-3 py-2 border border-border rounded-lg text-sm" data-testid="product-tags-input" placeholder="tag1, tag2, tag3" />
          </div>

          <div>
            <label htmlFor="product-scale-code" className="block text-sm font-medium text-neutral-700 mb-1">Código Balança</label>
            <input id="product-scale-code" {...register('scale_code')} className="w-full px-3 py-2 border border-border rounded-lg text-sm" data-testid="product-scale-code-input" />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" {...register('tracks_inventory')} className="rounded border-border" data-testid="product-tracks-inventory-checkbox" />
              Controla Estoque
            </label>
          </div>
        </div>

        {showSubresources && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-neutral-800 border-b border-border pb-2">Dados Fiscais</h3>

            {fiscalWarning && (
              <div role="alert" className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700" data-testid="fiscal-warning">
                {fiscalWarning}
              </div>
            )}

            {fiscalLoading ? (
              <p className="text-sm text-neutral-500">Carregando dados fiscais...</p>
            ) : (
              <div className="space-y-3" data-testid="fiscal-data-section">
                <div>
                  <label htmlFor="fiscal-type" className="block text-sm font-medium text-neutral-700 mb-1">Tipo Fiscal</label>
                  <select id="fiscal-type" {...registerFiscal('fiscal_type')} className="w-full px-3 py-2 border border-border rounded-lg text-sm" data-testid="fiscal-type-select">
                    {FISCAL_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="fiscal-ncm" className="block text-sm font-medium text-neutral-700 mb-1">NCM</label>
                  <input id="fiscal-ncm" {...registerFiscal('ncm')} className="w-full px-3 py-2 border border-border rounded-lg text-sm" data-testid="fiscal-ncm-input" />
                </div>

                <div>
                  <label htmlFor="fiscal-cest" className="block text-sm font-medium text-neutral-700 mb-1">CEST</label>
                  <input id="fiscal-cest" {...registerFiscal('cest')} className="w-full px-3 py-2 border border-border rounded-lg text-sm" data-testid="fiscal-cest-input" />
                </div>

                <div>
                  <label htmlFor="fiscal-origin-code" className="block text-sm font-medium text-neutral-700 mb-1">Código de Origem</label>
                  <select id="fiscal-origin-code" {...registerFiscal('origin_code')} className="w-full px-3 py-2 border border-border rounded-lg text-sm" data-testid="fiscal-origin-code-select">
                    {ORIGIN_CODE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  {fiscalErrors.origin_code && <span role="alert" className="text-xs text-red-600 mt-1 block">{fiscalErrors.origin_code.message}</span>}
                </div>

                <div>
                  <label htmlFor="fiscal-class" className="block text-sm font-medium text-neutral-700 mb-1">Classe Fiscal</label>
                  <input id="fiscal-class" {...registerFiscal('fiscal_class')} className="w-full px-3 py-2 border border-border rounded-lg text-sm" data-testid="fiscal-class-input" />
                </div>

                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleSaveFiscal}
                  disabled={fiscalMutation.isPending}
                  loading={fiscalMutation.isPending}
                >
                  {fiscalMutation.isPending ? 'Salvando...' : 'Salvar Dados Fiscais'}
                </Button>
              </div>
            )}
          </div>
        )}

        {showSubresources && (
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

                <div className="flex items-end gap-3 p-3 bg-neutral-50 rounded-lg border border-border">
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
        )}

        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={isPending} loading={isPending}>
            {isPending ? 'Salvando...' : 'Salvar'}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel} disabled={isPending}>
            Cancelar
          </Button>
        </div>
      </div>

      <CategoryQuickCreateModal open={showCatModal} tenantId={tenantId} onClose={() => setShowCatModal(false)} />
      <UnitQuickCreateModal open={showUnitModal} tenantId={tenantId} onClose={() => setShowUnitModal(false)} />
    </form>
  )
}
