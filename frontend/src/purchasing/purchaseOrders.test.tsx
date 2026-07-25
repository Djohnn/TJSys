import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { describe, it, expect, beforeEach } from 'vitest'

import { AuthContext } from '@/auth/AuthProvider'
import type { AuthContextValue } from '@/auth/AuthProvider'
import { TenantContext } from '@/tenant/TenantProvider'
import type { TenantContextValue } from '@/tenant/TenantProvider'
import { OrganizationContext } from '@/organization/OrganizationProvider'
import type { OrganizationContextValue } from '@/organization/OrganizationProvider'
import { server } from '@/test/server'

import SuppliersPage from './SuppliersPage'
import PurchaseOrdersPage from './PurchaseOrdersPage'
import PurchaseOrderEditor from './PurchaseOrderEditor'
import PurchaseOrderDetailPage from './PurchaseOrderDetailPage'

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

const tenantValue: TenantContextValue = {
  selectedTenant: { id: 1, tenant_id: 'tenant-alpha', tenant_name: 'Alpha', role: 'admin' },
  memberships: [{ id: 1, tenant_id: 'tenant-alpha', tenant_name: 'Alpha', role: 'admin' }],
  selectTenant: () => {},
}

const orgValue: OrganizationContextValue = {
  companies: [],
  branches: [],
  currentCompany: null,
  currentBranch: null,
  setCurrentBranch: () => {},
  isLoading: false,
}

const SUPPLIERS_PAGE_1 = {
  count: 2,
  next: null,
  previous: null,
  results: [
    { id: 's1', name: 'Fornecedor A', cnpj: '11.222.333/0001-44', ie: '123', is_active: true, created_at: '2026-01-01T00:00:00Z' },
    { id: 's2', name: 'Fornecedor B', cnpj: '22.333.444/0001-55', ie: '', is_active: false, created_at: '2026-01-01T00:00:00Z' },
  ],
}

const PURCHASE_ORDERS = {
  count: 2,
  next: null,
  previous: null,
  results: [
    { id: 'po1', number: 'PO-001', supplier: 's1', supplier_name: 'Fornecedor A', branch: 'b1', branch_name: 'Centro', status: 'draft', total: '1500.00', items: [], created_at: '2026-07-01T00:00:00Z', created_by_name: 'Admin' },
    { id: 'po2', number: 'PO-002', supplier: 's2', supplier_name: 'Fornecedor B', branch: 'b2', branch_name: 'Shopping', status: 'approved', total: '2500.00', items: [], created_at: '2026-07-02T00:00:00Z', created_by_name: 'Admin' },
  ],
}

const PURCHASE_ORDER_DETAIL = {
  id: 'po1',
  number: 'PO-001',
  supplier: 's1',
  supplier_name: 'Fornecedor A',
  branch: 'b1',
  branch_name: 'Centro',
  status: 'draft',
  total: '1500.00',
  items: [
    { id: 'item1', product: 'prod-1', product_name: 'Produto 1', quantity: '10', unit_price: '100.00', total: '1000.00' },
    { id: 'item2', product: 'prod-2', product_name: 'Produto 2', quantity: '5', unit_price: '100.00', total: '500.00' },
  ],
  created_at: '2026-07-01T00:00:00Z',
  created_by_name: 'Admin',
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
}

function renderSuppliersPage(initialRoute = '/purchasing/suppliers') {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <AuthContext.Provider value={authValue}>
          <TenantContext.Provider value={tenantValue}>
            <OrganizationContext.Provider value={orgValue}>
              <Routes>
                <Route path="/purchasing/suppliers" element={<SuppliersPage />} />
              </Routes>
            </OrganizationContext.Provider>
          </TenantContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function renderPurchaseOrdersPage() {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/purchasing/orders']}>
        <AuthContext.Provider value={authValue}>
          <TenantContext.Provider value={tenantValue}>
            <OrganizationContext.Provider value={orgValue}>
              <Routes>
                <Route path="/purchasing/orders" element={<PurchaseOrdersPage />} />
              </Routes>
            </OrganizationContext.Provider>
          </TenantContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function renderPurchaseOrderEditor() {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/purchasing/orders/new']}>
        <AuthContext.Provider value={authValue}>
          <TenantContext.Provider value={tenantValue}>
            <OrganizationContext.Provider value={orgValue}>
              <Routes>
                <Route path="/purchasing/orders/new" element={<PurchaseOrderEditor />} />
              </Routes>
            </OrganizationContext.Provider>
          </TenantContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function renderPurchaseOrderDetailPage(orderId = 'po1') {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/purchasing/orders/${orderId}`]}>
        <AuthContext.Provider value={authValue}>
          <TenantContext.Provider value={tenantValue}>
            <OrganizationContext.Provider value={orgValue}>
              <Routes>
                <Route path="/purchasing/orders/:id" element={<PurchaseOrderDetailPage />} />
              </Routes>
            </OrganizationContext.Provider>
          </TenantContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  server.use(
    http.get(`${BASE}/purchasing/suppliers/`, ({ request }) => {
      const url = new URL(request.url)
      const q = url.searchParams.get('q')
      if (q) {
        const filtered = SUPPLIERS_PAGE_1.results.filter(
          (s) => s.name.toLowerCase().includes(q.toLowerCase()) || s.cnpj.includes(q),
        )
        return HttpResponse.json({ count: filtered.length, next: null, previous: null, results: filtered })
      }
      return HttpResponse.json(SUPPLIERS_PAGE_1)
    }),
    http.post(`${BASE}/purchasing/suppliers/`, async ({ request }) => {
      const body = await request.json() as { name?: string }
      if (!body.name) {
        return HttpResponse.json(
          { type: 'about:blank', title: 'Validation Error', status: 422, detail: 'Invalid input', errors: { name: ['Este campo é obrigatório.'] } },
          { status: 422 },
        )
      }
      if (body.name === 'Duplicado') {
        return HttpResponse.json(
          { type: 'about:blank', title: 'Conflict', status: 409, detail: 'Já existe um fornecedor com este nome.', code: 'unique_violation' },
          { status: 409 },
        )
      }
      return HttpResponse.json(
        { id: 's-new', name: body.name, cnpj: '', ie: '', is_active: true, created_at: '2026-07-01T00:00:00Z' },
        { status: 201 },
      )
    }),
    http.patch(`${BASE}/purchasing/suppliers/:id/`, async ({ request, params }) => {
      const body = await request.json() as { name?: string }
      if (!body.name) {
        return HttpResponse.json(
          { type: 'about:blank', title: 'Validation Error', status: 422, detail: 'Invalid input', errors: { name: ['Este campo é obrigatório.'] } },
          { status: 422 },
        )
      }
      return HttpResponse.json(
        { id: params.id, ...body, cnpj: '', ie: '', is_active: true, created_at: '2026-01-01T00:00:00Z' },
      )
    }),
    http.get(`${BASE}/purchasing/orders/`, ({ request }) => {
      const url = new URL(request.url)
      const status = url.searchParams.get('status')
      let results = PURCHASE_ORDERS.results
      if (status) {
        results = results.filter((o) => o.status === status)
      }
      return HttpResponse.json({ count: results.length, next: null, previous: null, results })
    }),
    http.post(`${BASE}/purchasing/orders/`, async ({ request }) => {
      const body = await request.json() as { supplier?: string; branch?: string; items?: unknown[] }
      if (!body.supplier || !body.branch || !body.items || body.items.length === 0) {
        return HttpResponse.json(
          { type: 'about:blank', title: 'Validation Error', status: 422, detail: 'Invalid input', errors: { supplier: !body.supplier ? ['Este campo é obrigatório.'] : undefined } },
          { status: 422 },
        )
      }
      return HttpResponse.json(
        {
          id: 'po-new',
          number: 'PO-003',
          supplier: body.supplier,
          supplier_name: 'Fornecedor A',
          branch: body.branch,
          branch_name: 'Centro',
          status: 'draft',
          total: '1000.00',
          items: (body.items as { product: string; quantity: string; unit_price: string }[]).map((item, i) => ({
            id: `item-new-${i}`,
            product: item.product,
            product_name: 'Produto Teste',
            quantity: item.quantity,
            unit_price: item.unit_price,
            total: (parseFloat(item.quantity) * parseFloat(item.unit_price)).toFixed(2),
          })),
          created_at: '2026-07-22T00:00:00Z',
          created_by_name: 'Admin',
        },
        { status: 201 },
      )
    }),
    http.get(`${BASE}/purchasing/orders/po1/`, () =>
      HttpResponse.json(PURCHASE_ORDER_DETAIL),
    ),
    http.post(`${BASE}/purchasing/orders/po1/approve/`, () =>
      HttpResponse.json({ ...PURCHASE_ORDER_DETAIL, status: 'approved' }),
    ),
    http.get(`${BASE}/branches/`, () =>
      HttpResponse.json({
        count: 2,
        next: null,
        previous: null,
        results: [
          { id: 'b1', company: 'comp-1', company_name: 'Matriz', name: 'Centro', is_active: true, ie: '', address_json: {}, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
          { id: 'b2', company: 'comp-1', company_name: 'Matriz', name: 'Shopping', is_active: true, ie: '', address_json: {}, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
        ],
      }),
    ),
    http.get(`${BASE}/companies/`, () =>
      HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
    ),
  )
})

describe('SuppliersPage', () => {
  it('shows loading state initially', () => {
    server.use(
      http.get(`${BASE}/purchasing/suppliers/`, () => new Promise(() => {})),
    )
    renderSuppliersPage()
    expect(screen.getByTestId('loading-state')).toBeInTheDocument()
  })

  it('displays supplier list', async () => {
    renderSuppliersPage()
    await waitFor(() => {
      expect(screen.getByText('Fornecedor A')).toBeInTheDocument()
    })
    expect(screen.getByText('Fornecedor B')).toBeInTheDocument()
    expect(screen.getByText('11.222.333/0001-44')).toBeInTheDocument()
  })

  it('filters suppliers by search query', async () => {
    renderSuppliersPage()
    await waitFor(() => {
      expect(screen.getByText('Fornecedor A')).toBeInTheDocument()
    })
    const searchInput = screen.getByTestId('search-input')
    fireEvent.change(searchInput, { target: { value: 'Fornecedor A' } })
    await waitFor(() => {
      expect(screen.queryByText('Fornecedor B')).not.toBeInTheDocument()
    })
  })

  it('shows empty state when no suppliers', async () => {
    server.use(
      http.get(`${BASE}/purchasing/suppliers/`, () =>
        HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
      ),
    )
    renderSuppliersPage()
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })
  })

  it('creates a new supplier via form', async () => {
    renderSuppliersPage()
    const user = userEvent.setup()
    await waitFor(() => {
      expect(screen.getByText('Fornecedor A')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /novo fornecedor/i }))
    expect(screen.getByTestId('supplier-form')).toBeInTheDocument()
    await user.type(screen.getByLabelText(/nome/i), 'Fornecedor Novo')
    await user.click(screen.getByRole('button', { name: /salvar/i }))
    await waitFor(() => {
      expect(screen.queryByTestId('supplier-form')).not.toBeInTheDocument()
    })
  })

  it('shows validation error for empty name', async () => {
    renderSuppliersPage()
    const user = userEvent.setup()
    await waitFor(() => {
      expect(screen.getByText('Fornecedor A')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /novo fornecedor/i }))
    await user.click(screen.getByRole('button', { name: /salvar/i }))
    await waitFor(() => {
      expect(screen.getByText(/Nome é obrigatório/i)).toBeInTheDocument()
    })
  })

  it('shows error on 409 conflict', async () => {
    renderSuppliersPage()
    const user = userEvent.setup()
    await waitFor(() => {
      expect(screen.getByText('Fornecedor A')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /novo fornecedor/i }))
    await user.type(screen.getByLabelText(/nome/i), 'Duplicado')
    await user.click(screen.getByRole('button', { name: /salvar/i }))
    await waitFor(() => {
      expect(screen.getByTestId('form-error')).toHaveTextContent(/já existe/i)
    })
  })

  it('edits a supplier name', async () => {
    renderSuppliersPage()
    const user = userEvent.setup()
    await waitFor(() => {
      expect(screen.getByText('Fornecedor A')).toBeInTheDocument()
    })
    const editButtons = screen.getAllByRole('button', { name: /editar/i })
    await user.click(editButtons[0])
    expect(screen.getByTestId('supplier-form')).toBeInTheDocument()
    const nameInput = screen.getByLabelText(/nome/i)
    await user.clear(nameInput)
    await user.type(nameInput, 'Fornecedor A Editado')
    await user.click(screen.getByRole('button', { name: /salvar/i }))
    await waitFor(() => {
      expect(screen.queryByTestId('supplier-form')).not.toBeInTheDocument()
    })
  })
})

describe('PurchaseOrdersPage', () => {
  it('displays purchase order list', async () => {
    renderPurchaseOrdersPage()
    await waitFor(() => {
      expect(screen.getByText('PO-001')).toBeInTheDocument()
    })
    expect(screen.getByText('PO-002')).toBeInTheDocument()
  })

  it('filters by status', async () => {
    renderPurchaseOrdersPage()
    await waitFor(() => {
      expect(screen.getByText('PO-001')).toBeInTheDocument()
    })
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText(/status/i), 'approved')
    await waitFor(() => {
      expect(screen.queryByText('PO-001')).not.toBeInTheDocument()
    })
    expect(screen.getByText('PO-002')).toBeInTheDocument()
  })

  it('shows empty state when no orders', async () => {
    server.use(
      http.get(`${BASE}/purchasing/orders/`, () =>
        HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
      ),
    )
    renderPurchaseOrdersPage()
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })
  })
})

describe('PurchaseOrderEditor', () => {
  it('creates an order with items', async () => {
    renderPurchaseOrderEditor()
    const user = userEvent.setup()
    await waitFor(() => {
      expect(screen.getByTestId('purchase-order-editor')).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Fornecedor A' })).toBeInTheDocument()
    })
    await user.selectOptions(screen.getByLabelText(/fornecedor/i), 's1')
    await user.selectOptions(screen.getByLabelText(/filial/i), 'b1')
    const addItemBtn = screen.getByRole('button', { name: /adicionar item/i })
    await user.click(addItemBtn)
    const productInputs = screen.getAllByLabelText(/produto/i)
    const quantityInputs = screen.getAllByLabelText(/quantidade/i)
    const priceInputs = screen.getAllByLabelText(/preço/i)
    await user.type(productInputs[0], 'prod-1')
    await user.type(quantityInputs[0], '10')
    await user.type(priceInputs[0], '100.00')
    await user.click(screen.getByRole('button', { name: /salvar/i }))
    await waitFor(() => {
      expect(screen.getByText(/ordem criada/i)).toBeInTheDocument()
    })
  })

  it('shows validation error when items are empty', async () => {
    renderPurchaseOrderEditor()
    const user = userEvent.setup()
    await waitFor(() => {
      expect(screen.getByTestId('purchase-order-editor')).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /salvar/i }))
    await waitFor(() => {
      expect(screen.getByText(/Adicione pelo menos um item/i)).toBeInTheDocument()
    })
  })
})

describe('PurchaseOrderDetailPage', () => {
  it('displays order details and items', async () => {
    renderPurchaseOrderDetailPage()
    await waitFor(() => {
      expect(screen.getByText(/PO-001/)).toBeInTheDocument()
    })
    expect(screen.getByText('Fornecedor A')).toBeInTheDocument()
    expect(screen.getByText('Centro')).toBeInTheDocument()
    expect(screen.getByText('Produto 1')).toBeInTheDocument()
    expect(screen.getByText('Produto 2')).toBeInTheDocument()
  })

  it('shows draft status badge', async () => {
    renderPurchaseOrderDetailPage()
    await waitFor(() => {
      expect(screen.getByText('Rascunho')).toBeInTheDocument()
    })
  })

  it('shows approve button for draft orders', async () => {
    renderPurchaseOrderDetailPage()
    await waitFor(() => {
      expect(screen.getByText(/PO-001/)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /aprovar/i })).toBeInTheDocument()
  })

  it('approves and navigates to detail page', async () => {
    let approved = false
    server.use(
      http.post(`${BASE}/purchasing/orders/po1/approve/`, () => {
        approved = true
        return HttpResponse.json({ ...PURCHASE_ORDER_DETAIL, status: 'approved' })
      }),
    )
    renderPurchaseOrderDetailPage('po1')
    const user = userEvent.setup()
    await waitFor(() => {
      expect(screen.getByText(/PO-001/)).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /aprovar/i }))
    await waitFor(() => {
      expect(approved).toBe(true)
    })
  })

  it('shows 422 validation error', async () => {
    server.use(
      http.post(`${BASE}/purchasing/orders/`, async ({ request }) => {
        const body = await request.json() as { items?: unknown[] }
        if (!body.items || body.items.length === 0) {
          return HttpResponse.json(
            { type: 'about:blank', title: 'Validation Error', status: 422, detail: 'Invalid input', code: 'validation_error' },
            { status: 422 },
          )
        }
        return HttpResponse.json({}, { status: 201 })
      }),
    )
    renderPurchaseOrderEditor()
    const user = userEvent.setup()
    await waitFor(() => {
      expect(screen.getByTestId('purchase-order-editor')).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Fornecedor A' })).toBeInTheDocument()
    })
    await user.selectOptions(screen.getByLabelText(/fornecedor/i), 's1')
    await user.selectOptions(screen.getByLabelText(/filial/i), 'b1')
    await user.click(screen.getByRole('button', { name: /salvar/i }))
    await waitFor(() => {
      expect(screen.getByText(/Adicione pelo menos um item/i)).toBeInTheDocument()
    })
  })
})
