import { apiRequest } from '@/api/client'
import { getCsrfToken } from '@/api/client'

export interface Product {
  id: string
  name: string
  sku: string
  barcode: string
  category: string | null
  category_name: string
  unit: string | null
  unit_name: string
  is_active: boolean
  product_kind: string
  tracks_inventory: boolean
  brand: string
  model: string
  tags: string[]
  scale_code: string
  created_at: string
  updated_at: string
}

export interface ProductFiscalData {
  id: string
  product: string
  fiscal_type: string
  ncm: string
  cest: string
  origin_code: string
  fiscal_class: string
}

export interface ProductPriceTier {
  id: string
  product: string
  min_quantity: string
  amount: string
}

export interface Category {
  id: string
  name: string
  is_active: boolean
  parent: string | null
  parent_name: string
}

export interface Unit {
  id: string
  name: string
  abbreviation: string
  symbol: string
  precision: number
}

export interface Brand {
  id: string
  name: string
  is_active: boolean
}

export interface ProductImage {
  id: string
  product: string
  object_key: string
  file: string | null
  alt_text: string
  is_primary: boolean
  position: number
}

export function fetchProductImages(tenantId: string, productId: string): Promise<ProductImage[]> {
  return apiRequest<ProductImage[]>(`/catalog/products/${productId}/images/`, {
    tenantId,
  }) as Promise<ProductImage[]>
}

export async function uploadProductImage(
  tenantId: string,
  productId: string,
  file: File,
): Promise<ProductImage> {
  const body = new FormData()
  body.append('file', file)
  body.append('alt_text', file.name.replace(/\.[^.]+$/, ''))
  const headers: Record<string, string> = { Accept: 'application/json', 'X-Tenant-ID': tenantId }
  const csrfToken = getCsrfToken()
  if (csrfToken) headers['X-CSRFToken'] = csrfToken
  const response = await fetch(`/api/v1/catalog/products/${productId}/images/`, {
    method: 'POST', headers, credentials: 'include', body,
  })
  if (!response.ok) throw new Error('Não foi possível enviar a imagem.')
  return response.json() as Promise<ProductImage>
}

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export function fetchProducts(
  tenantId: string,
  params: { page?: number; q?: string; category?: string; active?: string },
  signal?: AbortSignal,
): Promise<PaginatedResponse<Product>> {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  if (params.q) searchParams.set('q', params.q)
  if (params.category) searchParams.set('category', params.category)
  if (params.active) searchParams.set('active', params.active)
  const qs = searchParams.toString()
  return apiRequest<PaginatedResponse<Product>>(`/catalog/products/${qs ? `?${qs}` : ''}`, {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<Product>>
}

export function createProduct(
  tenantId: string,
  body: Record<string, unknown>,
): Promise<Product> {
  return apiRequest<Product>('/catalog/products/', {
    method: 'POST',
    tenantId,
    body,
  }) as Promise<Product>
}

export function updateProduct(
  tenantId: string,
  id: string,
  body: Record<string, unknown>,
): Promise<Product> {
  return apiRequest<Product>(`/catalog/products/${id}/`, {
    method: 'PATCH',
    tenantId,
    body,
  }) as Promise<Product>
}

export function fetchCategories(
  tenantId: string,
  params: { page?: number; q?: string } = {},
  signal?: AbortSignal,
): Promise<PaginatedResponse<Category>> {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  if (params.q) searchParams.set('q', params.q)
  const qs = searchParams.toString()
  return apiRequest<PaginatedResponse<Category>>(`/catalog/categories/${qs ? `?${qs}` : ''}`, {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<Category>>
}

export function createCategory(
  tenantId: string,
  body: Record<string, unknown>,
): Promise<Category> {
  return apiRequest<Category>('/catalog/categories/', {
    method: 'POST',
    tenantId,
    body,
  }) as Promise<Category>
}

export function updateCategory(
  tenantId: string,
  id: string,
  body: Record<string, unknown>,
): Promise<Category> {
  return apiRequest<Category>(`/catalog/categories/${id}/`, {
    method: 'PATCH',
    tenantId,
    body,
  }) as Promise<Category>
}

export function createUnit(
  tenantId: string,
  body: Record<string, unknown>,
): Promise<Unit> {
  return apiRequest<Unit>('/catalog/units/', {
    method: 'POST',
    tenantId,
    body,
  }) as Promise<Unit>
}

export function fetchUnits(
  tenantId: string,
  params: { page?: number } = {},
  signal?: AbortSignal,
): Promise<PaginatedResponse<Unit>> {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  const qs = searchParams.toString()
  return apiRequest<PaginatedResponse<Unit>>(`/catalog/units/${qs ? `?${qs}` : ''}`, {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<Unit>>
}

export function fetchProductFiscalData(
  tenantId: string,
  productId: string,
): Promise<ProductFiscalData> {
  return apiRequest<ProductFiscalData>(`/products/${productId}/fiscal-data/`, {
    tenantId,
  }) as Promise<ProductFiscalData>
}

export function upsertProductFiscalData(
  tenantId: string,
  productId: string,
  data: Record<string, unknown>,
): Promise<ProductFiscalData> {
  return apiRequest<ProductFiscalData>(`/products/${productId}/fiscal-data/`, {
    method: 'POST',
    tenantId,
    body: data,
  }) as Promise<ProductFiscalData>
}

export function fetchProductPriceTiers(
  tenantId: string,
  productId: string,
): Promise<ProductPriceTier[]> {
  return apiRequest<ProductPriceTier[]>(`/products/${productId}/price-tiers/`, {
    tenantId,
  }) as Promise<ProductPriceTier[]>
}

export function createProductPriceTier(
  tenantId: string,
  productId: string,
  data: Record<string, unknown>,
): Promise<ProductPriceTier> {
  return apiRequest<ProductPriceTier>(`/products/${productId}/price-tiers/`, {
    method: 'POST',
    tenantId,
    body: data,
  }) as Promise<ProductPriceTier>
}

export function deleteProductPriceTier(
  tenantId: string,
  productId: string,
  tierId: string,
): Promise<void> {
  return apiRequest<void>(`/products/${productId}/price-tiers/${tierId}/`, {
    method: 'DELETE',
    tenantId,
  }) as Promise<void>
}

export async function persistServiceExtensions(
  tenantId: string,
  productId: string,
  payload: {
    fiscal: Record<string, unknown>
    price_tier: Record<string, unknown> | null
  },
): Promise<void> {
  await upsertProductFiscalData(tenantId, productId, payload.fiscal)
  if (payload.price_tier) {
    await createProductPriceTier(tenantId, productId, payload.price_tier)
  }
}

export interface CompositionItem {
  id: string
  component: string
  component_sku: string
  component_name: string
  quantity: string
}

export function fetchComposition(
  tenantId: string,
  productId: string,
): Promise<CompositionItem[]> {
  return apiRequest<CompositionItem[]>(`/catalog/products/${productId}/composition/`, {
    tenantId,
  }) as Promise<CompositionItem[]>
}

export function createCompositionItem(
  tenantId: string,
  productId: string,
  body: Record<string, unknown>,
): Promise<CompositionItem> {
  return apiRequest<CompositionItem>(`/catalog/products/${productId}/composition/`, {
    method: 'POST',
    tenantId,
    body,
  }) as Promise<CompositionItem>
}

export function deleteCompositionItem(
  tenantId: string,
  productId: string,
  itemId: string,
): Promise<void> {
  return apiRequest<void>(`/catalog/products/${productId}/composition/${itemId}/`, {
    method: 'DELETE',
    tenantId,
  }) as Promise<void>
}

/** Create a barcode/EAN code for a product. */
export function fetchProduct(
  tenantId: string,
  id: string,
): Promise<Product> {
  return apiRequest<Product>(`/catalog/products/${id}/`, {
    tenantId,
  }) as Promise<Product>
}

export function createProductCode(
  tenantId: string,
  productId: string,
  body: { code_type: string; value: string; is_principal?: boolean },
): Promise<unknown> {
  return apiRequest<unknown>(`/catalog/products/${productId}/codes/`, {
    method: 'POST',
    tenantId,
    body,
  }) as Promise<unknown>
}

export function fetchBrands(
  tenantId: string,
  params: { page?: number; q?: string } = {},
  signal?: AbortSignal,
): Promise<PaginatedResponse<Brand>> {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  if (params.q) searchParams.set('q', params.q)
  const qs = searchParams.toString()
  return apiRequest<PaginatedResponse<Brand>>(`/catalog/brands/${qs ? `?${qs}` : ''}`, {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<Brand>>
}

export function createBrand(
  tenantId: string,
  body: Record<string, unknown>,
): Promise<Brand> {
  return apiRequest<Brand>('/catalog/brands/', {
    method: 'POST',
    tenantId,
    body,
  }) as Promise<Brand>
}

export function updateBrand(
  tenantId: string,
  id: string,
  body: Record<string, unknown>,
): Promise<Brand> {
  return apiRequest<Brand>(`/catalog/brands/${id}/`, {
    method: 'PATCH',
    tenantId,
    body,
  }) as Promise<Brand>
}

export interface CommercialComboItem {
  id: string
  combo: string
  item: string
  item_sku?: string
  item_name?: string
  quantity: string
  is_active: boolean
  version: number
}

export interface CommercialCombo {
  id: string
  sku: string
  name: string
  description: string
  price: string
  valid_from: string
  valid_to: string | null
  is_active: boolean
  version: number
  items: CommercialComboItem[]
  created_at?: string
  updated_at?: string
}

export function fetchCombos(
  tenantId: string,
  params: { page?: number; q?: string; is_active?: string } = {},
  signal?: AbortSignal,
): Promise<PaginatedResponse<CommercialCombo>> {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  if (params.q) searchParams.set('q', params.q)
  if (params.is_active) searchParams.set('is_active', params.is_active)
  const qs = searchParams.toString()
  return apiRequest<PaginatedResponse<CommercialCombo>>(`/catalog/combos/${qs ? `?${qs}` : ''}`, {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<CommercialCombo>>
}

export function fetchCombo(
  tenantId: string,
  id: string,
): Promise<CommercialCombo> {
  return apiRequest<CommercialCombo>(`/catalog/combos/${id}/`, {
    tenantId,
  }) as Promise<CommercialCombo>
}

export function createCombo(
  tenantId: string,
  body: Record<string, unknown>,
): Promise<CommercialCombo> {
  return apiRequest<CommercialCombo>('/catalog/combos/', {
    method: 'POST',
    tenantId,
    body,
  }) as Promise<CommercialCombo>
}

export function updateCombo(
  tenantId: string,
  id: string,
  body: Record<string, unknown>,
): Promise<CommercialCombo> {
  return apiRequest<CommercialCombo>(`/catalog/combos/${id}/`, {
    method: 'PATCH',
    tenantId,
    body,
  }) as Promise<CommercialCombo>
}

export function addComboItem(
  tenantId: string,
  comboId: string,
  body: Record<string, unknown>,
): Promise<CommercialComboItem> {
  return apiRequest<CommercialComboItem>(`/catalog/combos/${comboId}/items/`, {
    method: 'POST',
    tenantId,
    body,
  }) as Promise<CommercialComboItem>
}

export function removeComboItem(
  tenantId: string,
  comboId: string,
  itemId: string,
): Promise<void> {
  return apiRequest<void>(`/catalog/combos/${comboId}/items/${itemId}/`, {
    method: 'DELETE',
    tenantId,
  }) as Promise<void>
}

// =============================================================================
// Sprint 28 — Label Templates + Generate
// =============================================================================

export interface LabelTemplate {
  id: string
  name: string
  width_mm: string
  height_mm: string
  margin_mm: string
  columns: number
  rows: number
  show_sku: boolean
  show_barcode: boolean
  show_price: boolean
  show_name: boolean
  is_active: boolean
  version: number
}

export function fetchLabelTemplates(
  tenantId: string,
  signal?: AbortSignal,
): Promise<PaginatedResponse<LabelTemplate>> {
  return apiRequest<PaginatedResponse<LabelTemplate>>('/catalog/label-templates/', {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<LabelTemplate>>
}

export function generateLabels(
  tenantId: string,
  body: { template_id: string; items: { product_id: string; quantity: number }[] },
): Promise<Blob> {
  const url = `/api/v1/catalog/labels/generate/`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Tenant-ID': String(tenantId),
  }
  const csrfToken = (() => {
    const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]*)/)
    return match ? match[1] : null
  })()
  if (csrfToken) headers['X-CSRFToken'] = csrfToken

  return fetch(url, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(body),
  }).then(async (response) => {
    if (!response.ok) {
      let problem: unknown
      try { problem = await response.json() } catch { problem = response.statusText }
      throw new Error(
        typeof problem === 'object' && problem !== null && 'detail' in problem
          ? (problem as { detail: string }).detail
          : 'Erro ao gerar etiquetas.',
      )
    }
    return response.blob()
  })
}

// =============================================================================
// Sprint 29 — Channel Profiles
// =============================================================================

export interface ChannelProfile {
  id: string
  product: string
  channel_slug: string
  title: string
  description: string
  list_price: string | null
  sale_price: string | null
  dimensions_json: Record<string, unknown>
  weight_grams: number | null
  status: string
  version: number
  published_at: string | null
}

export function fetchChannelProfiles(
  tenantId: string,
  productId: string,
): Promise<ChannelProfile[]> {
  return apiRequest<ChannelProfile[]>(`/catalog/products/${productId}/channel-profiles/`, {
    tenantId,
  }) as Promise<ChannelProfile[]>
}

export function saveChannelProfile(
  tenantId: string,
  productId: string,
  channelSlug: string,
  data: Record<string, unknown>,
): Promise<ChannelProfile> {
  return apiRequest<ChannelProfile>(`/catalog/products/${productId}/channel-profiles/${channelSlug}/`, {
    method: 'PUT',
    tenantId,
    body: data,
  }) as Promise<ChannelProfile>
}

export function createChannelProfile(
  tenantId: string,
  productId: string,
  data: Record<string, unknown>,
): Promise<ChannelProfile> {
  return apiRequest<ChannelProfile>(`/catalog/products/${productId}/channel-profiles/`, {
    method: 'POST',
    tenantId,
    body: data,
  }) as Promise<ChannelProfile>
}

export function publishChannel(
  tenantId: string,
  productId: string,
  channelSlug: string,
): Promise<ChannelProfile> {
  return apiRequest<ChannelProfile>(
    `/catalog/products/${productId}/channel-profiles/${channelSlug}/publish/`,
    {
      method: 'POST',
      tenantId,
    },
  ) as Promise<ChannelProfile>
}
