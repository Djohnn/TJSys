import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { describe, it, expect } from 'vitest'

import { AuthContext } from '@/auth/AuthProvider'
import type { AuthContextValue } from '@/auth/AuthProvider'
import { TenantContext } from '@/tenant/TenantProvider'
import { server } from '@/test/server'

import PurchaseReceiptPage from './PurchaseReceiptPage'
import ReceiptForm from './ReceiptForm'
import ReceiptDetailPage from './ReceiptDetailPage'
import SupplierReturnPage from './SupplierReturnPage'
import RecurringTemplatesPage from './RecurringTemplatesPage'

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

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
}

function renderWithProviders(
  element: React.ReactElement,
  initialRoute = '/',
) {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <AuthContext.Provider value={authValue}>
          <TenantContext.Provider value={tenantValue}>
            {element}
          </TenantContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('PurchaseReceiptPage', () => {
  it('shows loading state initially', () => {
    server.use(
      http.get(`${BASE}/purchasing/receipts/`, () => new Promise(() => {})),
    )
    renderWithProviders(<PurchaseReceiptPage />)
    expect(screen.getByTestId('loading-state')).toBeInTheDocument()
  })

  it('displays receipt list', async () => {
    renderWithProviders(<PurchaseReceiptPage />)
    await waitFor(() => {
      expect(screen.getByText('PO-001')).toBeInTheDocument()
    })
    expect(screen.getByText('PO-002')).toBeInTheDocument()
    expect(screen.getByText('PO-003')).toBeInTheDocument()
  })

  it('filters by order UUID', async () => {
    server.use(
      http.get(`${BASE}/purchasing/receipts/`, ({ request }) => {
        const url = new URL(request.url)
        const order = url.searchParams.get('order')
        if (order === 'order-1') {
          return HttpResponse.json({
            count: 1,
            next: null,
            previous: null,
            results: [{
              id: 'receipt-1',
              order: 'order-1',
              order_number: 'PO-001',
              supplier_name: 'Fornecedor A',
              branch_name: 'Centro',
              status: 'completed',
              items: [],
              created_at: '2026-07-20T10:00:00Z',
              created_by_name: 'Admin',
              linked_stock_movement: null,
              linked_payable: null,
              linked_fiscal_document: null,
            }],
          })
        }
        return HttpResponse.json({ count: 0, next: null, previous: null, results: [] })
      }),
    )
    renderWithProviders(<PurchaseReceiptPage />, '/?order=order-1')
    await waitFor(() => {
      expect(screen.getByText('PO-001')).toBeInTheDocument()
    })
    expect(screen.queryByText('PO-002')).not.toBeInTheDocument()
  })

  it('shows empty state when no receipts', async () => {
    server.use(
      http.get(`${BASE}/purchasing/receipts/`, () =>
        HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
      ),
    )
    renderWithProviders(<PurchaseReceiptPage />)
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })
  })
})

describe('ReceiptForm', () => {
  it('loads order items and allows entering quantities', async () => {
    renderWithProviders(<ReceiptForm />)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('receipt-form')).toBeInTheDocument()
    })

    const orderSelect = screen.getByLabelText(/pedido/i)
    await user.selectOptions(orderSelect, 'order-1')

    await waitFor(() => {
      expect(screen.getByText('Produto A')).toBeInTheDocument()
    })
    expect(screen.getByText('Produto B')).toBeInTheDocument()

    const qtyInputs = screen.getAllByTestId(/^received-qty-/)
    expect(qtyInputs).toHaveLength(2)
  })

  it('prevents receiving more than ordered quantity', async () => {
    renderWithProviders(<ReceiptForm />)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('receipt-form')).toBeInTheDocument()
    })

    const orderSelect = screen.getByLabelText(/pedido/i)
    await user.selectOptions(orderSelect, 'order-1')

    await waitFor(() => {
      expect(screen.getByText('Produto A')).toBeInTheDocument()
    })

    const qtyInput = screen.getByTestId('received-qty-item-1')
    await user.clear(qtyInput)
    await user.type(qtyInput, '15')

    const submitBtn = screen.getByRole('button', { name: /criar recebimento/i })
    await user.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByText(/excede a quantidade pedida/i)).toBeInTheDocument()
    })
  })

  it('creates a receipt successfully', async () => {
    renderWithProviders(<ReceiptForm />)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('receipt-form')).toBeInTheDocument()
    })

    const orderSelect = screen.getByLabelText(/pedido/i)
    await user.selectOptions(orderSelect, 'order-1')

    await waitFor(() => {
      expect(screen.getByText('Produto A')).toBeInTheDocument()
    })

    const qtyInput = screen.getByTestId('received-qty-item-1')
    await user.clear(qtyInput)
    await user.type(qtyInput, '5')

    const submitBtn = screen.getByRole('button', { name: /criar recebimento/i })
    await user.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByTestId('receipt-detail')).toBeInTheDocument()
    })
  })
})

describe('ReceiptDetailPage', () => {
  it('displays receipt items and linked IDs', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/purchasing/receipts/:id" element={<ReceiptDetailPage />} />
      </Routes>,
      '/purchasing/receipts/receipt-1',
    )

    await waitFor(() => {
      expect(screen.getByText('Produto A')).toBeInTheDocument()
    })
    expect(screen.getByText('Produto B')).toBeInTheDocument()
    expect(screen.getByText(/sm-001/)).toBeInTheDocument()
    expect(screen.getByText(/pay-001/)).toBeInTheDocument()
    expect(screen.getByText(/fd-001/)).toBeInTheDocument()
  })

  it('shows cancel button for completed receipt', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/purchasing/receipts/:id" element={<ReceiptDetailPage />} />
      </Routes>,
      '/purchasing/receipts/receipt-1',
    )

    await waitFor(() => {
      expect(screen.getByText('Produto A')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /cancelar recebimento/i })).toBeInTheDocument()
  })

  it('cancel action shows confirmation and succeeds', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/purchasing/receipts/:id" element={<ReceiptDetailPage />} />
      </Routes>,
      '/purchasing/receipts/receipt-1',
    )

    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Produto A')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /cancelar recebimento/i }))

    expect(screen.getByTestId('cancel-dialog')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /confirmar cancelamento/i }))

    await waitFor(() => {
      expect(screen.queryByTestId('cancel-dialog')).not.toBeInTheDocument()
    })
  })

  it('shows 409 error on cancel failure', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/purchasing/receipts/:id" element={<ReceiptDetailPage />} />
      </Routes>,
      '/purchasing/receipts/receipt-fail-cancel',
    )

    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('receipt-detail')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /cancelar recebimento/i }))

    expect(screen.getByTestId('cancel-dialog')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /confirmar cancelamento/i }))

    await waitFor(() => {
      expect(screen.getByText(/não pode ser cancelado/i)).toBeInTheDocument()
    })
  })
})

describe('SupplierReturnPage', () => {
  it('displays return list', async () => {
    renderWithProviders(<SupplierReturnPage />)
    await waitFor(() => {
      expect(screen.getByText('Produto com defeito')).toBeInTheDocument()
    })
    expect(screen.getByText('Quantidade excedente')).toBeInTheDocument()
  })

  it('creates a return', async () => {
    renderWithProviders(<SupplierReturnPage />)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Produto com defeito')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /nova devolução/i }))

    expect(screen.getByTestId('return-form')).toBeInTheDocument()

    const orderSelect = screen.getByLabelText(/pedido/i)
    await user.selectOptions(orderSelect, 'order-1')

    const reasonInput = screen.getByLabelText(/motivo/i)
    await user.type(reasonInput, 'Produto danificado')

    const submitBtn = screen.getByRole('button', { name: /criar devolução/i })
    await user.click(submitBtn)

    await waitFor(() => {
      expect(screen.queryByTestId('return-form')).not.toBeInTheDocument()
    })
  })
})

describe('RecurringTemplatesPage', () => {
  it('displays template list', async () => {
    renderWithProviders(<RecurringTemplatesPage />)
    await waitFor(() => {
      expect(screen.getByText('Pedido Semanal Insumos')).toBeInTheDocument()
    })
    expect(screen.getByText('Pedido Mensal Matéria-Prima')).toBeInTheDocument()
  })

  it('shows frequency labels', async () => {
    renderWithProviders(<RecurringTemplatesPage />)
    await waitFor(() => {
      expect(screen.getByText('Semanal')).toBeInTheDocument()
    })
    expect(screen.getByText('Mensal')).toBeInTheDocument()
  })
})