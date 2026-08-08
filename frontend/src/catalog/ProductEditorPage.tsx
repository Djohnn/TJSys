import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import { isApiProblemError } from '@/api/problem'
import { createProductCode, applyProduct } from './catalogApi'
import type { ApplyProductResponse } from './catalogApi'
import { toProductPayload } from './catalogSchemas'
import type { ProductFormData } from './catalogSchemas'

import ProductMediaPanel from './ProductMediaPanel'
import ProductIdentityStep from './ProductIdentityStep'
import ProductEditorSteps from './ProductEditorSteps'
import ProductPricesStep from './ProductPricesStep'
import ProductInventoryStep from './ProductInventoryStep'
import ProductFiscalStep from './ProductFiscalStep'
import ProductCompositionStep from './ProductCompositionStep'
import ProductChannelsStep from './ProductChannelsStep'

const STEP_TABS = [
  { key: 'identity', label: 'Identificação' },
  { key: 'prices', label: 'Preços' },
  { key: 'inventory', label: 'Estoque' },
  { key: 'fiscal', label: 'Fiscal' },
  { key: 'composition', label: 'Composição' },
  { key: 'channels', label: 'Canais' },
] as const

export default function ProductEditorPage(): ReactNode {
  const { productId: urlProductId } = useParams<{ productId: string }>()
  const navigate = useNavigate()
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''

  const isEditing = Boolean(urlProductId)

  const [createdProductId, setCreatedProductId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('identity')
  const [commandId] = useState(() =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `cmd-${Date.now()}`,
  )
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const productId = urlProductId ?? createdProductId
  const tabsReady = isEditing || !!productId

  const createMutation = useMutation({
    mutationFn: async (data: ProductFormData) => {
      const payload = toProductPayload(data)
      const result = await applyProduct(tenantId, {
        command_id: commandId,
        product: payload.product,
        stock: payload.stock ?? null,
      })
      if (payload.barcode && result.product) {
        try { await createProductCode(tenantId, result.product.id, { code_type: 'ean', value: payload.barcode, is_principal: true }) } catch { /* non-blocking */ }
      }
      return result as ApplyProductResponse
    },
    onSuccess: (result) => {
      setCreatedProductId(result.product.id)
      setFeedback({ kind: 'success', text: 'Produto criado com sucesso.' })
    },
    onError: (err) => {
      setFeedback({
        kind: 'error',
        text: isApiProblemError(err) ? err.problem.detail : 'Erro ao criar produto.',
      })
    },
  })

  const handleIdentitySubmit = useCallback(
    (data: ProductFormData) => {
      if (isEditing) {
        return
      }
      createMutation.mutate(data)
    },
    [createMutation, isEditing],
  )

  const tabs = STEP_TABS.map((tab) => ({
    key: tab.key,
    label: tab.label,
    disabled: tab.key !== 'identity' && !tabsReady,
  }))

  const renderStep = () => {
    if (!productId) {
      return null
    }

    switch (activeTab) {
      case 'identity':
        return <ProductIdentityStep initialData={undefined} onSubmit={handleIdentitySubmit} />
      case 'prices':
        return <ProductPricesStep productId={productId} />
      case 'inventory':
        return <ProductInventoryStep productId={productId} />
      case 'fiscal':
        return <ProductFiscalStep productId={productId} />
      case 'composition':
        return <ProductCompositionStep productId={productId} />
      case 'channels':
        return <ProductChannelsStep productId={productId} />
      default:
        return null
    }
  }

  return (
    <div data-testid="product-editor-page" className="mx-auto max-w-[1440px]">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-100 bg-white px-5 py-4 shadow-sm">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary-600">Cadastro de produto</p>
          <h1 className="mt-1 text-2xl font-black text-slate-900">
          {isEditing ? 'Editar Produto' : 'Novo Produto'}
          </h1>
        </div>
        <button
          type="button"
          onClick={() => navigate('/catalog/products')}
          className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-neutral-50 cursor-pointer"
        >
          Voltar
        </button>
      </div>

      {feedback && (
        <div
          role={feedback.kind === 'error' ? 'alert' : 'status'}
          className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
            feedback.kind === 'error'
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-green-200 bg-green-50 text-green-700'
          }`}
          data-testid="editor-feedback"
        >
          {feedback.text}
        </div>
      )}

      <ProductEditorSteps tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      <div
        data-testid="product-editor-layout"
        data-layout="media-left-identity-right"
        className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[320px_minmax(0,1fr)]"
      >
        <aside aria-label="Imagens do produto" className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm xl:sticky xl:top-6">
          <ProductMediaPanel productId={productId} />
        </aside>
        <section aria-label="Identificação do produto" className="min-w-0 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm sm:p-6">
          {activeTab === 'identity' ? (
            <ProductIdentityStep
              onSubmit={handleIdentitySubmit}
            />
          ) : productId ? (
            renderStep()
          ) : (
            <div className="p-6 text-center text-sm text-neutral-500">
              Crie o produto primeiro na aba Identificação.
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
