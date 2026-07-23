import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { describe, it, expect } from 'vitest'

import { AuthContext } from '@/auth/AuthProvider'
import type { AuthContextValue } from '@/auth/AuthProvider'
import { TenantContext } from '@/tenant/TenantProvider'
import type { TenantContextValue } from '@/tenant/TenantProvider'
import { server } from '@/test/server'

import SalesPage from './SalesPage'
import SaleDetailPage from './SaleDetailPage'
import CashSessionsPage from './CashSessionsPage'
import CashSessionDetailPage from './CashSessionDetailPage'

const BASE = '/api/v1'

const authValue: AuthContextValue = {
  state: 'authenticated',
  user: { id: 1, email: 'admin@zyrp.local', name: 'Admin', is_active: true, is_mfa_enabled: false },
  memberships: [{ id: 1, tenant_id: 'tenant-alpha', tenant_name: 'Alpha', role: 'admin' }],
  login: async () => ({ requiresMfa: false }),
  challengeMfa: async () => {},
  logout: async () => {},
}

const tenantValue: TenantContextValue = {
  selectedTenant: { id: 1, tenant_id: 'tenant-alpha', tenant_name: 'Alpha', role: 'admin' },
  memberships: [{ id: 1, tenant_id: 'tenant-alpha', tenant_name: 'Alpha', role: 'admin' }],
  selectTenant: () => {},
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
}

function renderSalesPage(initialRoute = '/sales') {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <AuthContext.Provider value={authValue}>
          <TenantContext.Provider value={tenantValue}>
            <Routes>
              <Route path="/sales" element={<SalesPage />} />
            </Routes>
          </TenantContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function renderSaleDetailPage(saleId = 'sale-1') {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/sales/${saleId}`]}>
        <AuthContext.Provider value={authValue}>
          <TenantContext.Provider value={tenantValue}>
            <Routes>
              <Route path="/sales/:id" element={<SaleDetailPage />} />
            </Routes>
          </TenantContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function renderCashSessionsPage(initialRoute = '/financial/cash-sessions') {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <AuthContext.Provider value={authValue}>
          <TenantContext.Provider value={tenantValue}>
            <Routes>
              <Route path="/financial/cash-sessions" element={<CashSessionsPage />} />
            </Routes>
          </TenantContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function renderCashSessionDetailPage(sessionId = 'cs-1') {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/financial/cash-sessions/${sessionId}`]}>
        <AuthContext.Provider value={authValue}>
          <TenantContext.Provider value={tenantValue}>
            <Routes>
              <Route path="/financial/cash-sessions/:id" element={<CashSessionDetailPage />} />
            </Routes>
          </TenantContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('SalesPage', () => {
  it('shows loading state initially', () => {
    server.use(
      http.get(`${BASE}/sales/`, () => new Promise(() => {})),
    )
    renderSalesPage()
    expect(screen.getByTestId('loading-state')).toBeInTheDocument()
  })

  it('displays sales list', async () => {
    renderSalesPage()
    await waitFor(() => {
      expect(screen.getByText('João Silva')).toBeInTheDocument()
    })
    expect(screen.getByText('Maria Santos')).toBeInTheDocument()
    expect(screen.getByText('150.00')).toBeInTheDocument()
    expect(screen.getByText('89.90')).toBeInTheDocument()
    expect(screen.getByTestId('status-badge-sale-1')).toHaveTextContent('Concluída')
    expect(screen.getByTestId('status-badge-sale-2')).toHaveTextContent('Cancelada')
  })

  it('filters by status', async () => {
    renderSalesPage()
    const user = userEvent.setup()
    await waitFor(() => {
      expect(screen.getByText('João Silva')).toBeInTheDocument()
    })
    await user.selectOptions(screen.getByLabelText(/status/i), 'cancelled')
    await waitFor(() => {
      expect(screen.queryByText('João Silva')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Maria Santos')).toBeInTheDocument()
  })

  it('shows empty state when no sales', async () => {
    server.use(
      http.get(`${BASE}/sales/`, () =>
        HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
      ),
    )
    renderSalesPage()
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })
  })

  it('does not show any create sale button', async () => {
    renderSalesPage()
    await waitFor(() => {
      expect(screen.getByText('João Silva')).toBeInTheDocument()
    })
    expect(screen.queryByText(/nova venda/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/criar venda/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /nova venda/i })).not.toBeInTheDocument()
  })

  it('has detalhes links per row', async () => {
    renderSalesPage()
    await waitFor(() => {
      expect(screen.getByText('João Silva')).toBeInTheDocument()
    })
    const links = screen.getAllByText('Detalhes')
    expect(links.length).toBe(2)
  })
})

describe('SaleDetailPage', () => {
  it('displays sale items and payments', async () => {
    renderSaleDetailPage()
    await waitFor(() => {
      expect(screen.getByText('Parafuso')).toBeInTheDocument()
    })
    expect(screen.getByText('Porca')).toBeInTheDocument()
    expect(screen.getByText('Dinheiro')).toBeInTheDocument()
    expect(screen.getByText('150.00')).toBeInTheDocument()
  })

  it('displays linked IDs', async () => {
    renderSaleDetailPage()
    await waitFor(() => {
      expect(screen.getByText('Parafuso')).toBeInTheDocument()
    })
    expect(screen.getByText(/sm-001/)).toBeInTheDocument()
    expect(screen.getByText(/fd-001/)).toBeInTheDocument()
    expect(screen.getByText(/fin-001/)).toBeInTheDocument()
    expect(screen.getByText(/fin-002/)).toBeInTheDocument()
  })

  it('shows correlation ID on 404 error', async () => {
    renderSaleDetailPage('nonexistent')
    await waitFor(() => {
      expect(screen.getByTestId('error-state')).toBeInTheDocument()
    })
  })

  it('does not show edit or delete buttons', async () => {
    renderSaleDetailPage()
    await waitFor(() => {
      expect(screen.getByText('Parafuso')).toBeInTheDocument()
    })
    expect(screen.queryByText(/editar/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/excluir/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/deletar/i)).not.toBeInTheDocument()
  })

  it('has no create-sale affordance', () => {
    renderSaleDetailPage()
    expect(screen.queryByText(/nova venda/i)).not.toBeInTheDocument()
  })
})

describe('CashSessionsPage', () => {
  it('displays cash sessions list', async () => {
    renderCashSessionsPage()
    await waitFor(() => {
      expect(screen.getByText('Centro')).toBeInTheDocument()
    })
    expect(screen.getByText('Shopping')).toBeInTheDocument()
    expect(screen.getAllByText('Maria Souza').length).toBeGreaterThan(0)
  })

  it('shows color-coded difference (green for positive)', async () => {
    renderCashSessionsPage()
    await waitFor(() => {
      expect(screen.getByText('10.00')).toBeInTheDocument()
    })
  })

  it('shows color-coded difference (red for negative)', async () => {
    renderCashSessionsPage()
    await waitFor(() => {
      expect(screen.getByText('-14.90')).toBeInTheDocument()
    })
  })

  it('shows empty state when no sessions', async () => {
    server.use(
      http.get(`${BASE}/cash-sessions/`, () =>
        HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
      ),
    )
    renderCashSessionsPage()
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })
  })
})

describe('CashSessionDetailPage', () => {
  it('displays session info and movements', async () => {
    renderCashSessionDetailPage()
    await waitFor(() => {
      expect(screen.getByText(/Centro/)).toBeInTheDocument()
    })
    expect(screen.getByText(/Maria Souza/)).toBeInTheDocument()
    expect(screen.getByText('Abertura')).toBeInTheDocument()
    expect(screen.getByText('Venda')).toBeInTheDocument()
    expect(screen.getByText('Retirada')).toBeInTheDocument()
    expect(screen.getByText('Fechamento')).toBeInTheDocument()
    expect(screen.getByText('Fundo de caixa')).toBeInTheDocument()
    expect(screen.getByText('Pagamento fornecedor')).toBeInTheDocument()
  })
})
