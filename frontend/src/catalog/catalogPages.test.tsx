import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { productToFormData, toProductPayload } from './catalogSchemas'
import { describe, it, expect, beforeEach, vi } from 'vitest'

import { AuthContext } from '@/auth/AuthProvider'
import type { AuthContextValue } from '@/auth/AuthProvider'
import { TenantContext } from '@/tenant/TenantProvider'
import { server } from '@/test/server'

import ProductsPage from './ProductsPage'
import ServicesPage from './ServicesPage'
import ServiceEditorPage from './ServiceEditorPage'
import { toServicePayload } from './catalogSchemas'
import CatalogHomePage from './CatalogHomePage'
import ProductEditorPage from './ProductEditorPage'
import CategoriesPage from './CategoriesPage'
import UnitsPage from './UnitsPage'
import BrandsPage from './BrandsPage'
import CombosPage from './CombosPage'
import ComboEditorPage from './ComboEditorPage'
import LabelsPage from './LabelsPage'
import { persistServiceExtensions } from './catalogApi'

const BASE = '/api/v1'
let capturedProductCode: { method: string; productId: string; value?: string; is_active?: boolean; is_principal?: boolean } | null = null
let capturedApplyProduct: Record<string, unknown> | null = null

const authValue: AuthContextValue = {
  state: 'authenticated',
  user: { id: 1, email: 'admin@tjsys.local', name: 'Admin', is_active: true, is_mfa_enabled: false },
  memberships: [{ id: 1, tenant_id: 'tenant-alpha', tenant_name: 'Alpha', role: 'admin' }],
  login: async () => ({ requiresMfa: false }),
  challengeMfa: async () => {},
  verifyRecovery: vi.fn(),
  logout: async () => {},
}

const tenantValue = {
  selectedTenant: { id: 1, tenant_id: 'tenant-alpha', tenant_name: 'Alpha', role: 'admin' },
  memberships: [{ id: 1, tenant_id: 'tenant-alpha', tenant_name: 'Alpha', role: 'admin' }],
  selectTenant: () => {},
}

const PRODUCTS_ALL = {
  count: 3,
  next: null,
  previous: null,
  results: [
    { id: 'p1', name: 'Produto A', sku: 'SKU-A', barcode: '123', category: 'cat-1', category_name: 'Categoria A', unit: 'unit-1', unit_name: 'Un', is_active: true, product_kind: 'revenda', tracks_inventory: true, brand: 'Marca A', model: 'Modelo A', tags: ['tag1', 'tag2'], scale_code: 'SC001', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    { id: 'p2', name: 'Produto B', sku: 'SKU-B', barcode: '456', category: 'cat-2', category_name: 'Categoria B', unit: 'unit-2', unit_name: 'Kg', is_active: true, product_kind: 'insumo', tracks_inventory: false, brand: '', model: '', tags: [], scale_code: '', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    { id: 'p3', name: 'Produto C', sku: 'SKU-C', barcode: '789', category: null, category_name: '', unit: null, unit_name: '', is_active: false, product_kind: '', tracks_inventory: false, brand: '', model: '', tags: [], scale_code: '', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  ],
}

const PRODUCTS_SEARCH = {
  count: 1,
  next: null,
  previous: null,
  results: [
    { id: 'p1', name: 'Produto A', sku: 'SKU-A', barcode: '123', category: 'cat-1', category_name: 'Categoria A', unit: 'unit-1', unit_name: 'Un', is_active: true, product_kind: 'revenda', tracks_inventory: true, brand: 'Marca A', model: 'Modelo A', tags: ['tag1', 'tag2'], scale_code: 'SC001', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  ],
}

const PRODUCTS_FILTERED_CAT = {
  count: 1,
  next: null,
  previous: null,
  results: [
    { id: 'p1', name: 'Produto A', sku: 'SKU-A', barcode: '123', category: 'cat-1', category_name: 'Categoria A', unit: 'unit-1', unit_name: 'Un', is_active: true, product_kind: 'revenda', tracks_inventory: true, brand: 'Marca A', model: 'Modelo A', tags: ['tag1', 'tag2'], scale_code: 'SC001', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  ],
}

const CATEGORIES = {
  count: 2,
  next: null,
  previous: null,
  results: [
    { id: 'cat-1', name: 'Categoria A', is_active: true, parent: null, parent_name: '' },
    { id: 'cat-2', name: 'Categoria B', is_active: true, parent: 'cat-1', parent_name: 'Categoria A' },
  ],
}

const UNITS = {
  count: 2,
  next: null,
  previous: null,
  results: [
    { id: 'unit-1', name: 'Unidade', abbreviation: 'Un', symbol: 'UN', precision: 2 },
    { id: 'unit-2', name: 'Quilograma', abbreviation: 'Kg', symbol: 'KG', precision: 3 },
  ],
}

const BRANDS = {
  count: 2,
  next: null,
  previous: null,
  results: [
    { id: 'brand-1', name: 'Marca A', is_active: true },
    { id: 'brand-2', name: 'Marca B', is_active: true },
  ],
}

const COMBOS_ALL = {
  count: 2,
  next: null,
  previous: null,
  results: [
    { id: 'combo-1', sku: 'COMBO-A', name: 'Combo Alpha', description: '', price: '49.9000', valid_from: '2026-01-01T00:00:00Z', valid_to: null, is_active: true, version: 1, items: [{ id: 'ci-1', combo: 'combo-1', item: 'p1', item_name: 'Produto A', quantity: '2.000000', is_active: true, version: 1 }], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    { id: 'combo-2', sku: 'COMBO-B', name: 'Combo Beta', description: '', price: '79.9000', valid_from: '2026-01-01T00:00:00Z', valid_to: null, is_active: true, version: 1, items: [], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  ],
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
}

function renderProductsPage(initialRoute = '/catalog/products') {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <AuthContext.Provider value={authValue}>
          <TenantContext.Provider value={tenantValue}>
            <Routes>
              <Route path="/catalog/products" element={<ProductsPage />} />
            </Routes>
          </TenantContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function renderCategoriesPage(initialRoute = '/catalog/categories') {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <AuthContext.Provider value={authValue}>
          <TenantContext.Provider value={tenantValue}>
            <Routes>
              <Route path="/catalog/categories" element={<CategoriesPage />} />
            </Routes>
          </TenantContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function renderUnitsPage(initialRoute = '/catalog/units') {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <AuthContext.Provider value={authValue}>
          <TenantContext.Provider value={tenantValue}>
            <Routes>
              <Route path="/catalog/units" element={<UnitsPage />} />
            </Routes>
          </TenantContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function renderBrandsPage(initialRoute = '/catalog/brands') {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <AuthContext.Provider value={authValue}>
          <TenantContext.Provider value={tenantValue}>
            <Routes>
              <Route path="/catalog/brands" element={<BrandsPage />} />
            </Routes>
          </TenantContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function renderCatalogHome(initialRoute = '/catalog') {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <AuthContext.Provider value={authValue}>
          <TenantContext.Provider value={tenantValue}>
            <Routes>
              <Route path="/catalog" element={<CatalogHomePage />} />
            </Routes>
          </TenantContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function renderProductEditor(initialRoute = '/catalog/products/new') {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <AuthContext.Provider value={authValue}>
          <TenantContext.Provider value={tenantValue}>
            <Routes>
              <Route path="/catalog/products/new" element={<ProductEditorPage />} />
              <Route path="/catalog/products/:productId/edit" element={<><ProductEditorPage /><LocationProbe /></>} />
              <Route path="/app/catalog/products/:productId/edit" element={<><ProductEditorPage /><LocationProbe /></>} />
            </Routes>
          </TenantContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location-path">{location.pathname}</output>
}

beforeEach(() => {
  capturedProductCode = null
  capturedApplyProduct = null
  server.use(
    http.get(`${BASE}/catalog/products/`, ({ request }) => {
      const url = new URL(request.url)
      const q = url.searchParams.get('q')
      const category = url.searchParams.get('category')
      if (q) return HttpResponse.json(PRODUCTS_SEARCH)
      if (category) return HttpResponse.json(PRODUCTS_FILTERED_CAT)
      return HttpResponse.json(PRODUCTS_ALL)
    }),
    http.post(`${BASE}/catalog/products/`, async ({ request }) => {
      const body = (await request.json()) as { name?: string }
      if (!body.name) {
        return HttpResponse.json(
          { type: 'about:blank', title: 'Validation Error', status: 422, detail: 'Invalid input', errors: { name: ['Este campo é obrigatório.'] } },
          { status: 422 },
        )
      }
      if (body.name === 'Conflito') {
        return HttpResponse.json(
          { type: 'about:blank', title: 'Conflict', status: 409, detail: 'Já existe um produto com este nome.', code: 'unique_violation' },
          { status: 409 },
        )
      }
      return HttpResponse.json(
        { id: 'p-new', name: body.name, sku: '', barcode: '', category: null, category_name: '', unit: null, unit_name: '', is_active: true, product_kind: '', tracks_inventory: false, brand: '', model: '', tags: [], scale_code: '', created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z' },
        { status: 201 },
      )
    }),
    http.post(`${BASE}/catalog/products/apply/`, async ({ request }) => {
      const body = (await request.json()) as { product?: { name?: string; tracks_inventory?: boolean; barcode?: string } }
      capturedApplyProduct = body.product ?? null
      const name = body.product?.name ?? ''
      if (!name) {
        return HttpResponse.json(
          { type: 'about:blank', title: 'Validation Error', status: 422, detail: 'Invalid input', errors: { name: ['Este campo é obrigatório.'] } },
          { status: 422 },
        )
      }
      if (name === 'Conflito') {
        return HttpResponse.json(
          { type: 'about:blank', title: 'Conflict', status: 409, detail: 'Já existe um produto com este nome.', code: 'unique_violation' },
          { status: 409 },
        )
      }
      return HttpResponse.json(
        {
          product: { id: 'p-new', name, sku: '', barcode: '', category: null, category_name: '', unit: null, unit_name: '', is_active: true, product_kind: '', tracks_inventory: body.product?.tracks_inventory ?? false, brand: '', model: '', tags: [], scale_code: '', created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z' },
          stock_summary: body.product?.tracks_inventory
            ? { quantity: '25.000000', reserved: '0.000000', available: '25.000000', status: 'normal', branch: 'b1', branch_name: 'Filial Centro', location: 'l1', location_name: 'Loja Centro', minimum_quantity: '5.000000', maximum_quantity: '100.000000', reorder_point: '10.000000' }
            : null,
        },
        { status: 201 },
      )
    }),
    http.patch(`${BASE}/catalog/products/:id/`, async ({ request, params }) => {
      const body = (await request.json()) as { name?: string }
      if (!body.name) {
        return HttpResponse.json(
          { type: 'about:blank', title: 'Validation Error', status: 422, detail: 'Invalid input', errors: { name: ['Este campo é obrigatório.'] } },
          { status: 422 },
        )
      }
      return HttpResponse.json(
        { id: params.id, ...body, sku: '', barcode: '', category: null, category_name: '', unit: null, unit_name: '', is_active: true, product_kind: '', tracks_inventory: false, brand: '', model: '', tags: [], scale_code: '', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z' },
      )
    }),
    http.get(`${BASE}/catalog/products/:id/codes/`, ({ params }) => HttpResponse.json({ count: 1, next: null, previous: null, results: params.id === 'p1' ? [{ id: 'code-1', product: 'p1', code_type: 'ean', value: '123', is_principal: true, is_active: true, version: 1 }] : [] })),
    http.post(`${BASE}/catalog/products/:id/codes/`, async ({ request, params }) => {
      const body = await request.json() as { value?: string; is_active?: boolean; is_principal?: boolean }
      capturedProductCode = { method: 'POST', productId: params.id as string, value: body.value ?? '', is_active: body.is_active, is_principal: body.is_principal }
      return HttpResponse.json({ id: 'code-1', product: params.id, value: body.value ?? '' }, { status: 201 })
    }),
    http.patch(`${BASE}/catalog/products/:productId/codes/:codeId/`, async ({ request, params }) => {
      const body = await request.json() as { value?: string; is_active?: boolean; is_principal?: boolean }
      capturedProductCode = { method: 'PATCH', productId: params.productId as string, value: body.value, is_active: body.is_active, is_principal: body.is_principal }
      return HttpResponse.json({ id: params.codeId, product: params.productId, code_type: 'ean', value: body.value ?? '123', is_active: body.is_active ?? true, is_principal: body.is_principal ?? true, version: 2 })
    }),
    http.get(`${BASE}/catalog/categories/`, () => HttpResponse.json(CATEGORIES)),
    http.post(`${BASE}/catalog/categories/`, async ({ request }) => {
      const body = (await request.json()) as { name?: string }
      if (body.name === 'Erro') {
        return HttpResponse.json(
          { type: 'about:blank', title: 'Duplicate', status: 422, detail: 'Nome duplicado.', errors: { name: ['Ja existe.'] } },
          { status: 422 },
        )
      }
      if (!body.name) {
        return HttpResponse.json(
          { type: 'about:blank', title: 'Validation Error', status: 422, detail: 'Invalid input', errors: { name: ['Este campo é obrigatório.'] } },
          { status: 422 },
        )
      }
      return HttpResponse.json(
        { id: 'cat-new', name: body.name, is_active: true },
        { status: 201 },
      )
    }),
    http.patch(`${BASE}/catalog/categories/:id/`, async ({ request, params }) => {
      const body = (await request.json()) as { name?: string }
      return HttpResponse.json(
        { id: params.id, ...body, is_active: true },
      )
    }),
    http.get(`${BASE}/catalog/units/`, () => HttpResponse.json(UNITS)),
    http.post(`${BASE}/catalog/units/`, async ({ request }) => {
      const body = (await request.json()) as { symbol?: string; name?: string }
      if (body.symbol === 'ERR') {
        return HttpResponse.json(
          { type: 'about:blank', title: 'Duplicate', status: 422, detail: 'Simbolo duplicado.' },
          { status: 422 },
        )
      }
      return HttpResponse.json({ id: 'unit-new', symbol: body.symbol, name: body.name, abbreviation: body.symbol, precision: 0 }, { status: 201 })
    }),
    http.get(`${BASE}/catalog/brands/`, () => HttpResponse.json(BRANDS)),
    http.post(`${BASE}/catalog/brands/`, async ({ request }) => {
      const body = (await request.json()) as { name?: string }
      return HttpResponse.json(
        { id: 'brand-new', name: body.name ?? '', is_active: true },
        { status: 201 },
      )
    }),
    http.patch(`${BASE}/catalog/brands/:id/`, async ({ request, params }) => {
      const body = (await request.json()) as { name?: string; is_active?: boolean }
      return HttpResponse.json(
        { id: params.id as string, name: body.name ?? 'Marca A', is_active: body.is_active ?? true },
      )
    }),
    http.get(`${BASE}/catalog/products/:id/fiscal-data/`, ({ params }) => {
      if (params.id === 'p-no-fiscal') {
        return HttpResponse.json(
          { type: 'about:blank', title: 'Not Found', status: 404, detail: 'Not found.' },
          { status: 404 },
        )
      }
      return HttpResponse.json({
        id: `fd-${params.id}`,
        product: params.id as string,
        fiscal_type: '00',
        ncm: '12345678',
        cest: '',
        origin_code: '0',
        fiscal_class: '',
      })
    }),
    http.post(`${BASE}/catalog/products/:id/fiscal-data/`, async ({ request, params }) => {
      const body = await request.json() as Record<string, unknown>
      return HttpResponse.json({
        id: `fd-${params.id}`,
        product: params.id as string,
        ...body,
      })
    }),
    http.get(`${BASE}/catalog/products/:id/price-tiers/`, ({ params }) => {
      if (params.id === 'p-no-tiers') {
        return HttpResponse.json({ count: 0, next: null, previous: null, results: [] })
      }
      return HttpResponse.json({
        count: 2,
        next: null,
        previous: null,
        results: [
          { id: 'pt-1', product: params.id as string, min_quantity: '1', amount: '10.00' },
          { id: 'pt-2', product: params.id as string, min_quantity: '10', amount: '8.50' },
        ],
      })
    }),
    http.post(`${BASE}/catalog/products/:id/price-tiers/`, async ({ request, params }) => {
      const body = await request.json() as { min_quantity?: string; amount?: string }
      return HttpResponse.json(
        {
          id: `pt-${Date.now()}`,
          product: params.id as string,
          min_quantity: body.min_quantity ?? '1',
          amount: body.amount ?? '0',
        },
        { status: 201 },
      )
    }),
    http.delete(`${BASE}/catalog/products/:id/price-tiers/:tierId/`, () => {
      return new HttpResponse(null, { status: 204 })
    }),
    http.get(`${BASE}/catalog/products/:id/`, ({ params }) => {
      if (params.id === 'p1' || params.id === 'p-new') {
        return HttpResponse.json({
          id: params.id as string, name: params.id === 'p-new' ? 'Produto Novo Teste' : 'Produto A', sku: 'SKU-A', barcode: '123', category: 'cat-1', category_name: 'Categoria A', unit: 'unit-1', unit_name: 'Un', unit_symbol: 'UN', unit_precision: 2, price: '10.00', is_active: true, product_kind: 'kit', tracks_inventory: true, brand: 'Marca A', model: 'Modelo A', tags: ['tag1', 'tag2'], scale_code: 'SC001', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        })
      }
      return HttpResponse.json(
        { type: 'about:blank', title: 'Not Found', status: 404, detail: 'Not found.' },
        { status: 404 },
      )
    }),
    http.get(`${BASE}/catalog/products/p1/composition/`, () => {
      return HttpResponse.json([
        { id: 'comp-1', component: 'p2', component_sku: 'SKU-B', component_name: 'Produto B', quantity: '2.00' },
        { id: 'comp-2', component: 'p3', component_sku: 'SKU-C', component_name: 'Produto C', quantity: '1.00' },
      ])
    }),
    http.post(`${BASE}/catalog/products/p1/composition/`, async ({ request }) => {
      const body = await request.json() as { component?: string; quantity?: string }
      return HttpResponse.json(
        {
          id: `comp-${Date.now()}`,
          component: body.component ?? 'p2',
          component_sku: 'SKU-B',
          component_name: 'Produto B',
          quantity: body.quantity ?? '1',
        },
        { status: 201 },
      )
    }),
    http.delete(`${BASE}/catalog/products/p1/composition/:itemId/`, () => {
      return new HttpResponse(null, { status: 204 })
    }),
    http.get(`${BASE}/catalog/combos/`, () => HttpResponse.json(COMBOS_ALL)),
    http.post(`${BASE}/catalog/combos/`, async ({ request }) => {
      const body = (await request.json()) as { name?: string; sku?: string }
      if (!body.name) {
        return HttpResponse.json(
          { type: 'about:blank', title: 'Validation Error', status: 422, detail: 'Invalid input', errors: { name: ['Este campo e obrigatorio.'] } },
          { status: 422 },
        )
      }
      return HttpResponse.json(
        { id: 'combo-new', sku: body.sku ?? '', name: body.name, description: '', price: '100.0000', valid_from: '2026-01-01T00:00:00Z', valid_to: null, is_active: true, version: 1, items: [], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
        { status: 201 },
      )
    }),
    http.get(`${BASE}/catalog/combos/:id/`, ({ params }) => {
      const found = COMBOS_ALL.results.find((c) => c.id === params.id)
      if (found) return HttpResponse.json(found)
      return HttpResponse.json(
        { type: 'about:blank', title: 'Not Found', status: 404, detail: 'Not found.' },
        { status: 404 },
      )
    }),
    http.patch(`${BASE}/catalog/combos/:id/`, async ({ request, params }) => {
      const body = (await request.json()) as Record<string, unknown>
      const found = COMBOS_ALL.results.find((c) => c.id === params.id)
      if (found) return HttpResponse.json({ ...found, ...body })
      return HttpResponse.json(
        { type: 'about:blank', title: 'Not Found', status: 404, detail: 'Not found.' },
        { status: 404 },
      )
    }),
    http.post(`${BASE}/catalog/combos/:comboId/items/`, async ({ request }) => {
      const body = (await request.json()) as { item?: string; quantity?: string }
      return HttpResponse.json(
        { id: `item-${Date.now()}`, combo: 'combo-1', item: body.item ?? '', quantity: body.quantity ?? '1', is_active: true, version: 1 },
        { status: 201 },
      )
    }),
    http.delete(`${BASE}/catalog/combos/:comboId/items/:itemId/`, () => {
      return new HttpResponse(null, { status: 204 })
    }),
    http.get(`${BASE}/branches/`, () => HttpResponse.json({
      count: 2,
      next: null,
      previous: null,
      results: [
        { id: 'b1', name: 'Filial Centro', code: 'FC', is_active: true },
        { id: 'b2', name: 'Filial Norte', code: 'FN', is_active: true },
      ],
    })),
    http.get(`${BASE}/inventory/stock-locations/`, ({ request }) => {
      const url = new URL(request.url)
      const branch = url.searchParams.get('branch')
      const locations = [
        { id: 'l1', branch: 'b1', branch_name: 'Filial Centro', code: 'L-01', name: 'Loja Centro', location_type: 'store', is_primary: true, is_active: true },
        { id: 'l2', branch: 'b2', branch_name: 'Filial Norte', code: 'L-02', name: 'Depósito Norte', location_type: 'warehouse', is_primary: true, is_active: true },
      ]
      const filtered = branch ? locations.filter((l) => l.branch === branch) : locations
      return HttpResponse.json({ count: filtered.length, next: null, previous: null, results: filtered })
    }),
    http.get(`${BASE}/inventory/product-policies/`, () => HttpResponse.json({ count: 0, next: null, previous: null, results: [] })),
    http.get(`${BASE}/inventory/product-summary/:productId/`, () => HttpResponse.json({
      product: 'p1',
      branch: 'b1',
      branch_name: 'Filial Centro',
      location: 'l1',
      location_name: 'Loja Centro',
      quantity: '25.000000',
      reserved: '0.000000',
      available: '25.000000',
      status: 'normal',
      minimum_quantity: '5.000000',
      maximum_quantity: '100.000000',
      reorder_point: '10.000000',
    })),
  )
})

describe('ProductsPage', () => {
  it('shows loading state initially', () => {
    server.use(
      http.get(`${BASE}/catalog/products/`, () => new Promise(() => {})),
    )
    renderProductsPage()
    expect(screen.getByTestId('loading-state')).toBeInTheDocument()
  })

  it('displays product list', async () => {
    renderProductsPage()
    await waitFor(() => {
      expect(screen.getByText('Produto A')).toBeInTheDocument()
    })
    expect(screen.getByText('Produto B')).toBeInTheDocument()
    expect(screen.getByText('Produto C')).toBeInTheDocument()
  })

  it('searches products by name', async () => {
    renderProductsPage('/catalog/products?q=Produto+A')
    await waitFor(() => {
      expect(screen.getByText('Produto A')).toBeInTheDocument()
    })
    expect(screen.queryByText('Produto B')).not.toBeInTheDocument()
  })

  it('filters products by category', async () => {
    renderProductsPage('/catalog/products?category=cat-1')
    await waitFor(() => {
      expect(screen.getByText('Produto A')).toBeInTheDocument()
    })
    expect(screen.queryByText('Produto B')).not.toBeInTheDocument()
  })

  it('shows empty state when no products', async () => {
    server.use(
      http.get(`${BASE}/catalog/products/`, () =>
        HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
      ),
      http.get(`${BASE}/catalog/categories/`, () => HttpResponse.json(CATEGORIES)),
    )
    renderProductsPage()
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })
  })

  it('creates a new product via the editor and enables pricing tab', async () => {
    renderProductEditor()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('product-identity-step')).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText('Nome'), 'Produto Novo')
    await user.click(screen.getByRole('button', { name: 'Continuar' }))

    await waitFor(() => {
      expect(screen.getByTestId('step-tab-prices')).not.toBeDisabled()
    })
    expect(screen.getByTestId('editor-feedback')).toHaveTextContent('Produto criado com sucesso.')
  })

  it('shows validation error for empty product name', async () => {
    renderProductEditor()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('product-identity-step')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Continuar' }))

    await waitFor(() => {
      expect(screen.getByText(/Nome é obrigatório/i)).toBeInTheDocument()
    })
  })

  it('shows error on 409 conflict for product', async () => {
    renderProductEditor()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('product-identity-step')).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText('Nome'), 'Conflito')
    await user.click(screen.getByRole('button', { name: 'Continuar' }))

    await waitFor(() => {
      expect(screen.getByTestId('editor-feedback')).toHaveTextContent(/já existe/i)
    })
  })

  it('edits a product name and closes form on success', async () => {
    renderProductsPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Produto A')).toBeInTheDocument()
    })

    const editButtons = screen.getAllByRole('button', { name: /editar/i })
    await user.click(editButtons[0])

    expect(screen.getByTestId('product-form')).toBeInTheDocument()
    const nameInput = screen.getByLabelText(/nome/i)
    await user.clear(nameInput)
    await user.type(nameInput, 'Produto A Editado')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => {
      expect(screen.queryByTestId('product-form')).not.toBeInTheDocument()
    })
  })
})

describe('CategoriesPage', () => {
  it('shows loading state initially', () => {
    server.use(
      http.get(`${BASE}/catalog/categories/`, () => new Promise(() => {})),
    )
    renderCategoriesPage()
    expect(screen.getByTestId('loading-state')).toBeInTheDocument()
  })

  it('displays category list', async () => {
    renderCategoriesPage()
    await waitFor(() => {
      expect(screen.getAllByText('Categoria A').length).toBeGreaterThan(0)
    })
    expect(screen.getByText('Categoria B')).toBeInTheDocument()
  })

  it('creates a new category and closes form on success', async () => {
    renderCategoriesPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getAllByText('Categoria A').length).toBeGreaterThan(0)
    })

    await user.click(screen.getByRole('button', { name: /nova categoria/i }))
    expect(screen.getByTestId('category-form')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/nome/i), 'Categoria Nova')
    await user.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() => {
      expect(screen.queryByTestId('category-form')).not.toBeInTheDocument()
    })
  })

  it('edits a category name and closes form on success', async () => {
    renderCategoriesPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getAllByText('Categoria A').length).toBeGreaterThan(0)
    })

    const editButtons = screen.getAllByRole('button', { name: /editar/i })
    await user.click(editButtons[0])

    expect(screen.getByTestId('category-form')).toBeInTheDocument()
    const nameInput = screen.getByLabelText(/nome/i)
    await user.clear(nameInput)
    await user.type(nameInput, 'Categoria A Editada')
    await user.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() => {
      expect(screen.queryByTestId('category-form')).not.toBeInTheDocument()
    })
  })

  it('shows empty state when no categories', async () => {
    server.use(
      http.get(`${BASE}/catalog/categories/`, () =>
        HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
      ),
    )
    renderCategoriesPage()
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })
  })
})

describe('UnitsPage', () => {
  it('shows loading state initially', () => {
    server.use(
      http.get(`${BASE}/catalog/units/`, () => new Promise(() => {})),
    )
    renderUnitsPage()
    expect(screen.getByTestId('loading-state')).toBeInTheDocument()
  })

  it('displays unit list', async () => {
    renderUnitsPage()
    await waitFor(() => {
      expect(screen.getByText('Unidade')).toBeInTheDocument()
    })
    expect(screen.getByText('Quilograma')).toBeInTheDocument()
  })

  it('shows empty state when no units', async () => {
    server.use(
      http.get(`${BASE}/catalog/units/`, () =>
        HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
      ),
    )
    renderUnitsPage()
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })
  })
})

describe('Product form – Dados Comerciais', () => {
  it('shows new fields in create form', async () => {
    renderProductEditor()

    await waitFor(() => {
      expect(screen.getByTestId('product-identity-step')).toBeInTheDocument()
    })

    expect(screen.getByText('Dados Comerciais')).toBeInTheDocument()
    expect(screen.getByTestId('product-kind-select')).toBeInTheDocument()
    expect(screen.getByTestId('product-brand-input')).toBeInTheDocument()
    expect(screen.getByTestId('product-model-input')).toBeInTheDocument()
    expect(screen.getByTestId('product-tags-input')).toBeInTheDocument()
    expect(screen.getByTestId('product-scale-code-input')).toBeInTheDocument()
    expect(screen.getByTestId('product-tracks-inventory-checkbox')).toBeInTheDocument()
  })

  it('shows new fields populated when editing', async () => {
    renderProductsPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Produto A')).toBeInTheDocument()
    })

    const editButtons = screen.getAllByRole('button', { name: /editar/i })
    await user.click(editButtons[0])

    expect(screen.getByTestId('product-form')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByTestId('product-brand-input')).toHaveValue('Marca A')
    })
    expect(screen.getByTestId('product-model-input')).toHaveValue('Modelo A')
    expect(screen.getByTestId('product-tags-input')).toHaveValue('tag1, tag2')
    expect(screen.getByTestId('product-scale-code-input')).toHaveValue('SC001')
  })
})

describe('Product form – Dados Fiscais', () => {
  it('shows fiscal data section when editing', async () => {
    renderProductsPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Produto A')).toBeInTheDocument()
    })

    const editButtons = screen.getAllByRole('button', { name: /editar/i })
    await user.click(editButtons[0])

    await waitFor(() => {
      expect(screen.getByTestId('fiscal-data-section')).toBeInTheDocument()
    })

    expect(screen.getByTestId('fiscal-type-select')).toBeInTheDocument()
    expect(screen.getByTestId('fiscal-ncm-input')).toHaveValue('12345678')
    expect(screen.getByTestId('fiscal-cest-input')).toBeInTheDocument()
    expect(screen.getByTestId('fiscal-origin-code-select')).toBeInTheDocument()
    expect(screen.getByTestId('fiscal-class-input')).toBeInTheDocument()
  })

  it('saves fiscal data and displays success', async () => {
    renderProductsPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Produto A')).toBeInTheDocument()
    })

    const editButtons = screen.getAllByRole('button', { name: /editar/i })
    await user.click(editButtons[0])

    await waitFor(() => {
      expect(screen.getByTestId('fiscal-data-section')).toBeInTheDocument()
    })

    await user.clear(screen.getByTestId('fiscal-ncm-input'))
    await user.type(screen.getByTestId('fiscal-ncm-input'), '87654321')
    await user.clear(screen.getByTestId('fiscal-cest-input'))
    await user.type(screen.getByTestId('fiscal-cest-input'), '1234567')

    await user.click(screen.getByRole('button', { name: /salvar dados fiscais/i }))

    await waitFor(() => {
      expect(screen.queryByTestId('fiscal-warning')).not.toBeInTheDocument()
    })
  })
})

describe('Product form – Preços por Quantidade', () => {
  it('shows price tiers when editing', async () => {
    renderProductsPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Produto A')).toBeInTheDocument()
    })

    const editButtons = screen.getAllByRole('button', { name: /editar/i })
    await user.click(editButtons[0])

    await waitFor(() => {
      expect(screen.getByTestId('price-tiers-section')).toBeInTheDocument()
    })

    expect(await screen.findByTestId('price-tiers-table')).toBeInTheDocument()
    const rows = screen.getAllByTestId('price-tier-row')
    expect(rows).toHaveLength(2)
  })

  it('creates a new price tier', async () => {
    renderProductsPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Produto A')).toBeInTheDocument()
    })

    const editButtons = screen.getAllByRole('button', { name: /editar/i })
    await user.click(editButtons[0])

    await waitFor(() => {
      expect(screen.getByTestId('price-tiers-section')).toBeInTheDocument()
    })

    await user.type(screen.getByTestId('tier-min-quantity-input'), '50')
    await user.type(screen.getByTestId('tier-amount-input'), '7.50')
    await user.click(screen.getByTestId('add-tier-button'))

    await waitFor(() => {
      expect(screen.getByTestId('tier-min-quantity-input')).toHaveValue('')
    })
  })

  it('deletes a price tier', async () => {
    let tiers = [
      { id: 'pt-1', product: 'p1', min_quantity: '1', amount: '10.00' },
      { id: 'pt-2', product: 'p1', min_quantity: '10', amount: '8.50' },
    ]
    server.use(
      http.get(`${BASE}/catalog/products/p1/price-tiers/`, () => HttpResponse.json({
        count: tiers.length,
        next: null,
        previous: null,
        results: tiers,
      })),
      http.delete(`${BASE}/catalog/products/p1/price-tiers/:tierId/`, ({ params }) => {
        tiers = tiers.filter((t) => t.id !== params.tierId)
        return new HttpResponse(null, { status: 204 })
      }),
    )

    renderProductsPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Produto A')).toBeInTheDocument()
    })

    const editButtons = screen.getAllByRole('button', { name: /editar/i })
    await user.click(editButtons[0])

    await waitFor(() => {
      expect(screen.getByTestId('price-tiers-section')).toBeInTheDocument()
    })

    const deleteButton = await screen.findByTestId('delete-tier-pt-1')
    await user.click(deleteButton)

    await waitFor(() => {
      expect(screen.queryByTestId('delete-tier-pt-1')).not.toBeInTheDocument()
    })
  })
})

describe('Product form – quick create modals', () => {
  it('quick category create button opens modal', async () => {
    renderProductEditor()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('product-identity-step')).toBeInTheDocument()
    })

    const catBtn = screen.getByTestId('quick-create-category-btn')
    expect(catBtn).toBeInTheDocument()

    await user.click(catBtn)

    await waitFor(() => {
      expect(screen.getByTestId('quick-cat-name-input')).toBeInTheDocument()
    })
  })

  it('quick category create submits and closes', async () => {
    renderProductEditor()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('product-identity-step')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('quick-create-category-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('quick-cat-name-input')).toBeInTheDocument()
    })

    await user.type(screen.getByTestId('quick-cat-name-input'), 'Nova Cat')
    await user.click(screen.getByRole('button', { name: 'Criar' }))

    await waitFor(() => {
      expect(screen.queryByTestId('quick-cat-name-input')).not.toBeInTheDocument()
    })
  })

  it('quick unit create button opens modal', async () => {
    renderProductEditor()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('product-identity-step')).toBeInTheDocument()
    })

    const unitBtn = screen.getByTestId('quick-create-unit-btn')
    expect(unitBtn).toBeInTheDocument()

    await user.click(unitBtn)

    await waitFor(() => {
      expect(screen.getByTestId('quick-unit-symbol-input')).toBeInTheDocument()
      expect(screen.getByTestId('quick-unit-name-input')).toBeInTheDocument()
    })
  })

  it('quick unit create shows error on duplicate', async () => {
    renderProductEditor()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('product-identity-step')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('quick-create-unit-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('quick-unit-symbol-input')).toBeInTheDocument()
    })

    await user.type(screen.getByTestId('quick-unit-symbol-input'), 'ERR')
    await user.type(screen.getByTestId('quick-unit-name-input'), 'Erro')
    await user.click(screen.getByRole('button', { name: 'Criar' }))

    await waitFor(() => {
      expect(screen.getByTestId('quick-unit-error')).toBeInTheDocument()
      expect(screen.getByTestId('quick-unit-symbol-input')).toBeInTheDocument()
    })
  })
})

describe('Product payload contract', () => {
  it('maps unit to base_unit and removes unit/barcode from product body', () => {
    const payload = toProductPayload({
      name: 'Test', sku: 'T1', unit: 'unit-1', barcode: '789123', tags: 'qa, web',
      description: '', category: null, is_active: true, product_kind: '', brand: '', model: '',
      scale_code: '', tracks_inventory: false, stock: null,
    })
    expect(payload.product).toHaveProperty('base_unit', 'unit-1')
    expect(payload.product).not.toHaveProperty('unit')
    expect(payload.product).not.toHaveProperty('barcode')
    expect(payload.barcode).toBe('789123')
    expect(payload.product.tags).toEqual(['qa', 'web'])
    expect(payload.stock).toBeUndefined()
  })

  it('splits comma-separated tags into array', () => {
    const payload = toProductPayload({
      name: 'T', sku: 'T', unit: 'u', barcode: '', tags: 'a, b , c',
      description: '', category: null, is_active: true, product_kind: '', brand: '', model: '',
      scale_code: '', tracks_inventory: false, stock: null,
    })
    expect(payload.product.tags).toEqual(['a', 'b', 'c'])
  })

  it('handles empty tags and barcode gracefully', () => {
    const payload = toProductPayload({
      name: 'T', sku: 'T', unit: 'u', barcode: '', tags: '',
      description: '', category: null, is_active: true, product_kind: '', brand: '', model: '',
      scale_code: '', tracks_inventory: false, stock: null,
    })
    expect(payload.product.tags).toEqual([])
    expect(payload.barcode).toBe('')
  })

  it('includes stock payload only when tracking inventory', () => {
    const stock = {
      branch: 'b1', location: 'l1', current_quantity: '0', initial_quantity: '25',
      minimum_quantity: '5', maximum_quantity: '100', reorder_point: '10', allow_negative: false,
    }
    const enabled = toProductPayload({
      name: 'T', sku: 'T', unit: 'u', barcode: '', tags: '',
      description: '', category: null, is_active: true, product_kind: '', brand: '', model: '',
      scale_code: '', tracks_inventory: true, stock,
    })
    expect(enabled.stock).toEqual(stock)

    const disabled = toProductPayload({
      name: 'T', sku: 'T', unit: 'u', barcode: '', tags: '',
      description: '', category: null, is_active: true, product_kind: '', brand: '', model: '',
      scale_code: '', tracks_inventory: false, stock,
    })
    expect(disabled.stock).toBeUndefined()
  })
})

describe('CatalogHomePage', () => {
  it('renders a compact catalog overview with primary actions', () => {
    renderCatalogHome()
    expect(screen.getByTestId('catalog-home-page')).toBeInTheDocument()
    expect(screen.getByTestId('catalog-overview')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver produtos' })).toHaveAttribute('href', '/app/catalog/products')
    expect(screen.getByRole('link', { name: 'Novo produto' })).toHaveAttribute('href', '/app/catalog/products/new')
    expect(screen.getByRole('link', { name: 'Imprimir etiquetas' })).toHaveAttribute('href', '/app/catalog/labels')
  })

  it('lists every catalog area without duplicating the contextual menu', () => {
    renderCatalogHome()
    for (const label of ['Produtos', 'Serviços', 'Combo', 'Categorias', 'Marcas', 'Unidades de Medida', 'Impressão de Etiquetas']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })
})

describe('ProductEditorPage', () => {
  it('sends barcode inside the atomic apply command without a follow-up code mutation', async () => {
    renderProductEditor()
    const user = userEvent.setup()

    await waitFor(() => expect(screen.getByTestId('product-identity-step')).toBeInTheDocument())
    await user.type(screen.getByLabelText('Nome'), 'Produto Com EAN')
    await user.type(screen.getByRole('textbox', { name: /Barras/ }), '7891234567890')
    await user.click(screen.getByRole('button', { name: 'Continuar' }))

    await waitFor(() => expect(capturedApplyProduct).toMatchObject({ barcode: '7891234567890' }))
    expect(capturedProductCode).toBeNull()
  })

  it('renders editor layout for new product', async () => {
    renderProductEditor()
    await waitFor(() => {
      expect(screen.getByTestId('product-editor-page')).toBeInTheDocument()
    })
    expect(screen.getByTestId('product-media-panel')).toBeInTheDocument()
    expect(screen.getByTestId('product-identity-step')).toBeInTheDocument()
    expect(screen.getByTestId('product-editor-layout')).toHaveClass('grid-cols-1')
    expect(screen.getByTestId('product-editor-layout')).toHaveClass(
      'xl:grid-cols-[320px_minmax(0,1fr)]',
    )
    expect(screen.getByTestId('product-editor-layout')).toHaveAttribute('data-layout', 'media-left-identity-right')
    expect(screen.getByRole('complementary', { name: 'Imagens do produto' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Identificação do produto' })).toBeInTheDocument()
    expect(screen.getByText('Novo Produto')).toBeInTheDocument()
  })

  it('shows back button that navigates to products list', () => {
    renderProductEditor()
    expect(screen.getByText('Voltar')).toBeInTheDocument()
  })

  it('shows tab navigation with 6 tabs', async () => {
    renderProductEditor()
    await waitFor(() => {
      expect(screen.getByTestId('product-editor-steps')).toBeInTheDocument()
    })
    expect(screen.getByTestId('step-tab-identity')).toBeInTheDocument()
    expect(screen.getByTestId('step-tab-prices')).toBeInTheDocument()
    expect(screen.getByTestId('step-tab-inventory')).toBeInTheDocument()
    expect(screen.getByTestId('step-tab-fiscal')).toBeInTheDocument()
    expect(screen.getByTestId('step-tab-composition')).toBeInTheDocument()
    expect(screen.getByTestId('step-tab-channels')).toBeInTheDocument()
  })

  it('identity step submits and enables other tabs', async () => {
    renderProductEditor()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('product-identity-step')).toBeInTheDocument()
    })

    expect(screen.getByTestId('step-tab-prices')).toBeDisabled()
    expect(screen.getByTestId('step-tab-fiscal')).toBeDisabled()

    await user.type(screen.getByLabelText('Nome'), 'Produto Novo Teste')
    await user.click(screen.getByRole('button', { name: 'Continuar' }))

    await waitFor(() => {
      expect(screen.getByTestId('step-tab-prices')).not.toBeDisabled()
    })
    await waitFor(() => {
      expect(screen.getByTestId('step-tab-fiscal')).not.toBeDisabled()
    })
  })

  it('replaces the create URL with the persisted edit URL and opens prices', async () => {
    renderProductEditor()
    const user = userEvent.setup()

    await waitFor(() => expect(screen.getByTestId('product-identity-step')).toBeInTheDocument())
    await user.type(screen.getByLabelText('Nome'), 'Produto Novo Teste')
    await user.click(screen.getByRole('button', { name: 'Continuar' }))

    await waitFor(() => {
      expect(screen.getByTestId('location-path')).toHaveTextContent('/app/catalog/products/p-new/edit')
    })
    expect(screen.getByTestId('step-tab-prices')).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByTestId('product-prices-step')).toBeInTheDocument()
  })
})

function renderProductEditorEdit(productId = 'p1', initialRoute = `/catalog/products/${productId}/edit`) {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <AuthContext.Provider value={authValue}>
          <TenantContext.Provider value={tenantValue}>
            <Routes>
              <Route path="/catalog/products/:productId/edit" element={<ProductEditorPage />} />
            </Routes>
          </TenantContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ProductEditorPage – persisted identity', () => {
  it('loads identity fields from the product addressed by the edit URL', async () => {
    renderProductEditorEdit('p1')

    expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Nome')).toHaveValue('Produto A'))
    expect(screen.getByLabelText('SKU')).toHaveValue('SKU-A')
    expect(screen.getByLabelText('Código de Barras')).toHaveValue('123')
    expect(screen.getByTestId('product-kind-select')).toHaveValue('kit')
    expect(screen.getByTestId('product-tracks-inventory-checkbox')).toBeChecked()
  })

  it('persists identity changes through the edit mutation', async () => {
    renderProductEditorEdit('p1')
    const user = userEvent.setup()

    const name = await screen.findByLabelText('Nome')
    await user.clear(name)
    await user.type(name, 'Produto Editado')
    await user.click(screen.getByTestId('product-tracks-inventory-checkbox'))
    await user.click(screen.getByRole('button', { name: 'Continuar' }))

    await waitFor(() => expect(screen.getByTestId('editor-feedback')).toHaveTextContent('Produto atualizado com sucesso.'))
  })

  it('maps persisted stock defaults so a stock-controlled product can be submitted', async () => {
    renderProductEditorEdit('p1')
    const user = userEvent.setup()

    await waitFor(() => expect(screen.getByLabelText('Filial')).toHaveValue('b1'))
    await user.click(screen.getByRole('button', { name: 'Continuar' }))

    await waitFor(() => expect(screen.getByTestId('editor-feedback')).toHaveTextContent('Produto atualizado com sucesso.'))
  })

  it('persists a changed barcode through the product-code API in edit mode', async () => {
    renderProductEditorEdit('p1')
    const user = userEvent.setup()

    await screen.findByTestId('product-identity-step')
    await waitFor(() => expect(screen.getByLabelText('Filial')).toHaveValue('b1'))
    const barcode = await screen.findByLabelText('Código de Barras')
    await user.clear(barcode)
    await user.type(barcode, '999999')
    await user.click(screen.getByTestId('product-tracks-inventory-checkbox'))
    await user.click(screen.getByRole('button', { name: 'Continuar' }))

    await waitFor(() => expect(capturedProductCode).toMatchObject({ method: 'PATCH', productId: 'p1', value: '999999' }))
  })

  it('deactivates the principal barcode when the edit barcode is cleared', async () => {
    renderProductEditorEdit('p1')
    const user = userEvent.setup()

    await waitFor(() => expect(screen.getByLabelText('Filial')).toHaveValue('b1'))
    const barcode = await screen.findByLabelText('Código de Barras')
    await user.clear(barcode)
    await user.click(screen.getByRole('button', { name: 'Continuar' }))

    await waitFor(() => expect(capturedProductCode).toMatchObject({ method: 'PATCH', productId: 'p1', is_active: false, is_principal: false }))
  })
})

describe('ProductEditorPage – product load errors', () => {
  it('shows an actionable error instead of an endless loading state', async () => {
    server.use(
      http.get(`${BASE}/catalog/products/p404/`, () => HttpResponse.json({ detail: 'Not found.' }, { status: 404 })),
    )
    renderProductEditorEdit('p404')

    expect(await screen.findByText('Não foi possível carregar o produto.')).toBeInTheDocument()
    expect(screen.getByTestId('product-retry-button')).toBeInTheDocument()
    expect(screen.queryByText('Carregando produto...')).not.toBeInTheDocument()
  })
})

describe('productToFormData', () => {
  it('preserves product commercial metadata', () => {
    const result = productToFormData({
      id: 'p1', name: 'Produto', description: 'Desc', sku: 'SKU', barcode: '123', category: null,
      category_name: '', unit: 'u1', unit_name: 'Un', unit_symbol: 'UN', unit_precision: 2, price: '10.00',
      is_active: true, product_kind: 'revenda', tracks_inventory: false, brand: '', model: '', tags: ['a'],
      scale_code: '', created_at: '', updated_at: '',
    })
    expect(result).toMatchObject({ name: 'Produto', tags: 'a', stock: null })

    const stockResult = productToFormData({
      id: 'p-stock', name: 'Estoque', sku: '', barcode: '', category: null, category_name: '', unit: null,
      unit_name: '', is_active: true, product_kind: 'revenda', tracks_inventory: true, brand: '', model: '',
      tags: [], scale_code: '', stock: { branch: 'b1', location: 'l1' }, created_at: '', updated_at: '',
    })
    expect(stockResult.stock).toMatchObject({ branch: 'b1', location: 'l1' })
  })
})

describe('ProductEditorPage – quick create category', () => {
  it('quick-created category appears in dropdown without reloading', async () => {
    renderProductEditor()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('product-identity-step')).toBeInTheDocument()
    })

    const catSelect = screen.getByLabelText('Categoria') as HTMLSelectElement
    const initialOptions = Array.from(catSelect.options).map((o) => o.textContent)
    expect(initialOptions).not.toContain('Nova Categoria Quick')

    await user.click(screen.getByTestId('quick-create-category-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('quick-cat-name-input')).toBeInTheDocument()
    })

    await user.type(screen.getByTestId('quick-cat-name-input'), 'Nova Categoria Quick')
    await user.click(screen.getByRole('button', { name: 'Criar' }))

    await waitFor(() => {
      expect(screen.queryByTestId('quick-cat-name-input')).not.toBeInTheDocument()
    })

    await waitFor(() => {
      const updatedOptions = Array.from(catSelect.options).map((o) => o.textContent)
      expect(updatedOptions).toContain('Nova Categoria Quick')
    })
  })
})

describe('ProductEditorPage – stock control', () => {
  it('reveals and requires stock fields when inventory control is selected', async () => {
    renderProductEditor()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('product-identity-step')).toBeInTheDocument()
    })

    expect(screen.queryByTestId('product-stock-fields')).not.toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Controlar estoque' }))

    expect(screen.getByTestId('product-stock-fields')).toBeInTheDocument()
    expect(await screen.findByLabelText('Filial')).toBeInTheDocument()
    expect(await screen.findByLabelText('Local de estoque')).toBeInTheDocument()
    expect(screen.getByLabelText('Quantidade atual')).toBeDisabled()
    expect(screen.getByLabelText('Quantidade inicial')).toHaveValue(0)
    expect(screen.getByLabelText('Quantidade mínima')).toHaveValue(0)
    expect(screen.getByLabelText('Ponto de reposição')).toHaveValue(0)
  })

  it('hides stock control for services', async () => {
    renderProductEditor()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('product-identity-step')).toBeInTheDocument()
    })

    await user.selectOptions(screen.getByTestId('product-kind-select'), 'servico')

    expect(screen.queryByTestId('product-tracks-inventory-checkbox')).not.toBeInTheDocument()
    expect(screen.queryByTestId('product-stock-fields')).not.toBeInTheDocument()
  })

  it('clears selected location when branch changes', async () => {
    renderProductEditor()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('product-identity-step')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('checkbox', { name: 'Controlar estoque' }))

    const branchSelect = await screen.findByLabelText('Filial')
    await user.selectOptions(branchSelect, 'b1')

    const locationSelect = await screen.findByLabelText('Local de estoque')
    await user.selectOptions(locationSelect, 'l1')

    await user.selectOptions(branchSelect, 'b2')

    await waitFor(() => {
      expect(screen.getByTestId('stock-location-select')).toHaveValue('')
    })
  })

  it('rejects maximum below minimum', async () => {
    renderProductEditor()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('product-identity-step')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('checkbox', { name: 'Controlar estoque' }))

    const minInput = screen.getByLabelText('Quantidade mínima')
    await user.clear(minInput)
    await user.type(minInput, '10')
    const maxInput = screen.getByLabelText('Quantidade máxima')
    await user.clear(maxInput)
    await user.type(maxInput, '5')

    await user.click(screen.getByRole('button', { name: 'Continuar' }))

    await waitFor(() => {
      expect(screen.getByText('Máxima deve ser maior ou igual à mínima')).toBeInTheDocument()
    })
  })

  it('creates product with stock through atomic apply', async () => {
    renderProductEditor()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('product-identity-step')).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText('Nome'), 'Produto Estoque')
    await user.click(screen.getByRole('checkbox', { name: 'Controlar estoque' }))

    const branchSelect = await screen.findByLabelText('Filial')
    await user.selectOptions(branchSelect, 'b1')
    const locationSelect = await screen.findByLabelText('Local de estoque')
    await user.selectOptions(locationSelect, 'l1')

    await user.click(screen.getByRole('button', { name: 'Continuar' }))

    await waitFor(() => {
      expect(screen.getByTestId('step-tab-prices')).not.toBeDisabled()
    })
    expect(screen.getByTestId('editor-feedback')).toHaveTextContent('Produto criado com sucesso.')
  })
})

describe('ProductEditorPage – inventory step', () => {
  it('shows current, reserved, available and replenishment thresholds', async () => {
    renderProductEditorEdit()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('product-editor-steps')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('tab', { name: 'Estoque' }))

    expect(await screen.findByTestId('product-inventory-step')).toBeInTheDocument()
    expect(await screen.findAllByText('25,000000')).toHaveLength(2)
    expect(screen.getByTestId('stock-available-value')).toHaveTextContent('25,000000')
    expect(screen.getByTestId('stock-current-value')).toHaveTextContent('25,000000')
    expect(screen.getByTestId('stock-minimum-value')).toHaveTextContent('5,000000')
    expect(screen.getByTestId('stock-reorder-value')).toHaveTextContent('10,000000')
    expect(screen.getByTestId('stock-reserved-value')).toHaveTextContent('0,000000')
    expect(screen.getByText('Normal')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ajustar estoque' }))
      .toHaveAttribute('href', '/app/inventory/adjustments/new?product=p1&branch=b1&location=l1')
    expect(screen.getByRole('link', { name: 'Ver movimentações' }))
      .toHaveAttribute('href', '/app/inventory/movements?product=p1&branch=b1&location=l1')
  })
})

describe('ProductEditorPage – fiscal step', () => {
  it('offers only fiscal types accepted by the backend contract', async () => {
    renderProductEditorEdit()
    const user = userEvent.setup()

    await user.click(await screen.findByTestId('step-tab-fiscal'))
    const select = await screen.findByTestId('fiscal-type-select') as HTMLSelectElement
    expect(Array.from(select.options).map((option) => option.value)).toEqual([
      '', 'revenda', 'industrializacao', 'servico', 'uso_consumo', 'outro',
    ])
  })

  it('loads and saves fiscal data in edit mode', async () => {
    renderProductEditorEdit()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('product-editor-steps')).toBeInTheDocument()
    })

    expect(screen.getByTestId('step-tab-fiscal')).not.toBeDisabled()

    await user.click(screen.getByTestId('step-tab-fiscal'))

    await waitFor(() => {
      expect(screen.getByTestId('product-fiscal-step')).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(screen.getByTestId('fiscal-data-section')).toBeInTheDocument()
    })

    expect(screen.getByTestId('fiscal-ncm-input')).toHaveValue('12345678')

    await user.clear(screen.getByTestId('fiscal-ncm-input'))
    await user.type(screen.getByTestId('fiscal-ncm-input'), '87654321')
    await user.click(screen.getByTestId('fiscal-save-button'))

    await waitFor(() => {
      expect(screen.queryByTestId('fiscal-warning')).not.toBeInTheDocument()
    })
  })
})

describe('ProductEditorPage – composition step', () => {
  it('explains that composition is available only for kit products', async () => {
    server.use(
      http.get(`${BASE}/catalog/products/p1/`, () =>
        HttpResponse.json({ id: 'p1', name: 'Produto A', sku: 'SKU-A', is_active: true, product_kind: 'revenda', tracks_inventory: true }),
      ),
    )
    renderProductEditorEdit()
    const user = userEvent.setup()

    await user.click(await screen.findByTestId('step-tab-composition'))
    expect(await screen.findByTestId('composition-not-kit')).toHaveTextContent('somente para produtos do tipo Kit')
    expect(screen.queryByTestId('add-composition-button')).not.toBeInTheDocument()
  })

  it('shows composition items for kit product', async () => {
    renderProductEditorEdit()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('product-editor-steps')).toBeInTheDocument()
    })

    expect(screen.getByTestId('step-tab-composition')).not.toBeDisabled()

    await user.click(screen.getByTestId('step-tab-composition'))

    await waitFor(() => {
      expect(screen.getByTestId('product-composition-step')).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(screen.getByTestId('composition-table')).toBeInTheDocument()
    })

    expect(screen.getByText('SKU-B')).toBeInTheDocument()
    expect(screen.getByText('SKU-C')).toBeInTheDocument()
    expect(screen.getByText('1.00')).toBeInTheDocument()

    expect(screen.queryByTestId('composition-kit-warning')).not.toBeInTheDocument()
  })

  it('adds a composition item', async () => {
    renderProductEditorEdit()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('product-editor-steps')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('step-tab-composition'))

    await waitFor(() => {
      expect(screen.getByTestId('product-composition-step')).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(screen.getByTestId('composition-component-select')).toBeInTheDocument()
    })

    const componentSelect = screen.getByTestId('composition-component-select') as HTMLSelectElement
    const optionValues = Array.from(componentSelect.options).map((o) => o.value)
    const nonKitOption = optionValues.find((v) => v !== '' && v !== 'p1')

    if (nonKitOption) {
      await user.selectOptions(componentSelect, nonKitOption)
    }

    await user.type(screen.getByTestId('composition-quantity-input'), '3.50')
    await user.click(screen.getByTestId('add-composition-button'))

    await waitFor(() => {
      expect(screen.getByTestId('composition-quantity-input')).toHaveValue('')
    })
  })
})

describe('BrandsPage', () => {
  it('renders table with create and edit', async () => {
    renderBrandsPage()
    await waitFor(() => {
      expect(screen.getByText('Marca A')).toBeInTheDocument()
    })
    expect(screen.getByText('Marca B')).toBeInTheDocument()
    expect(screen.getByTestId('brands-table')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /nova marca/i })).toBeInTheDocument()
  })

  it('creates a new brand and closes form on success', async () => {
    renderBrandsPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Marca A')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /nova marca/i }))
    expect(screen.getByTestId('brand-form')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/nome/i), 'Marca Nova')
    await user.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() => {
      expect(screen.queryByTestId('brand-form')).not.toBeInTheDocument()
    })
  })
})

describe('BrandQuickCreateModal from ProductIdentityStep', () => {
  it('opens and creates brand via quick create modal', async () => {
    const queryClient = createQueryClient()
    const result = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/catalog/products/new']}>
          <AuthContext.Provider value={authValue}>
            <TenantContext.Provider value={tenantValue}>
              <Routes>
                <Route path="/catalog/products/new" element={<ProductEditorPage />} />
              </Routes>
            </TenantContext.Provider>
          </AuthContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(result.getByTestId('product-identity-step')).toBeInTheDocument()
    })

    const brandBtn = result.getByTestId('quick-create-brand-btn')
    expect(brandBtn).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(brandBtn)

    await waitFor(() => {
      expect(result.getByTestId('quick-brand-name-input')).toBeInTheDocument()
    })

    await user.type(result.getByTestId('quick-brand-name-input'), 'Marca Quick')
    await user.click(result.getByRole('button', { name: 'Criar' }))

    await waitFor(() => {
      expect(result.queryByTestId('quick-brand-name-input')).not.toBeInTheDocument()
    })
  })
})

describe('CategoriesPage – hierarchy', () => {
  it('shows parent hierarchy in table', async () => {
    renderCategoriesPage()
    await waitFor(() => {
      expect(screen.getByText('Categoria B')).toBeInTheDocument()
    })
    expect(screen.getAllByText('Categoria A').length).toBe(2)
    expect(screen.getByText('-')).toBeInTheDocument()
  })
})

describe('UnitsPage – search and pagination', () => {
  it('renders search input and pagination', async () => {
    const MANY_UNITS = {
      count: 30,
      next: null,
      previous: null,
      results: Array.from({ length: 25 }, (_, i) => ({
        id: `unit-${i + 1}`,
        name: `Unidade ${i + 1}`,
        abbreviation: `U${i + 1}`,
        symbol: `U${i + 1}`,
        precision: 2,
      })),
    }

    server.use(
      http.get(`${BASE}/catalog/units/`, () => HttpResponse.json(MANY_UNITS)),
    )

    renderUnitsPage()
    await waitFor(() => {
      expect(screen.getByText('Unidade 1')).toBeInTheDocument()
    })
    expect(screen.getByTestId('unit-search-input')).toBeInTheDocument()
    expect(screen.getByText(/página 1 de 2/i)).toBeInTheDocument()
  })
})

const SERVICES_LIST = {
  count: 2,
  next: null,
  previous: null,
  results: [
    { id: 's1', name: 'Consultoria', sku: 'SVC-001', billing_unit: 'hora', duration_minutes: 60, price: '150.00', is_active: true },
    { id: 's2', name: 'Suporte', sku: 'SVC-002', billing_unit: 'unidade', duration_minutes: 30, price: '80.00', is_active: false },
  ],
}

const SERVICES_SEARCH = {
  count: 1,
  next: null,
  previous: null,
  results: [
    { id: 's1', name: 'Consultoria', sku: 'SVC-001', billing_unit: 'hora', duration_minutes: 60, price: '150.00', is_active: true },
  ],
}

function renderServicesPage(initialRoute = '/catalog/services') {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <AuthContext.Provider value={authValue}>
          <TenantContext.Provider value={tenantValue}>
            <Routes>
              <Route path="/catalog/services" element={<ServicesPage />} />
            </Routes>
          </TenantContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function renderServiceEditor(initialRoute = '/catalog/services/new') {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <AuthContext.Provider value={authValue}>
          <TenantContext.Provider value={tenantValue}>
            <Routes>
              <Route path="/catalog/services/new" element={<ServiceEditorPage />} />
            </Routes>
          </TenantContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ServicesPage', () => {
  beforeEach(() => {
    server.use(
      http.get(`${BASE}/catalog/products/`, ({ request }) => {
        const url = new URL(request.url)
        const productKind = url.searchParams.get('product_kind')
        const q = url.searchParams.get('q')
        if (productKind === 'servico' && q) return HttpResponse.json(SERVICES_SEARCH)
        if (productKind === 'servico') return HttpResponse.json(SERVICES_LIST)
        return HttpResponse.json(PRODUCTS_ALL)
      }),
      http.get(`${BASE}/catalog/categories/`, () => HttpResponse.json(CATEGORIES)),
      http.get(`${BASE}/catalog/units/`, () => HttpResponse.json(UNITS)),
    )
  })

  it('ServicesPage renders with search', async () => {
    renderServicesPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('services-page')).toBeInTheDocument()
    })

    expect(screen.getByText('Consultoria')).toBeInTheDocument()
    expect(screen.getByText('Suporte')).toBeInTheDocument()
    expect(screen.getByLabelText('Buscar serviços')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /novo serviço/i })).toBeInTheDocument()

    const searchInput = screen.getByLabelText('Buscar serviços')
    await user.type(searchInput, 'Consultoria')
    await user.click(screen.getByRole('button', { name: 'Buscar' }))

    await waitFor(() => {
      expect(screen.getByText('Consultoria')).toBeInTheDocument()
      expect(screen.queryByText('Suporte')).not.toBeInTheDocument()
    })
  })
})

describe('ServiceEditorPage', () => {
  beforeEach(() => {
    server.use(
      http.post(`${BASE}/catalog/products/`, async ({ request }) => {
        const body = (await request.json()) as { tracks_inventory?: boolean; name?: string }
        if (body.tracks_inventory === true) {
          return HttpResponse.json(
            { type: 'about:blank', title: 'Validation Error', status: 422, detail: 'Serviços não controlam estoque.', errors: { tracks_inventory: ['Serviços não podem controlar estoque.'] } },
            { status: 422 },
          )
        }
        return HttpResponse.json(
          { id: 's-new', name: body.name ?? '', sku: '', barcode: '', category: null, category_name: '', unit: null, unit_name: '', is_active: true, product_kind: 'servico', tracks_inventory: false, brand: '', model: '', tags: [], scale_code: '', created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z' },
          { status: 201 },
        )
      }),
      http.get(`${BASE}/catalog/categories/`, () => HttpResponse.json(CATEGORIES)),
      http.get(`${BASE}/catalog/units/`, () => HttpResponse.json(UNITS)),
    )
  })

  it('ServiceEditorPage shows service-specific fields (billing_unit, duration)', async () => {
    renderServiceEditor()

    await waitFor(() => {
      expect(screen.getByTestId('service-editor-page')).toBeInTheDocument()
    })

    expect(screen.getByTestId('service-editor-form')).toBeInTheDocument()
    expect(screen.getByTestId('service-billing-unit-input')).toBeInTheDocument()
    expect(screen.getByTestId('service-duration-input')).toBeInTheDocument()
    expect(screen.getByTestId('service-price-input')).toBeInTheDocument()
    expect(screen.getByText('Novo Serviço')).toBeInTheDocument()

    expect(screen.queryByTestId('product-tracks-inventory-checkbox')).not.toBeInTheDocument()
  })

  it('Creating service rejects tracks_inventory', () => {
    const payload = toServicePayload({
      name: 'Serviço Teste',
      sku: '',
      description: '',
      category: null,
      unit: null,
      is_active: true,
      price: '100.00',
      billing_unit: 'hora',
      duration_minutes: 60,
      ncm: '',
      cest: '',
      origin_code: '0',
      fiscal_class: '',
    })

    expect(payload.product.product_kind).toBe('servico')
    expect(payload.product.tracks_inventory).toBe(false)
    expect(payload.product).toHaveProperty('billing_unit', 'hora')
    expect(payload.product).toHaveProperty('duration_minutes', 60)
  })

  it('persists service fiscal configuration and initial price after product creation', async () => {
    const requests: string[] = []
    server.use(
      http.post(`${BASE}/catalog/products/s-new/fiscal-data/`, () => {
        requests.push('fiscal')
        return HttpResponse.json({ id: 'f1', product: 's-new' })
      }),
      http.post(`${BASE}/catalog/products/s-new/price-tiers/`, () => {
        requests.push('price')
        return HttpResponse.json({ id: 'pt1', product: 's-new' }, { status: 201 })
      }),
    )
    await persistServiceExtensions('tenant-alpha', 's-new', {
      fiscal: { fiscal_type: 'servico', fiscal_class: '0107' },
      price_tier: { min_quantity: '1', amount: '150.00' },
    })
    expect(requests).toEqual(['fiscal', 'price'])
  })
})

function renderCombosPage(initialRoute = '/catalog/combos') {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <AuthContext.Provider value={authValue}>
          <TenantContext.Provider value={tenantValue}>
            <Routes>
              <Route path="/catalog/combos" element={<CombosPage />} />
            </Routes>
          </TenantContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function renderComboEditor(initialRoute = '/catalog/combos/new') {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <AuthContext.Provider value={authValue}>
          <TenantContext.Provider value={tenantValue}>
            <Routes>
              <Route path="/catalog/combos/new" element={<ComboEditorPage />} />
              <Route path="/catalog/combos/:comboId/edit" element={<ComboEditorPage />} />
            </Routes>
          </TenantContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('CombosPage', () => {
  it('renders combo list with items count', async () => {
    renderCombosPage()
    await waitFor(() => {
      expect(screen.getByTestId('combos-page')).toBeInTheDocument()
    })
    expect(screen.getByText('Combo Alpha')).toBeInTheDocument()
    expect(screen.getByText('Combo Beta')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /novo combo/i })).toBeInTheDocument()
  })

  it('renders empty state when no combos', async () => {
    server.use(
      http.get(`${BASE}/catalog/combos/`, () =>
        HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
      ),
    )
    renderCombosPage()
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })
  })
})

describe('ComboEditorPage', () => {
  it('renders new combo form and creates on save', async () => {
    renderComboEditor()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('combo-editor-page')).toBeInTheDocument()
    })
    expect(screen.getByText('Novo Combo')).toBeInTheDocument()
    expect(screen.getByTestId('combo-sku-input')).toBeInTheDocument()
    expect(screen.getByTestId('combo-name-input')).toBeInTheDocument()
    expect(screen.getByTestId('combo-price-input')).toBeInTheDocument()

    await user.type(screen.getByTestId('combo-sku-input'), 'COMBO-TEST')
    await user.type(screen.getByTestId('combo-name-input'), 'Combo Teste')
    await user.type(screen.getByTestId('combo-price-input'), '99.90')

    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => {
      const pathname = window.location.pathname ?? ''
      expect(pathname).not.toContain('/combos/new')
    })
  })
})

const LABEL_TEMPLATES = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: 'tpl-1',
      name: 'Padrao 50x30',
      width_mm: '50.00',
      height_mm: '30.00',
      margin_mm: '2.00',
      columns: 2,
      rows: 5,
      show_sku: true,
      show_barcode: true,
      show_price: true,
      show_name: true,
      is_active: true,
      version: 1,
    },
  ],
}

function renderLabelsPage(initialRoute = '/catalog/labels') {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <AuthContext.Provider value={authValue}>
          <TenantContext.Provider value={tenantValue}>
            <Routes>
              <Route path="/catalog/labels" element={<LabelsPage />} />
            </Routes>
          </TenantContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('LabelsPage', () => {
  beforeEach(() => {
    server.use(
      http.get(`${BASE}/catalog/products/`, () => HttpResponse.json(PRODUCTS_ALL)),
      http.get(`${BASE}/catalog/categories/`, () => HttpResponse.json(CATEGORIES)),
      http.get(`${BASE}/catalog/brands/`, () => HttpResponse.json(BRANDS)),
      http.get(`${BASE}/catalog/label-templates/`, () => HttpResponse.json(LABEL_TEMPLATES)),
      http.post(`${BASE}/catalog/labels/generate/`, () => {
        const pdfContent = '%PDF-1.4 fake label pdf'
        return new HttpResponse(pdfContent, {
          status: 200,
          headers: { 'Content-Type': 'application/pdf' },
        })
      }),
    )
  })

  it('renders product table and filters', async () => {
    renderLabelsPage()

    await waitFor(() => {
      expect(screen.getByText('Produto A')).toBeInTheDocument()
    })

    expect(screen.getByTestId('labels-product-table')).toBeInTheDocument()
    expect(screen.getByTestId('label-product-search')).toBeInTheDocument()
    expect(screen.getByTestId('label-category-filter')).toBeInTheDocument()
    expect(screen.getByTestId('label-brand-filter')).toBeInTheDocument()
    expect(screen.getByTestId('label-template-select')).toBeInTheDocument()
    expect(screen.getByTestId('label-generate-button')).toBeInTheDocument()
  })

  it('selects products and enables generate button', async () => {
    renderLabelsPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Produto A')).toBeInTheDocument()
    })

    const generateBtn = screen.getByTestId('label-generate-button')
    expect(generateBtn).toBeDisabled()

    await user.click(screen.getByTestId('label-checkbox-p1'))
    expect(generateBtn).not.toBeDisabled()
  })

  it('shows error when generating without template selected', async () => {
    renderLabelsPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Produto A')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('label-checkbox-p1'))
    await user.click(screen.getByTestId('label-generate-button'))

    await waitFor(() => {
      expect(screen.getByTestId('label-generate-error')).toBeInTheDocument()
      expect(screen.getByTestId('label-generate-error')).toHaveTextContent('modelo')
    })
  })

  it('uploads and displays a valid product image when editing', async () => {
    const images: Array<Record<string, unknown>> = []
    server.use(
      http.get(`${BASE}/catalog/products/p1/images/`, () => HttpResponse.json({
        count: images.length,
        next: null,
        previous: null,
        results: images,
      })),
      http.post(`${BASE}/catalog/products/p1/images/`, () => {
        const image = {
          id: 'img-1', product: 'p1', object_key: 'produto.png',
          file: '/media/catalog/products/produto.png', alt_text: 'produto',
          is_primary: false, position: 0,
        }
        images.push(image)
        return HttpResponse.json(image, { status: 201 })
      }),
    )
    renderProductEditorEdit()
    const user = userEvent.setup()
    const file = new File(['png'], 'produto.png', { type: 'image/png' })
    await user.upload(screen.getByTestId('media-file-input'), file)

    await waitFor(() => {
      expect(screen.getByTestId('product-image-gallery')).toBeInTheDocument()
    })
    expect(screen.getByRole('img', { name: 'produto' })).toHaveAttribute(
      'src', '/media/catalog/products/produto.png',
    )
  })

  it('keeps the product editor usable when the media collection fails', async () => {
    server.use(
      http.get(`${BASE}/catalog/products/p1/images/`, () =>
        HttpResponse.json({ detail: 'media unavailable' }, { status: 503 }),
      ),
    )

    renderProductEditorEdit()

    await waitFor(() => {
      expect(screen.getByTestId('product-identity-step')).toBeInTheDocument()
    })
    expect(screen.getByTestId('product-media-panel')).toBeInTheDocument()
    const mediaError = await waitFor(() => screen.getByTestId('media-load-error'))
    expect(mediaError).toHaveRole('alert')
    expect(mediaError).toHaveTextContent('Não foi possível carregar as imagens. O restante do cadastro permanece disponível.')
  })

  it('isolates malformed media collections without disabling editor controls', async () => {
    server.use(
      http.get(`${BASE}/catalog/products/p1/images/`, () =>
        HttpResponse.json({ count: 1, next: null, previous: null, results: null }),
      ),
    )

    renderProductEditorEdit()

    await waitFor(() => {
      expect(screen.getByTestId('media-load-error')).toBeInTheDocument()
    })
    expect(screen.getByTestId('media-load-error')).toHaveRole('alert')
    expect(screen.getByLabelText('Nome')).not.toBeDisabled()
  })

  it('shows a PDF preview before offering the final download', async () => {
    const createObjectURL = vi.fn(() => 'blob:label-preview')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
    renderLabelsPage()
    const user = userEvent.setup()

    await waitFor(() => expect(screen.getByText('Produto A')).toBeInTheDocument())
    await user.selectOptions(screen.getByTestId('label-template-select'), 'tpl-1')
    await user.click(screen.getByTestId('label-checkbox-p1'))
    await user.click(screen.getByTestId('label-generate-button'))

    await waitFor(() => {
      expect(screen.getByTestId('label-pdf-preview')).toHaveAttribute(
        'src',
        'blob:label-preview',
      )
    })
    expect(screen.getByTestId('label-download-link')).toHaveAttribute(
      'href',
      'blob:label-preview',
    )
    expect(revokeObjectURL).not.toHaveBeenCalled()
  })
})

// =============================================================================
// Sprint 29 — Channel Profiles (ProductChannelsStep)
// =============================================================================

const CHANNEL_PROFILES_MOCK = [
  {
    id: 'ch-1',
    product: 'p1',
    channel_slug: 'mercadolivre',
    title: 'Produto no ML',
    description: 'Desc ML',
    list_price: '149.9000',
    sale_price: '129.9000',
    dimensions_json: {},
    weight_grams: 500,
    status: 'draft',
    version: 1,
    published_at: null,
  },
  {
    id: 'ch-2',
    product: 'p1',
    channel_slug: 'shopee',
    title: 'Produto na Shopee',
    description: 'Desc Shopee',
    list_price: null,
    sale_price: null,
    dimensions_json: {},
    weight_grams: null,
    status: 'published',
    version: 2,
    published_at: '2026-07-15T12:00:00Z',
  },
]

describe('ProductChannelsStep', () => {
  beforeEach(() => {
    server.use(
      http.get(`${BASE}/catalog/products/p1/channel-profiles/`, () =>
        HttpResponse.json(CHANNEL_PROFILES_MOCK),
      ),
      http.post(`${BASE}/catalog/products/p1/channel-profiles/`, async ({ request }) => {
        const body = (await request.json()) as { channel_slug?: string }
        return HttpResponse.json(
          {
            id: `ch-new-${Date.now()}`,
            product: 'p1',
            channel_slug: body.channel_slug ?? 'new',
            title: '',
            description: '',
            list_price: null,
            sale_price: null,
            dimensions_json: {},
            weight_grams: null,
            status: 'draft',
            version: 1,
            published_at: null,
          },
          { status: 201 },
        )
      }),
      http.put(`${BASE}/catalog/products/p1/channel-profiles/mercadolivre/`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({
          ...CHANNEL_PROFILES_MOCK[0],
          ...body,
          version: 2,
        })
      }),
      http.post(`${BASE}/catalog/products/p1/channel-profiles/mercadolivre/publish/`, () =>
        HttpResponse.json({
          ...CHANNEL_PROFILES_MOCK[0],
          status: 'ready',
        }),
      ),
    )
  })

  it('displays channel profiles with status badges', async () => {
    renderProductEditorEdit('p1')

    await waitFor(() => {
      expect(screen.getByTestId('product-editor-steps')).toBeInTheDocument()
    })

    const channelsTab = screen.getByTestId('step-tab-channels')
    expect(channelsTab).not.toBeDisabled()

    const user = userEvent.setup()
    await user.click(channelsTab)

    await waitFor(() => {
      expect(screen.getByTestId('product-channels-step')).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(screen.getByTestId('channel-row-mercadolivre')).toBeInTheDocument()
    })

    expect(screen.getByTestId('channel-row-shopee')).toBeInTheDocument()
    expect(screen.getByTestId('channel-status-mercadolivre')).toHaveTextContent('Rascunho')
    expect(screen.getByTestId('channel-status-shopee')).toHaveTextContent('Publicado')
  })

  it('publishes a channel profile', async () => {
    renderProductEditorEdit('p1')

    await waitFor(() => {
      expect(screen.getByTestId('product-editor-steps')).toBeInTheDocument()
    })

    const user = userEvent.setup()
    await user.click(screen.getByTestId('step-tab-channels'))

    await waitFor(() => {
      expect(screen.getByTestId('product-channels-step')).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(screen.getByTestId('publish-channel-mercadolivre')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('publish-channel-mercadolivre'))

    await waitFor(() => {
      expect(screen.queryByTestId('channel-publish-error')).not.toBeInTheDocument()
    })
  })
})

describe('ProductPricesStep base price contract', () => {
  it('links a new quantity tier to the effective ProductPrice', async () => {
    let tierPayload: Record<string, unknown> | null = null
    server.use(
      http.get(`${BASE}/catalog/products/p1/prices/`, () => HttpResponse.json({ count: 1, next: null, previous: null, results: [{ id: 'price-1', product: 'p1', amount: '10.00', valid_from: '2026-01-01T00:00:00Z', valid_to: null, is_active: true, version: 1 }] })),
      http.get(`${BASE}/catalog/products/p1/price-tiers/`, () => HttpResponse.json({ count: 0, next: null, previous: null, results: [] })),
      http.post(`${BASE}/catalog/products/p1/price-tiers/`, async ({ request }) => {
        tierPayload = await request.json() as Record<string, unknown>
        return HttpResponse.json({ id: 'tier-new', product: 'p1', price: 'price-1', min_quantity: '5', amount: '9.00' }, { status: 201 })
      }),
    )
    renderProductEditorEdit('p1')
    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByTestId('product-editor-steps')).toBeInTheDocument())
    await user.click(screen.getByTestId('step-tab-prices'))
    await user.type(await screen.findByTestId('tier-min-quantity-input'), '5')
    await user.type(screen.getByTestId('tier-amount-input'), '9.00')
    await user.click(screen.getByTestId('add-tier-button'))
    await waitFor(() => expect(tierPayload).not.toBeNull())
    expect(tierPayload).toMatchObject({ price: 'price-1', min_quantity: '5', amount: '9.00' })
  })

  it('shows empty state when no ProductPrice exists and does not promote tiers', async () => {
    server.use(
      http.get(`${BASE}/catalog/products/p1/prices/`, () => HttpResponse.json({ count: 0, next: null, previous: null, results: [] })),
      http.get(`${BASE}/catalog/products/p1/price-tiers/`, () => HttpResponse.json({ count: 1, next: null, previous: null, results: [{ id: 'tier-1', product: 'p1', min_quantity: '1', amount: '9.00' }] })),
    )
    renderProductEditorEdit('p1')
    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByTestId('product-editor-steps')).toBeInTheDocument())
    await user.click(screen.getByTestId('step-tab-prices'))
    expect(await screen.findByTestId('base-price-empty')).toHaveTextContent('Nenhum preço base cadastrado')
    expect(screen.queryByTestId('base-price-amount')).not.toHaveValue('9.00')
  })

  it('signals multiple ProductPrice records while keeping tiers optional', async () => {
    server.use(
      http.get(`${BASE}/catalog/products/p1/prices/`, () => HttpResponse.json({ count: 2, next: null, previous: null, results: [
        { id: 'price-1', product: 'p1', amount: '10.00', valid_from: '2026-01-01T00:00:00Z', valid_to: null, is_active: true, version: 3 },
        { id: 'price-2', product: 'p1', amount: '12.00', valid_from: '2026-02-01T00:00:00Z', valid_to: null, is_active: true, version: 1 },
      ] })),
      http.get(`${BASE}/catalog/products/p1/price-tiers/`, () => HttpResponse.json({ count: 0, next: null, previous: null, results: [] })),
    )
    renderProductEditorEdit('p1')
    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByTestId('product-editor-steps')).toBeInTheDocument())
    await user.click(screen.getByTestId('step-tab-prices'))
    expect(await screen.findByTestId('base-price-conflict')).toHaveRole('alert')
    expect(screen.getByTestId('price-tiers-section')).toBeInTheDocument()
  })

  it('updates ProductPrice with If-Match version', async () => {
    let patchHeaders: Headers | null = null
    server.use(
      http.get(`${BASE}/catalog/products/p1/prices/`, () => HttpResponse.json({ count: 1, next: null, previous: null, results: [{ id: 'price-1', product: 'p1', amount: '10.00', valid_from: '2026-01-01T00:00:00Z', valid_to: null, is_active: true, version: 3 }] })),
      http.patch(`${BASE}/catalog/products/p1/prices/price-1/`, async ({ request }) => {
        patchHeaders = request.headers
        return HttpResponse.json({ id: 'price-1', product: 'p1', amount: '11.00', valid_from: '2026-01-01T00:00:00Z', valid_to: null, is_active: true, version: 4 })
      }),
      http.get(`${BASE}/catalog/products/p1/price-tiers/`, () => HttpResponse.json({ count: 0, next: null, previous: null, results: [] })),
    )
    renderProductEditorEdit('p1')
    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByTestId('product-editor-steps')).toBeInTheDocument())
    await user.click(screen.getByTestId('step-tab-prices'))
    const amount = await screen.findByTestId('base-price-amount')
    await user.clear(amount)
    await user.type(amount, '11.00')
    await user.click(screen.getByTestId('save-base-price'))
    await waitFor(() => expect(patchHeaders).not.toBeNull())
    expect((patchHeaders as Headers | null)?.get('If-Match')).toBe('3')
  })

  it('creates the R4 ProductPrice command when the base price is absent', async () => {
    let payload: Record<string, unknown> | null = null
    server.use(
      http.get(`${BASE}/catalog/products/p1/prices/`, () => HttpResponse.json({ count: 0, next: null, previous: null, results: [] })),
      http.post(`${BASE}/catalog/products/p1/prices/`, async ({ request }) => {
        payload = await request.json() as Record<string, unknown>
        return HttpResponse.json({ id: 'price-new', product: 'p1', amount: '11.00', valid_from: '2026-08-08T00:00:00Z', valid_to: null, is_active: true, version: 1 }, { status: 201 })
      }),
      http.get(`${BASE}/catalog/products/p1/price-tiers/`, () => HttpResponse.json({ count: 0, next: null, previous: null, results: [] })),
    )
    renderProductEditorEdit('p1')
    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByTestId('product-editor-steps')).toBeInTheDocument())
    await user.click(screen.getByTestId('step-tab-prices'))
    const amount = await screen.findByTestId('base-price-amount')
    await user.type(amount, '11.00')
    await user.click(screen.getByTestId('save-base-price'))
    await waitFor(() => expect(payload).not.toBeNull())
    expect((payload as unknown as Record<string, unknown>).amount).toBe('11.00')
    expect((payload as unknown as Record<string, unknown>).product_id).toBe('p1')
    expect((payload as unknown as Record<string, unknown>).tiers).toEqual([])
    expect((payload as unknown as Record<string, unknown>).command_id).toEqual(expect.any(String))
  })

  it('uses only the effective ProductPrice when history is also returned', async () => {
    server.use(
      http.get(`${BASE}/catalog/products/p1/prices/`, () => HttpResponse.json({ count: 2, next: null, previous: null, results: [
        { id: 'price-old', product: 'p1', amount: '9.00', valid_from: '2026-01-01T00:00:00Z', valid_to: '2026-02-01T00:00:00Z', is_active: true, version: 1 },
        { id: 'price-current', product: 'p1', amount: '11.00', valid_from: '2026-03-01T00:00:00Z', valid_to: null, is_active: true, version: 2 },
      ] })),
      http.get(`${BASE}/catalog/products/p1/price-tiers/`, () => HttpResponse.json({ count: 0, next: null, previous: null, results: [] })),
    )
    renderProductEditorEdit('p1')
    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByTestId('product-editor-steps')).toBeInTheDocument())
    await user.click(screen.getByTestId('step-tab-prices'))
    expect(await screen.findByTestId('base-price-amount')).toHaveValue('11.00')
    expect(screen.queryByTestId('base-price-conflict')).not.toBeInTheDocument()
  })

  it('does not offer create when the base-price query fails', async () => {
    server.use(
      http.get(`${BASE}/catalog/products/p1/prices/`, () => HttpResponse.json({ detail: 'unavailable' }, { status: 503 })),
      http.get(`${BASE}/catalog/products/p1/price-tiers/`, () => HttpResponse.json({ count: 0, next: null, previous: null, results: [] })),
    )
    renderProductEditorEdit('p1')
    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByTestId('product-editor-steps')).toBeInTheDocument())
    await user.click(screen.getByTestId('step-tab-prices'))
    expect(await screen.findByTestId('base-price-load-error')).toHaveRole('alert')
    expect(screen.queryByTestId('base-price-empty')).not.toBeInTheDocument()
    expect(screen.queryByTestId('save-base-price')).not.toBeInTheDocument()
    expect(screen.getByTestId('add-tier-button')).toBeDisabled()
  })

  it('saves the initial retail price through the explicit R4 POST contract', async () => {
    let payload: Record<string, unknown> | null = null
    server.use(
      http.get(`${BASE}/catalog/products/p1/prices/`, () => HttpResponse.json({ results: [] })),
      http.get(`${BASE}/catalog/products/p1/price-tiers/`, () => HttpResponse.json({ results: [] })),
      http.post(`${BASE}/catalog/products/p1/prices/`, async ({ request }) => {
        payload = await request.json() as Record<string, unknown>
        return HttpResponse.json({ command_id: payload.command_id, status: 'applied' }, { status: 201 })
      }),
    )

    renderProductEditorEdit('p1')
    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByTestId('product-editor-steps')).toBeInTheDocument())
    await user.click(screen.getByTestId('step-tab-prices'))
    await user.type(await screen.findByTestId('base-price-amount'), '11.00')
    await user.click(screen.getByTestId('save-base-price'))

    await waitFor(() => expect(payload).not.toBeNull())
    expect(payload).toMatchObject({ product_id: 'p1', amount: '11.00', tiers: [] })
    expect((payload as unknown as Record<string, unknown>).command_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[4-9][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })

  it('reports an R4 409 conflict while preserving the entered retail price', async () => {
    server.use(
      http.get(`${BASE}/catalog/products/p1/prices/`, () => HttpResponse.json({ results: [] })),
      http.get(`${BASE}/catalog/products/p1/price-tiers/`, () => HttpResponse.json({ results: [] })),
      http.post(`${BASE}/catalog/products/p1/prices/`, () => HttpResponse.json(
        { type: 'about:blank', title: 'Conflict', status: 409, detail: 'Comando já aplicado com outro conteúdo.' },
        { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
      )),
    )

    renderProductEditorEdit('p1')
    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByTestId('product-editor-steps')).toBeInTheDocument())
    await user.click(screen.getByTestId('step-tab-prices'))
    const amount = await screen.findByTestId('base-price-amount')
    await user.type(amount, '11.00')
    await user.click(screen.getByTestId('save-base-price'))

    expect(await screen.findByTestId('price-feedback')).toHaveTextContent('Conflito')
    expect(amount).toHaveValue('11.00')
  })

  it('shows explicit empty and tier loading error states without an R4 snapshot', async () => {
    server.use(
      http.get(`${BASE}/catalog/products/p1/prices/`, () => HttpResponse.json({ results: [] })),
      http.get(`${BASE}/catalog/products/p1/price-tiers/`, () => HttpResponse.json(
        { type: 'about:blank', title: 'Tiers unavailable', status: 503, detail: 'Faixas indisponíveis.' },
        { status: 503, headers: { 'Content-Type': 'application/problem+json' } },
      )),
    )

    renderProductEditorEdit('p1')
    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByTestId('product-editor-steps')).toBeInTheDocument())
    await user.click(screen.getByTestId('step-tab-prices'))

    expect(await screen.findByTestId('base-price-empty')).toHaveTextContent('Nenhum preço base cadastrado')
    expect(await screen.findByTestId('price-tiers-load-error')).toHaveTextContent('Faixas indisponíveis.')
  })

  it('associates tier validation errors and gives each remove action a contextual name', async () => {
    server.use(
      http.get(`${BASE}/catalog/products/p1/prices/`, () => HttpResponse.json({ results: [{ id: 'price-1', product: 'p1', amount: '10.00', valid_from: '2026-01-01T00:00:00Z', valid_to: null, is_active: true, version: 1 }] })),
      http.get(`${BASE}/catalog/products/p1/price-tiers/`, () => HttpResponse.json({ results: [{ id: 'tier-1', product: 'p1', price: 'price-1', min_quantity: '5', amount: '9.00' }] })),
    )

    renderProductEditorEdit('p1')
    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByTestId('product-editor-steps')).toBeInTheDocument())
    await user.click(screen.getByTestId('step-tab-prices'))
    await screen.findByTestId('price-tier-row')
    expect(screen.getByRole('button', { name: /Remover faixa de atacado.*5/i })).toBeInTheDocument()
    await user.click(screen.getByTestId('add-tier-button'))
    expect(screen.getByTestId('tier-min-quantity-input')).toHaveAttribute('aria-describedby', 'tier-min-quantity-error')
    expect(screen.getByTestId('tier-amount-input')).toHaveAttribute('aria-describedby', 'tier-amount-error')
  })

  it('calculates a missing retail margin with Decimal.js values from the R4 snapshot', async () => {
    server.use(
      http.get(`${BASE}/catalog/products/p1/prices/`, () => HttpResponse.json({ id: 'price-1', product: 'p1', amount: '100.00', cost: '75.00', currency: 'BRL', retail_margin: null, tiers: [], version: 1 })),
      http.get(`${BASE}/catalog/products/p1/price-tiers/`, () => HttpResponse.json({ results: [] })),
    )

    renderProductEditorEdit('p1')
    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByTestId('product-editor-steps')).toBeInTheDocument())
    await user.click(screen.getByTestId('step-tab-prices'))
    expect(await screen.findByTestId('r4-pricing-summary')).toHaveTextContent('25.00%')
  })
})
