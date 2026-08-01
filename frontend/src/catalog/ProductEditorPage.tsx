import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import { createProductCode } from './catalogApi'
import type { Product } from './catalogApi'
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

  const productId = urlProductId ?? createdProductId
  const tabsReady = isEditing || !!productId

  const createMutation = useMutation({
    mutationFn: async (data: ProductFormData) => {
      const payload = toProductPayload(data)
      const product = await apiRequest<Product>('/catalog/products/', {
        method: 'POST', tenantId, body: payload.product,
      }) as Product
      if (payload.barcode && product) {
        try { await createProductCode(tenantId, product.id, { code_type: 'ean', value: payload.barcode, is_principal: true }) } catch { /* non-blocking */ }
      }
      return product
    },
    onSuccess: (product) => {
      setCreatedProductId(product.id)
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
    <div data-testid="product-editor-page" className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">
          {isEditing ? 'Editar Produto' : 'Novo Produto'}
        </h1>
        <button
          type="button"
          onClick={() => navigate('/catalog/products')}
          className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-neutral-50 cursor-pointer"
        >
          Voltar
        </button>
      </div>

      <ProductEditorSteps tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="grid grid-cols-[minmax(220px,0.8fr)_minmax(0,2.2fr)] gap-8">
        <aside>
          <ProductMediaPanel />
        </aside>
        <section>
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
