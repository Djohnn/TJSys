import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import { isApiProblemError } from '@/api/problem'
import type { PaginatedResponse, Category, Unit, Product } from './catalogApi'
import { catalogKeys } from './catalogQueryKeys'
import { serviceSchema, type ServiceFormData, toServicePayload } from './catalogSchemas'
import Button from '@/components/ui/Button'
import CategoryQuickCreateModal from './CategoryQuickCreateModal'
import UnitQuickCreateModal from './UnitQuickCreateModal'

const FISCAL_TYPE_OPTIONS = [
  { value: '', label: 'Selecione...' },
  { value: '00', label: '00 - Tributado integralmente' },
  { value: '10', label: '10 - Tributado com ICMS ST' },
  { value: '20', label: '20 - Com redução de base de cálculo' },
  { value: '30', label: '30 - Isento / Não tributado' },
  { value: '40', label: '40 - Imune' },
  { value: '60', label: '60 - ICMS cobrado anteriormente por ST' },
  { value: '70', label: '70 - Com redução de BC e cobrança ST' },
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

export default function ServiceEditorPage(): ReactNode {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { selectedTenant } = useTenant()
  const queryClient = useQueryClient()
  const tenantId = selectedTenant?.tenant_id ?? ''

  const isEditing = Boolean(id)
  const [showCatModal, setShowCatModal] = useState(false)
  const [showUnitModal, setShowUnitModal] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const { data: service } = useQuery({
    queryKey: ['service', tenantId, id],
    queryFn: ({ signal }) =>
      apiRequest<Product>(`/catalog/products/${id}/`, { tenantId, signal }) as Promise<Product>,
    enabled: isEditing && !!tenantId,
  })

  const { data: categoriesData } = useQuery({
    queryKey: [...catalogKeys.categories(tenantId), 1],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<Category>>('/catalog/categories/?page=1', { tenantId, signal }) as Promise<PaginatedResponse<Category>>,
    enabled: !!tenantId,
  })

  const { data: unitsData } = useQuery({
    queryKey: [...catalogKeys.units(tenantId), 1],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<Unit>>('/catalog/units/?page=1', { tenantId, signal }) as Promise<PaginatedResponse<Unit>>,
    enabled: !!tenantId,
  })

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ServiceFormData>({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      name: service?.name ?? '',
      sku: service?.sku ?? '',
      description: '',
      category: service?.category ?? null,
      unit: service?.unit ?? null,
      is_active: service?.is_active ?? true,
      price: '',
      billing_unit: '',
      duration_minutes: 0,
      ncm: '',
      cest: '',
      origin_code: '0',
      fiscal_class: '',
    },
    values: isEditing && service ? {
      name: service.name,
      sku: service.sku,
      description: '',
      category: service.category,
      unit: service.unit,
      is_active: service.is_active,
      price: '',
      billing_unit: '',
      duration_minutes: 0,
      ncm: '',
      cest: '',
      origin_code: '0',
      fiscal_class: '',
    } : undefined,
  })

  const createMutation = useMutation({
    mutationFn: async (data: ServiceFormData) => {
      const payload = toServicePayload(data)
      return apiRequest<Product>('/catalog/products/', {
        method: 'POST', tenantId, body: payload.product,
      }) as Promise<Product>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services', tenantId] })
      navigate('/catalog/services')
    },
    onError: (err) => {
      if (isApiProblemError(err) && err.problem.errors) {
        setSubmitError(Object.values(err.problem.errors).flat().join(', '))
      } else if (isApiProblemError(err)) {
        setSubmitError(err.problem.detail)
      } else {
        setSubmitError('Erro ao criar serviço.')
      }
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (data: ServiceFormData) => {
      const payload = toServicePayload(data)
      return apiRequest<Product>(`/catalog/products/${id}/`, {
        method: 'PATCH', tenantId, body: payload.product,
      }) as Promise<Product>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services', tenantId] })
      navigate('/catalog/services')
    },
    onError: (err) => {
      if (isApiProblemError(err) && err.problem.errors) {
        setSubmitError(Object.values(err.problem.errors).flat().join(', '))
      } else if (isApiProblemError(err)) {
        setSubmitError(err.problem.detail)
      } else {
        setSubmitError('Erro ao atualizar serviço.')
      }
    },
  })

  function onSubmit(data: ServiceFormData) {
    setSubmitError(null)
    if (isEditing) {
      updateMutation.mutate(data)
    } else {
      createMutation.mutate(data)
    }
  }

  const categories = categoriesData?.results ?? []
  const units = unitsData?.results ?? []
  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <div data-testid="service-editor-page" className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">
          {isEditing ? 'Editar Serviço' : 'Novo Serviço'}
        </h1>
        <button
          type="button"
          onClick={() => navigate('/catalog/services')}
          className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-neutral-50 cursor-pointer"
        >
          Voltar
        </button>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} data-testid="service-editor-form">
        {submitError && (
          <div data-testid="form-error" role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {submitError}
          </div>
        )}

        <div className="space-y-6 max-w-2xl">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-neutral-800 border-b border-border pb-2">Dados Básicos</h3>

            <div>
              <label htmlFor="se-name" className="block text-sm font-medium text-neutral-700 mb-1">Nome</label>
              <input id="se-name" {...register('name')} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
              {errors.name && <span role="alert" className="text-xs text-red-600 mt-1 block">{errors.name.message}</span>}
            </div>

            <div>
              <label htmlFor="se-sku" className="block text-sm font-medium text-neutral-700 mb-1">SKU</label>
              <input id="se-sku" {...register('sku')} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
            </div>

            <div>
              <label htmlFor="se-description" className="block text-sm font-medium text-neutral-700 mb-1">Descrição</label>
              <textarea id="se-description" {...register('description')} className="w-full px-3 py-2 border border-border rounded-lg text-sm" rows={4} />
            </div>

            <div>
              <label htmlFor="se-category" className="block text-sm font-medium text-neutral-700 mb-1">Categoria</label>
              <div className="flex items-center gap-2">
                <select id="se-category" {...register('category')} className="flex-1 px-3 py-2 border border-border rounded-lg text-sm">
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
              <label htmlFor="se-unit" className="block text-sm font-medium text-neutral-700 mb-1">Unidade Base</label>
              <div className="flex items-center gap-2">
                <select id="se-unit" {...register('unit')} className="flex-1 px-3 py-2 border border-border rounded-lg text-sm">
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

            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" {...register('is_active')} className="rounded border-border" />
              Ativo
            </label>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-neutral-800 border-b border-border pb-2">Serviço</h3>

            <div>
              <label htmlFor="se-billing-unit" className="block text-sm font-medium text-neutral-700 mb-1">Unidade de Cobrança</label>
              <input id="se-billing-unit" {...register('billing_unit')} className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="Ex: hora, unidade, consulta" data-testid="service-billing-unit-input" />
            </div>

            <div>
              <label htmlFor="se-duration" className="block text-sm font-medium text-neutral-700 mb-1">Duração (minutos)</label>
              <input id="se-duration" type="number" {...register('duration_minutes')} className="w-full px-3 py-2 border border-border rounded-lg text-sm" data-testid="service-duration-input" />
              {errors.duration_minutes && <span role="alert" className="text-xs text-red-600 mt-1 block">{errors.duration_minutes.message}</span>}
            </div>

            <div>
              <label htmlFor="se-price" className="block text-sm font-medium text-neutral-700 mb-1">Preço</label>
              <input id="se-price" {...register('price')} className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="0.00" data-testid="service-price-input" />
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-neutral-800 border-b border-border pb-2">Dados Fiscais</h3>

            <div>
              <label htmlFor="se-fiscal-type" className="block text-sm font-medium text-neutral-700 mb-1">Tipo Fiscal</label>
              <select id="se-fiscal-type" {...register('ncm')} className="w-full px-3 py-2 border border-border rounded-lg text-sm">
                {FISCAL_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="se-ncm" className="block text-sm font-medium text-neutral-700 mb-1">NCM</label>
              <input id="se-ncm" {...register('ncm')} className="w-full px-3 py-2 border border-border rounded-lg text-sm" data-testid="service-ncm-input" />
            </div>

            <div>
              <label htmlFor="se-cest" className="block text-sm font-medium text-neutral-700 mb-1">CEST</label>
              <input id="se-cest" {...register('cest')} className="w-full px-3 py-2 border border-border rounded-lg text-sm" data-testid="service-cest-input" />
            </div>

            <div>
              <label htmlFor="se-origin-code" className="block text-sm font-medium text-neutral-700 mb-1">Código de Origem</label>
              <select id="se-origin-code" {...register('origin_code')} className="w-full px-3 py-2 border border-border rounded-lg text-sm" data-testid="service-origin-code-select">
                {ORIGIN_CODE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              {errors.origin_code && <span role="alert" className="text-xs text-red-600 mt-1 block">{errors.origin_code.message}</span>}
            </div>

            <div>
              <label htmlFor="se-fiscal-class" className="block text-sm font-medium text-neutral-700 mb-1">Classe Fiscal</label>
              <input id="se-fiscal-class" {...register('fiscal_class')} className="w-full px-3 py-2 border border-border rounded-lg text-sm" data-testid="service-fiscal-class-input" />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={isPending} loading={isPending}>
              {isPending ? 'Salvando...' : 'Salvar'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => navigate('/catalog/services')} disabled={isPending}>
              Cancelar
            </Button>
          </div>
        </div>
      </form>

      <CategoryQuickCreateModal open={showCatModal} tenantId={tenantId} onClose={() => setShowCatModal(false)} />
      <UnitQuickCreateModal open={showUnitModal} tenantId={tenantId} onClose={() => setShowUnitModal(false)} />
    </div>
  )
}
