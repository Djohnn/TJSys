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
  created_at: string
  updated_at: string
}

export interface Category {
  id: string
  name: string
  is_active: boolean
}

export interface Unit {
  id: string
  name: string
  abbreviation: string
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
