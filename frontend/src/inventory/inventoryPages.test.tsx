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

import BalancesPage from './BalancesPage'
import MovementsPage from './MovementsPage'
import ReceiptForm from './ReceiptForm'
import TransferForm from './TransferForm'
import AdjustmentForm from './AdjustmentForm'
import LotsPage from './LotsPage'

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

const MOVEMENTS_DATA = {
  count: 2,
  next: null,
  previous: null,
  results: [
    { id: 'mov-1', product: 'prod-1', product_name: 'Parafuso', branch: 'branch-1', branch_name: 'Centro', type: 'in', quantity: '100.00', reason: 'Compra', reference_id: null, created_at: '2026-07-22T10:00:00Z', created_by_name: 'Admin' },
    { id: 'mov-2', product: 'prod-2', product_name: 'Porca', branch: 'branch-2', branch_name: 'Shopping', type: 'out', quantity: '-10.00', reason: 'Venda', reference_id: null, created_at: '2026-07-22T09:00:00Z', created_by_name: 'Operador' },
  ],
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
}

function renderWithProviders(ui: React.ReactElement, initialRoute = '/inventory') {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <AuthContext.Provider value={authValue}>
          <TenantContext.Provider value={tenantValue}>
            <Routes>
              <Route path="/inventory" element={ui} />
              <Route path="/inventory/balances" element={<BalancesPage />} />
              <Route path="/inventory/movements" element={<MovementsPage />} />
              <Route path="/inventory/receipt" element={<ReceiptForm />} />
              <Route path="/inventory/transfer" element={<TransferForm />} />
              <Route path="/inventory/adjustment" element={<AdjustmentForm />} />
              <Route path="/inventory/lots" element={<LotsPage />} />
            </Routes>
          </TenantContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('BalancesPage', () => {
  it('shows loading state initially', () => {
    server.use(
      http.get(`${BASE}/inventory/balances/`, () => new Promise(() => {})),
      http.get(`${BASE}/branches/`, () => new Promise(() => {})),
    )
    renderWithProviders(<BalancesPage />, '/inventory/balances')
    expect(screen.getByTestId('loading-state')).toBeInTheDocument()
  })

  it('displays balance list', async () => {
    renderWithProviders(<BalancesPage />, '/inventory/balances')
    await waitFor(() => {
      expect(screen.getByText('Parafuso')).toBeInTheDocument()
    })
    expect(screen.getByText('Porca')).toBeInTheDocument()
    expect(screen.getByText('PRF-001')).toBeInTheDocument()
  })

  it('shows empty state when no balances', async () => {
    server.use(
      http.get(`${BASE}/inventory/balances/`, () =>
        HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
      ),
    )
    renderWithProviders(<BalancesPage />, '/inventory/balances')
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })
  })

  it('filters by branch and product', async () => {
    renderWithProviders(<BalancesPage />, '/inventory/balances')
    await waitFor(() => {
      expect(screen.getByText('Parafuso')).toBeInTheDocument()
    })
    expect(screen.getByTestId('balances-filters')).toBeInTheDocument()
    const branchSelect = screen.getByLabelText('Filtrar por filial')
    expect(branchSelect).toBeInTheDocument()
    const productInput = screen.getByLabelText('Buscar produto')
    expect(productInput).toBeInTheDocument()
  })
})

describe('MovementsPage', () => {
  it('displays movement list', async () => {
    renderWithProviders(<MovementsPage />, '/inventory/movements')
    await waitFor(() => {
      expect(screen.getByText('Parafuso')).toBeInTheDocument()
    })
    expect(screen.getByText('Porca')).toBeInTheDocument()
  })

  it('filters by date range inputs', async () => {
    renderWithProviders(<MovementsPage />, '/inventory/movements')
    await waitFor(() => {
      expect(screen.getByTestId('movements-filters')).toBeInTheDocument()
    })
    expect(screen.getByLabelText('Data inicial')).toBeInTheDocument()
    expect(screen.getByLabelText('Data final')).toBeInTheDocument()
  })

  it('filters by type select', async () => {
    server.use(
      http.get(`${BASE}/inventory/movements/`, ({ request }) => {
        const url = new URL(request.url)
        const type = url.searchParams.get('type')
        if (type === 'in') {
          return HttpResponse.json({
            count: 1,
            next: null,
            previous: null,
            results: [MOVEMENTS_DATA.results[0]],
          })
        }
        return HttpResponse.json(MOVEMENTS_DATA)
      }),
    )
    renderWithProviders(<MovementsPage />, '/inventory/movements')
    await waitFor(() => {
      expect(screen.getByText('Parafuso')).toBeInTheDocument()
    })
    const typeSelect = screen.getByLabelText('Filtrar por tipo')
    await userEvent.setup().selectOptions(typeSelect, 'in')
    await waitFor(() => {
      expect(screen.getByTestId('movement-type-badge')).toHaveTextContent('Entrada')
    })
  })

  it('shows type badge with color', async () => {
    renderWithProviders(<MovementsPage />, '/inventory/movements')
    await waitFor(() => {
      const badges = screen.getAllByTestId('movement-type-badge')
      expect(badges[0]).toHaveTextContent('Entrada')
      expect(badges[1]).toHaveTextContent('Saída')
    })
  })
})

describe('ReceiptForm', () => {
  it('creates a movement on submit', async () => {
    let capturedBody: unknown
    server.use(
      http.post(`${BASE}/inventory/movements/`, async ({ request }) => {
        capturedBody = await request.json()
        return HttpResponse.json(
          { ...MOVEMENTS_DATA.results[0], id: 'mov-new', type: 'in' },
          { status: 201 },
        )
      }),
    )
    renderWithProviders(<ReceiptForm />, '/inventory/receipt')
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Produto'), 'prod-1')
    await user.selectOptions(screen.getByLabelText('Filial'), 'branch-1')
    await user.type(screen.getByLabelText('Localização'), 'loc-a')
    await user.type(screen.getByLabelText('Quantidade'), '50')
    await user.click(screen.getByRole('button', { name: /registrar entrada/i }))

    await waitFor(() => {
      expect(capturedBody).toBeTruthy()
    })
    const body = capturedBody as Record<string, unknown>
    expect(body.product).toBe('prod-1')
    expect(body.quantity).toBe('50')
  })

  it('shows validation errors for empty fields', async () => {
    renderWithProviders(<ReceiptForm />, '/inventory/receipt')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /registrar entrada/i }))
    await waitFor(() => {
      expect(screen.getByText('Produto é obrigatório')).toBeInTheDocument()
    })
  })

  it('sends Idempotency-Key header', async () => {
    let capturedHeaders: Record<string, string> = {}
    server.use(
      http.post(`${BASE}/inventory/movements/`, async ({ request }) => {
        request.headers.forEach((value, key) => {
          capturedHeaders[key] = value
        })
        return HttpResponse.json(
          { ...MOVEMENTS_DATA.results[0], id: 'mov-new', type: 'in' },
          { status: 201 },
        )
      }),
    )
    renderWithProviders(<ReceiptForm />, '/inventory/receipt')
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Produto'), 'prod-1')
    await user.selectOptions(screen.getByLabelText('Filial'), 'branch-1')
    await user.type(screen.getByLabelText('Localização'), 'loc-a')
    await user.type(screen.getByLabelText('Quantidade'), '50')
    await user.click(screen.getByRole('button', { name: /registrar entrada/i }))

    await waitFor(() => {
      expect(capturedHeaders['idempotency-key']).toBeTruthy()
    })
  })
})

describe('TransferForm', () => {
  it('creates a transfer on submit', async () => {
    let capturedBody: unknown
    server.use(
      http.post(`${BASE}/inventory/movements/`, async ({ request }) => {
        capturedBody = await request.json()
        return HttpResponse.json(
          { ...MOVEMENTS_DATA.results[0], id: 'mov-trf', type: 'transfer' },
          { status: 201 },
        )
      }),
    )
    renderWithProviders(<TransferForm />, '/inventory/transfer')
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Produto'), 'prod-1')
    await user.selectOptions(screen.getByLabelText('Filial Origem'), 'branch-1')
    await user.selectOptions(screen.getByLabelText('Filial Destino'), 'branch-2')
    await user.type(screen.getByLabelText('Quantidade'), '30')
    await user.type(screen.getByLabelText('Motivo'), 'Transferência entre filiais')
    await user.click(screen.getByRole('button', { name: /realizar transferência/i }))

    await waitFor(() => {
      expect(capturedBody).toBeTruthy()
    })
    const body = capturedBody as Record<string, unknown>
    expect(body.product).toBe('prod-1')
    expect(body.source_branch).toBe('branch-1')
    expect(body.destination_branch).toBe('branch-2')
    expect(body.quantity).toBe('30')
    expect(body.reason).toBe('Transferência entre filiais')
  })

  it('shows validation errors for empty fields', async () => {
    renderWithProviders(<TransferForm />, '/inventory/transfer')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /realizar transferência/i }))
    await waitFor(() => {
      expect(screen.getByText('Produto é obrigatório')).toBeInTheDocument()
    })
  })
})

describe('AdjustmentForm', () => {
  it('creates an adjustment on submit', async () => {
    let capturedBody: unknown
    server.use(
      http.post(`${BASE}/inventory/movements/`, async ({ request }) => {
        capturedBody = await request.json()
        return HttpResponse.json(
          { ...MOVEMENTS_DATA.results[0], id: 'mov-adj', type: 'adjust' },
          { status: 201 },
        )
      }),
    )
    renderWithProviders(<AdjustmentForm />, '/inventory/adjustment')
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Produto'), 'prod-1')
    await user.selectOptions(screen.getByLabelText('Filial'), 'branch-1')
    await user.type(screen.getByLabelText('Localização'), 'loc-a')
    await user.type(screen.getByLabelText('Quantidade'), '-5')
    await user.type(screen.getByLabelText('Motivo'), 'Ajuste manual')
    await user.click(screen.getByRole('button', { name: /realizar ajuste/i }))

    await waitFor(() => {
      expect(capturedBody).toBeTruthy()
    })
    const body = capturedBody as Record<string, unknown>
    expect(body.product).toBe('prod-1')
    expect(body.quantity).toBe('-5')
    expect(body.reason).toBe('Ajuste manual')
  })

  it('requires reason field', async () => {
    renderWithProviders(<AdjustmentForm />, '/inventory/adjustment')
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Produto'), 'prod-1')
    await user.selectOptions(screen.getByLabelText('Filial'), 'branch-1')
    await user.type(screen.getByLabelText('Localização'), 'loc-a')
    await user.type(screen.getByLabelText('Quantidade'), '10')
    await user.click(screen.getByRole('button', { name: /realizar ajuste/i }))

    await waitFor(() => {
      expect(screen.getByText('Motivo é obrigatório')).toBeInTheDocument()
    })
  })

  it('allows negative quantity for write-offs', async () => {
    renderWithProviders(<AdjustmentForm />, '/inventory/adjustment')
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Produto'), 'prod-1')
    await user.selectOptions(screen.getByLabelText('Filial'), 'branch-1')
    await user.type(screen.getByLabelText('Localização'), 'loc-a')
    await user.type(screen.getByLabelText('Quantidade'), '-5')
    await user.type(screen.getByLabelText('Motivo'), 'Perda')
    await user.click(screen.getByRole('button', { name: /realizar ajuste/i }))

    await waitFor(() => {
      expect(screen.queryByText(/Quantidade deve ser um número decimal/)).not.toBeInTheDocument()
    })
  })
})

describe('LotsPage', () => {
  it('displays lot list', async () => {
    renderWithProviders(<LotsPage />, '/inventory/lots')
    await waitFor(() => {
      expect(screen.getByText('Parafuso')).toBeInTheDocument()
    })
    expect(screen.getByText('LOT-001')).toBeInTheDocument()
    expect(screen.getByText('LOT-002')).toBeInTheDocument()
  })

  it('shows empty state when no lots', async () => {
    server.use(
      http.get(`${BASE}/inventory/lots/`, () =>
        HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
      ),
    )
    renderWithProviders(<LotsPage />, '/inventory/lots')
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })
  })
})
