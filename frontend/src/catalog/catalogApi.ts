import { apiRequest } from '@/api/client'

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
