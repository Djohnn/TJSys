import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { toProductPayload } from './catalogSchemas'
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

const BASE = '/api/v1'

const authValue: AuthContextValue = {
  state: 'authenticated',
  user: { id: 1, email: 'admin@zyrp.local', name: 'Admin', is_active: true, is_mfa_enabled: false },
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
            </Routes>
          </TenantContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
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
    http.get(`${BASE}/products/:id/fiscal-data/`, ({ params }) => {
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
    http.post(`${BASE}/products/:id/fiscal-data/`, async ({ request, params }) => {
      const body = await request.json() as Record<string, unknown>
      return HttpResponse.json({
        id: `fd-${params.id}`,
        product: params.id as string,
        ...body,
      })
    }),
    http.get(`${BASE}/products/:id/price-tiers/`, ({ params }) => {
      if (params.id === 'p-no-tiers') {
        return HttpResponse.json([])
      }
      return HttpResponse.json([
        { id: 'pt-1', product: params.id as string, min_quantity: '1', amount: '10.00' },
        { id: 'pt-2', product: params.id as string, min_quantity: '10', amount: '8.50' },
      ])
    }),
    http.post(`${BASE}/products/:id/price-tiers/`, async ({ request, params }) => {
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
    http.delete(`${BASE}/products/:id/price-tiers/:tierId/`, () => {
      return new HttpResponse(null, { status: 204 })
    }),
    http.get(`${BASE}/catalog/products/:id/`, ({ params }) => {
      if (params.id === 'p1') {
        return HttpResponse.json({
          id: 'p1', name: 'Produto A', sku: 'SKU-A', barcode: '123', category: 'cat-1', category_name: 'Categoria A', unit: 'unit-1', unit_name: 'Un', is_active: true, product_kind: 'kit', tracks_inventory: true, brand: 'Marca A', model: 'Modelo A', tags: ['tag1', 'tag2'], scale_code: 'SC001', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
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

  it('creates a new product and closes form on success', async () => {
    renderProductsPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Produto A')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /novo produto/i }))
    expect(screen.getByTestId('product-form')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/nome/i), 'Produto Novo')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => {
      expect(screen.queryByTestId('product-form')).not.toBeInTheDocument()
    })
  })

  it('shows validation error for empty product name', async () => {
    renderProductsPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Produto A')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /novo produto/i }))
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => {
      expect(screen.getByText(/Nome é obrigatório/i)).toBeInTheDocument()
    })
  })

  it('shows error on 409 conflict for product', async () => {
    renderProductsPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Produto A')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /novo produto/i }))
    await user.type(screen.getByLabelText(/nome/i), 'Conflito')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => {
      expect(screen.getByTestId('form-error')).toHaveTextContent(/já existe/i)
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
    renderProductsPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Produto A')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /novo produto/i }))
    expect(screen.getByTestId('product-form')).toBeInTheDocument()

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

    expect(screen.getByTestId('price-tiers-table')).toBeInTheDocument()
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
      http.get(`${BASE}/products/p1/price-tiers/`, () => HttpResponse.json(tiers)),
      http.delete(`${BASE}/products/p1/price-tiers/:tierId/`, ({ params }) => {
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

    const deleteButton = screen.getByTestId('delete-tier-pt-1')
    await user.click(deleteButton)

    await waitFor(() => {
      expect(screen.queryByTestId('delete-tier-pt-1')).not.toBeInTheDocument()
    })
  })
})

describe('Product form – quick create modals', () => {
  it('quick category create button opens modal', async () => {
    renderProductsPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Produto A')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /novo produto/i }))
    expect(screen.getByTestId('product-form')).toBeInTheDocument()

    const catBtn = screen.getByTestId('quick-create-category-btn')
    expect(catBtn).toBeInTheDocument()

    await user.click(catBtn)

    await waitFor(() => {
      expect(screen.getByTestId('quick-cat-name-input')).toBeInTheDocument()
    })
  })

  it('quick category create submits and closes', async () => {
    renderProductsPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Produto A')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /novo produto/i }))
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
    renderProductsPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Produto A')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /novo produto/i }))
    expect(screen.getByTestId('product-form')).toBeInTheDocument()

    const unitBtn = screen.getByTestId('quick-create-unit-btn')
    expect(unitBtn).toBeInTheDocument()

    await user.click(unitBtn)

    await waitFor(() => {
      expect(screen.getByTestId('quick-unit-symbol-input')).toBeInTheDocument()
      expect(screen.getByTestId('quick-unit-name-input')).toBeInTheDocument()
    })
  })

  it('quick unit create shows error on duplicate', async () => {
    renderProductsPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Produto A')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /novo produto/i }))
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
      scale_code: '', tracks_inventory: false,
    })
    expect(payload.product).toHaveProperty('base_unit', 'unit-1')
    expect(payload.product).not.toHaveProperty('unit')
    expect(payload.product).not.toHaveProperty('barcode')
    expect(payload.barcode).toBe('789123')
    expect(payload.product.tags).toEqual(['qa', 'web'])
  })

  it('splits comma-separated tags into array', () => {
    const payload = toProductPayload({
      name: 'T', sku: 'T', unit: 'u', barcode: '', tags: 'a, b , c',
      description: '', category: null, is_active: true, product_kind: '', brand: '', model: '',
      scale_code: '', tracks_inventory: false,
    })
    expect(payload.product.tags).toEqual(['a', 'b', 'c'])
  })

  it('handles empty tags and barcode gracefully', () => {
    const payload = toProductPayload({
      name: 'T', sku: 'T', unit: 'u', barcode: '', tags: '',
      description: '', category: null, is_active: true, product_kind: '', brand: '', model: '',
      scale_code: '', tracks_inventory: false,
    })
    expect(payload.product.tags).toEqual([])
    expect(payload.barcode).toBe('')
  })
})

describe('CatalogHomePage', () => {
  it('renders 7 hub cards', () => {
    renderCatalogHome()
    expect(screen.getByTestId('catalog-home-page')).toBeInTheDocument()
    expect(screen.getByTestId('hub-card-produtos')).toBeInTheDocument()
    expect(screen.getByTestId('hub-card-serviços')).toBeInTheDocument()
    expect(screen.getByTestId('hub-card-combo')).toBeInTheDocument()
    expect(screen.getByTestId('hub-card-categorias')).toBeInTheDocument()
    expect(screen.getByTestId('hub-card-marcas')).toBeInTheDocument()
    expect(screen.getByTestId('hub-card-unidades')).toBeInTheDocument()
    expect(screen.getByTestId('hub-card-etiquetas')).toBeInTheDocument()
  })

  it('card links navigate to correct routes', () => {
    renderCatalogHome()
    expect(screen.getByTestId('hub-card-produtos').closest('a')).toHaveAttribute('href', '/catalog/products')
    expect(screen.getByTestId('hub-card-categorias').closest('a')).toHaveAttribute('href', '/catalog/categories')
    expect(screen.getByTestId('hub-card-unidades').closest('a')).toHaveAttribute('href', '/catalog/units')
  })
})

describe('ProductEditorPage', () => {
  it('renders editor layout for new product', async () => {
    renderProductEditor()
    await waitFor(() => {
      expect(screen.getByTestId('product-editor-page')).toBeInTheDocument()
    })
    expect(screen.getByTestId('product-media-panel')).toBeInTheDocument()
    expect(screen.getByTestId('product-identity-step')).toBeInTheDocument()
    expect(screen.getByTestId('product-editor-layout')).toHaveClass('grid-cols-1')
    expect(screen.getByTestId('product-editor-layout')).toHaveClass(
      'lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,2.2fr)]',
    )
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

describe('ProductEditorPage – fiscal step', () => {
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
      http.get(`${BASE}/catalog/products/p1/images/`, () => HttpResponse.json(images)),
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
