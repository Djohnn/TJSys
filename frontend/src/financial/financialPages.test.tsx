import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { describe, it, expect, beforeEach } from 'vitest'

import { AuthContext } from '@/auth/AuthProvider'
import type { AuthContextValue } from '@/auth/AuthProvider'
import { TenantContext } from '@/tenant/TenantProvider'
import { OrganizationContext } from '@/organization/OrganizationProvider'
import { server } from '@/test/server'

import ReceivablesPage from './ReceivablesPage'
import PayablesPage from './PayablesPage'
import CashflowPage from './CashflowPage'
import SettlementDialog from './SettlementDialog'
import ReportsPage from './ReportsPage'
import type { Payable, Receivable } from './financialApi'

const BASE = '/api/v1'

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

const orgValue = {
  companies: [],
  branches: [],
  currentCompany: null,
  currentBranch: null,
  setCurrentBranch: () => {},
  isLoading: false,
}

const RECEIVABLES_PAGE = {
  count: 3,
  next: null,
  previous: null,
  results: [
    { id: 'rec-1', description: 'Venda #123', due_date: '2026-08-15', amount: '1500.00', paid_amount: '0.00', balance: '1500.00', status: 'pending', branch: 'branch-1', branch_name: 'Centro', account: null, account_name: null, source_operation: '123', source_operation_type: 'Venda', created_at: '2026-07-01T00:00:00Z' },
    { id: 'rec-2', description: 'Serviço Prestado', due_date: '2026-07-10', amount: '3200.00', paid_amount: '3200.00', balance: '0.00', status: 'paid', branch: 'branch-2', branch_name: 'Shopping', account: null, account_name: null, source_operation: null, source_operation_type: null, created_at: '2026-07-01T00:00:00Z' },
    { id: 'rec-3', description: 'Fatura Cliente A', due_date: '2026-06-30', amount: '890.00', paid_amount: '0.00', balance: '890.00', status: 'overdue', branch: null, branch_name: null, account: null, account_name: null, source_operation: null, source_operation_type: null, created_at: '2026-06-01T00:00:00Z' },
  ] as Receivable[],
}

const PAYABLES_PAGE = {
  count: 2,
  next: null,
  previous: null,
  results: [
    { id: 'pay-1', description: 'Aluguel', due_date: '2026-08-01', amount: '4500.00', paid_amount: '0.00', balance: '4500.00', status: 'pending', branch: 'branch-1', branch_name: 'Centro', account: null, account_name: null, source_operation: null, source_operation_type: null, created_at: '2026-07-01T00:00:00Z' },
    { id: 'pay-2', description: 'Energia', due_date: '2026-07-05', amount: '1200.00', paid_amount: '1200.00', balance: '0.00', status: 'paid', branch: 'branch-2', branch_name: 'Shopping', account: null, account_name: null, source_operation: null, source_operation_type: null, created_at: '2026-07-01T00:00:00Z' },
  ] as Payable[],
}

const CASHFLOW_PAGE = {
  count: 3,
  next: null,
  previous: null,
  results: [
    { id: 'cf-1', date: '2026-07-20', description: 'Venda #123', inflow: '1500.00', outflow: null, balance: '1500.00', branch: 'branch-1', branch_name: 'Centro', created_at: '2026-07-20T00:00:00Z' },
    { id: 'cf-2', date: '2026-07-20', description: 'Pagamento Aluguel', inflow: null, outflow: '4500.00', balance: '-3000.00', branch: 'branch-1', branch_name: 'Centro', created_at: '2026-07-20T00:00:00Z' },
    { id: 'cf-3', date: '2026-07-21', description: 'Recebimento Serviço', inflow: '3200.00', outflow: null, balance: '200.00', branch: 'branch-2', branch_name: 'Shopping', created_at: '2026-07-21T00:00:00Z' },
  ],
}

const REPORTS_PAGE = {
  count: 2,
  next: null,
  previous: null,
  results: [
    { id: 'rpt-1', type: 'receivables', format: 'PDF', period_start: '2026-07-01', period_end: '2026-07-31', status: 'completed', file_url: '/media/reports/rpt-1.pdf', created_at: '2026-07-22T00:00:00Z' },
    { id: 'rpt-2', type: 'cashflow', format: 'CSV', period_start: '2026-06-01', period_end: '2026-06-30', status: 'completed', file_url: '/media/reports/rpt-2.csv', created_at: '2026-07-20T00:00:00Z' },
  ],
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
}

function renderWithProviders(ui: React.ReactElement, initialRoute = '/') {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <AuthContext.Provider value={authValue}>
          <TenantContext.Provider value={tenantValue}>
            <OrganizationContext.Provider value={orgValue}>
              <Routes>
                <Route path="/" element={ui} />
                <Route path="/financial/receivables" element={<ReceivablesPage />} />
                <Route path="/financial/payables" element={<PayablesPage />} />
                <Route path="/financial/cashflow" element={<CashflowPage />} />
                <Route path="/financial/reports" element={<ReportsPage />} />
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
    http.get(`${BASE}/financial/receivables/`, () => HttpResponse.json(RECEIVABLES_PAGE)),
    http.get(`${BASE}/financial/payables/`, () => HttpResponse.json(PAYABLES_PAGE)),
    http.get(`${BASE}/financial/cashflow/`, () => HttpResponse.json(CASHFLOW_PAGE)),
    http.get(`${BASE}/financial/reports/`, () => HttpResponse.json(REPORTS_PAGE)),
    http.get(`${BASE}/branches/`, () => HttpResponse.json({ count: 2, next: null, previous: null, results: [
      { id: 'branch-1', company: 'comp-1', company_name: 'Matriz', name: 'Centro', is_active: true, ie: '', address_json: {}, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      { id: 'branch-2', company: 'comp-1', company_name: 'Matriz', name: 'Shopping', is_active: true, ie: '', address_json: {}, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    ]})),
    http.post(`${BASE}/financial/receivables/:id/settle/`, async ({ request, params }) => {
      const body = await request.json() as { amount?: string }
      if (Number(body.amount) > 2000) {
        return HttpResponse.json(
          { type: 'about:blank', title: 'Conflict', status: 409, detail: 'Valor excede o saldo disponível.', code: 'over_settlement' },
          { status: 409 },
        )
      }
      return HttpResponse.json({
        id: params.id,
        ...RECEIVABLES_PAGE.results.find((r: Receivable) => r.id === params.id),
        paid_amount: body.amount,
        balance: '0.00',
        status: 'paid',
      })
    }),
    http.post(`${BASE}/financial/payables/:id/settle/`, async ({ request, params }) => {
      const body = await request.json() as { amount?: string }
      if (Number(body.amount) > 5000) {
        return HttpResponse.json(
          { type: 'about:blank', title: 'Conflict', status: 409, detail: 'Valor excede o saldo disponível.', code: 'over_settlement' },
          { status: 409 },
        )
      }
      return HttpResponse.json({
        id: params.id,
        ...PAYABLES_PAGE.results.find((p: Payable) => p.id === params.id),
        paid_amount: body.amount,
        balance: '0.00',
        status: 'paid',
      })
    }),
    http.post(`${BASE}/financial/reports/`, () =>
      HttpResponse.json(
        { id: 'rpt-new', type: 'receivables', format: 'PDF', period_start: '2026-07-01', period_end: '2026-07-31', status: 'pending', file_url: null, created_at: '2026-07-22T00:00:00Z' },
        { status: 201 },
      ),
    ),
    http.get(`${BASE}/inventory/lots/`, () =>
      HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
    ),
  )
})

describe('ReceivablesPage', () => {
  it('displays receivables list with descriptions', async () => {
    renderWithProviders(<ReceivablesPage />, '/financial/receivables')
    await waitFor(() => {
      expect(screen.getByText((content) => content.includes('Venda #123'))).toBeInTheDocument()
    })
    expect(screen.getByText('Serviço Prestado')).toBeInTheDocument()
    expect(screen.getByText('Fatura Cliente A')).toBeInTheDocument()
  })

  it('shows status badges with correct labels', async () => {
    renderWithProviders(<ReceivablesPage />, '/financial/receivables')
    await waitFor(() => {
      expect(screen.getByTestId('status-badge-pending')).toHaveTextContent('Pendente')
    })
    expect(screen.getByTestId('status-badge-paid')).toHaveTextContent('Pago')
    expect(screen.getByTestId('status-badge-overdue')).toHaveTextContent('Vencido')
  })

  it('shows empty state when no receivables', async () => {
    server.use(
      http.get(`${BASE}/financial/receivables/`, () =>
        HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
      ),
    )
    renderWithProviders(<ReceivablesPage />, '/financial/receivables')
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })
  })

  it('renders filter elements', async () => {
    renderWithProviders(<ReceivablesPage />, '/financial/receivables')
    await waitFor(() => {
      expect(screen.getByLabelText('Filtrar por status')).toBeInTheDocument()
    })
    expect(screen.getByLabelText('Filtrar por filial')).toBeInTheDocument()
  })
})

describe('PayablesPage', () => {
  it('displays payables list with descriptions', async () => {
    renderWithProviders(<PayablesPage />, '/financial/payables')
    await waitFor(() => {
      expect(screen.getByText('Aluguel')).toBeInTheDocument()
    })
    expect(screen.getByText('Energia')).toBeInTheDocument()
  })

  it('shows status badges with correct colors', async () => {
    renderWithProviders(<PayablesPage />, '/financial/payables')
    await waitFor(() => {
      expect(screen.getByTestId('status-badge-pending')).toHaveTextContent('Pendente')
    })
    expect(screen.getByTestId('status-badge-paid')).toHaveTextContent('Pago')
  })

  it('shows empty state when no payables', async () => {
    server.use(
      http.get(`${BASE}/financial/payables/`, () =>
        HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
      ),
    )
    renderWithProviders(<PayablesPage />, '/financial/payables')
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })
  })
})

describe('CashflowPage', () => {
  it('displays cashflow entries', async () => {
    renderWithProviders(<CashflowPage />, '/financial/cashflow')
    await waitFor(() => {
      expect(screen.getByText('Venda #123')).toBeInTheDocument()
    })
    expect(screen.getByText('Pagamento Aluguel')).toBeInTheDocument()
    expect(screen.getByText('Recebimento Serviço')).toBeInTheDocument()
  })

  it('shows running balance column', async () => {
    renderWithProviders(<CashflowPage />, '/financial/cashflow')
    await waitFor(() => {
      const rows = screen.getAllByTestId('cashflow-row')
      expect(rows[0]).toHaveTextContent('1500.00')
      expect(rows[1]).toHaveTextContent('-3000.00')
    })
  })

  it('shows empty state when no entries', async () => {
    server.use(
      http.get(`${BASE}/financial/cashflow/`, () =>
        HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
      ),
    )
    renderWithProviders(<CashflowPage />, '/financial/cashflow')
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })
  })
})

describe('SettlementDialog', () => {
  it('opens with correct balance and due date', () => {
    const target: Receivable = RECEIVABLES_PAGE.results[0] as Receivable
    renderWithProviders(
      <SettlementDialog type="receivable" target={target} onClose={() => {}} />,
    )
    expect(screen.getByTestId('settlement-dialog')).toBeInTheDocument()
    expect(screen.getByText(/1500\.00/)).toBeInTheDocument()
    expect(screen.getByDisplayValue('1500.00')).toBeInTheDocument()
  })

  it('prevents over-settlement with validation error', async () => {
    const user = userEvent.setup()
    const target: Receivable = RECEIVABLES_PAGE.results[0] as Receivable
    renderWithProviders(
      <SettlementDialog type="receivable" target={target} onClose={() => {}} />,
    )

    const amountInput = screen.getByTestId('settlement-amount')
    await user.clear(amountInput)
    await user.type(amountInput, '2000')
    await waitFor(() => {
      expect(screen.getByTestId('validation-error')).toBeInTheDocument()
    })
  })

  it('completes partial settlement on success', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const target: Payable = PAYABLES_PAGE.results[0] as Payable
    renderWithProviders(
      <SettlementDialog type="payable" target={target} onClose={onClose} />,
    )

    const amountInput = screen.getByTestId('settlement-amount')
    await user.clear(amountInput)
    await user.type(amountInput, '1000')
    await user.click(screen.getByTestId('settlement-submit'))

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('completes full settlement on success', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const target: Receivable = RECEIVABLES_PAGE.results[0] as Receivable
    renderWithProviders(
      <SettlementDialog type="receivable" target={target} onClose={onClose} />,
    )

    await user.click(screen.getByTestId('settlement-submit'))

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('shows error on 409 conflict over-settlement', async () => {
    const user = userEvent.setup()
    const target: Receivable = { ...RECEIVABLES_PAGE.results[0] as Receivable, balance: '3000.00' }
    renderWithProviders(
      <SettlementDialog type="receivable" target={target} onClose={() => {}} />,
    )

    const amountInput = screen.getByTestId('settlement-amount')
    await user.clear(amountInput)
    await user.type(amountInput, '2500')
    await user.click(screen.getByTestId('settlement-submit'))

    await waitFor(() => {
      expect(screen.getByTestId('settlement-error')).toHaveTextContent(/excede|erro/i)
    })
  })

  it('shows 422 validation error', async () => {
    server.use(
      http.post(`${BASE}/financial/receivables/:id/settle/`, () =>
        HttpResponse.json(
          {
            type: 'about:blank',
            title: 'Validation Error',
            status: 422,
            detail: 'Invalid input',
            errors: { payment_date: ['Informe uma data válida.'] },
          },
          { status: 422 },
        ),
      ),
    )
    const user = userEvent.setup()
    const target: Receivable = RECEIVABLES_PAGE.results[0] as Receivable
    renderWithProviders(
      <SettlementDialog type="receivable" target={target} onClose={() => {}} />,
    )

    await user.click(screen.getByTestId('settlement-submit'))

    await waitFor(() => {
      expect(screen.getByTestId('settlement-error')).toHaveTextContent(/data/i)
    })
  })
})

describe('ReportsPage', () => {
  it('shows report generation form', async () => {
    renderWithProviders(<ReportsPage />, '/financial/reports')
    await waitFor(() => {
      expect(screen.getByTestId('generate-report-btn')).toBeInTheDocument()
    })
    expect(screen.getByTestId('report-type')).toBeInTheDocument()
    expect(screen.getByTestId('report-format')).toBeInTheDocument()
  })

  it('generates a report on submit', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ReportsPage />, '/financial/reports')

    await waitFor(() => {
      expect(screen.getByTestId('generate-report-btn')).toBeInTheDocument()
    })

    await user.type(screen.getByTestId('report-period-start'), '2026-07-01')
    await user.type(screen.getByTestId('report-period-end'), '2026-07-31')
    await user.click(screen.getByTestId('generate-report-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('generate-report-btn')).toBeDisabled()
    })
  })

  it('lists previously generated reports', async () => {
    renderWithProviders(<ReportsPage />, '/financial/reports')
    await waitFor(() => {
      expect(screen.getAllByTestId('report-row')).toHaveLength(2)
    })
  })

  it('shows download link for completed reports', async () => {
    renderWithProviders(<ReportsPage />, '/financial/reports')
    await waitFor(() => {
      const links = screen.getAllByTestId('report-download-link')
      expect(links).toHaveLength(2)
    })
  })
})
