import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { describe, it, expect, beforeEach } from 'vitest'

import { AuthContext } from '@/auth/AuthProvider'
import type { AuthContextValue } from '@/auth/AuthProvider'
import { TenantContext } from '@/tenant/TenantProvider'
import { server } from '@/test/server'

import ProductsPage from './ProductsPage'
import CategoriesPage from './CategoriesPage'
import UnitsPage from './UnitsPage'

const BASE = '/api/v1'

const authValue: AuthContextValue = {
  state: 'authenticated',
  user: { id: 1, email: 'admin@zyrp.local', name: 'Admin', is_active: true, is_mfa_enabled: false },
  memberships: [{ id: 1, tenant_id: 'tenant-alpha', tenant_name: 'Alpha', role: 'admin' }],
  login: async () => ({ requiresMfa: false }),
  challengeMfa: async () => {},
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
    { id: 'p1', name: 'Produto A', sku: 'SKU-A', barcode: '123', category: 'cat-1', category_name: 'Categoria A', unit: 'unit-1', unit_name: 'Un', is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    { id: 'p2', name: 'Produto B', sku: 'SKU-B', barcode: '456', category: 'cat-2', category_name: 'Categoria B', unit: 'unit-2', unit_name: 'Kg', is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    { id: 'p3', name: 'Produto C', sku: 'SKU-C', barcode: '789', category: null, category_name: '', unit: null, unit_name: '', is_active: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  ],
}

const PRODUCTS_SEARCH = {
  count: 1,
  next: null,
  previous: null,
  results: [
    { id: 'p1', name: 'Produto A', sku: 'SKU-A', barcode: '123', category: 'cat-1', category_name: 'Categoria A', unit: 'unit-1', unit_name: 'Un', is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  ],
}

const PRODUCTS_FILTERED_CAT = {
  count: 1,
  next: null,
  previous: null,
  results: [
    { id: 'p1', name: 'Produto A', sku: 'SKU-A', barcode: '123', category: 'cat-1', category_name: 'Categoria A', unit: 'unit-1', unit_name: 'Un', is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  ],
}

const CATEGORIES = {
  count: 2,
  next: null,
  previous: null,
  results: [
    { id: 'cat-1', name: 'Categoria A', is_active: true },
    { id: 'cat-2', name: 'Categoria B', is_active: true },
  ],
}

const UNITS = {
  count: 2,
  next: null,
  previous: null,
  results: [
    { id: 'unit-1', name: 'Unidade', abbreviation: 'Un' },
    { id: 'unit-2', name: 'Quilograma', abbreviation: 'Kg' },
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
        { id: 'p-new', name: body.name, sku: '', barcode: '', category: null, category_name: '', unit: null, unit_name: '', is_active: true, created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z' },
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
        { id: params.id, ...body, sku: '', barcode: '', category: null, category_name: '', unit: null, unit_name: '', is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z' },
      )
    }),
    http.get(`${BASE}/catalog/categories/`, () => HttpResponse.json(CATEGORIES)),
    http.post(`${BASE}/catalog/categories/`, async ({ request }) => {
      const body = (await request.json()) as { name?: string }
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
    await user.click(screen.getByRole('button', { name: /salvar/i }))

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
    await user.click(screen.getByRole('button', { name: /salvar/i }))

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
    await user.click(screen.getByRole('button', { name: /salvar/i }))

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
    await user.click(screen.getByRole('button', { name: /salvar/i }))

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
      expect(screen.getByText('Categoria A')).toBeInTheDocument()
    })
    expect(screen.getByText('Categoria B')).toBeInTheDocument()
  })

  it('creates a new category and closes form on success', async () => {
    renderCategoriesPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Categoria A')).toBeInTheDocument()
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
      expect(screen.getByText('Categoria A')).toBeInTheDocument()
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
