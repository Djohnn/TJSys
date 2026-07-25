import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { describe, it, expect, beforeEach } from 'vitest'

import { AuthContext } from '@/auth/AuthProvider'
import type { AuthContextValue } from '@/auth/AuthProvider'
import { TenantContext } from '@/tenant/TenantProvider'
import type { TenantContextValue } from '@/tenant/TenantProvider'
import { server } from '@/test/server'

import ProviderConfigPage from './ProviderConfigPage'
import TransactionsPage from './TransactionsPage'
import ReconciliationBatchesPage from './ReconciliationBatchesPage'
import ReconciliationBatchDetailPage from './ReconciliationBatchDetailPage'

const BASE = '/api/v1'

const authValue: AuthContextValue = {
  state: 'authenticated',
  user: { id: 1, email: 'admin@zyrp.local', name: 'Admin', is_active: true, is_mfa_enabled: false },
  memberships: [{ id: 1, tenant_id: 'tenant-alpha', tenant_name: 'Alpha', role: 'admin' }],
  login: async () => ({ requiresMfa: false }),
  logout: async () => {},
  challengeMfa: async () => {},
  verifyRecovery: vi.fn(),
} as AuthContextValue

const tenantValue: TenantContextValue = {
  selectedTenant: { id: 1, tenant_id: 'tenant-alpha', tenant_name: 'Alpha', role: 'admin' },
  memberships: [{ id: 1, tenant_id: 'tenant-alpha', tenant_name: 'Alpha', role: 'admin' }],
  selectTenant: () => {},
} as TenantContextValue

const PROVIDER_CONFIGS = {
  count: 2, next: null, previous: null,
  results: [
    { id: 'pc-1', provider: 'stripe', is_active: true, configured: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    { id: 'pc-2', provider: 'mercadopago', is_active: true, configured: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  ],
}

const INTENTS = {
  count: 2, next: null, previous: null,
  results: [
    { id: 'int-1', sale: 's-1', amount: '199.90', currency: 'BRL', status: 'succeeded', provider_reference: 'pi_abc', idempotency_key: 'ik-1', created_at: '2026-07-20T00:00:00Z' },
    { id: 'int-2', sale: 's-2', amount: '89.50', currency: 'BRL', status: 'requires_payment_method', provider_reference: '', idempotency_key: 'ik-2', created_at: '2026-07-21T00:00:00Z' },
  ],
}

const TRANSACTIONS = {
  count: 2, next: null, previous: null,
  results: [
    { id: 'tx-1', intent: 'int-1', transaction_type: 'capture', status: 'succeeded', gross_amount: '199.90', fee_amount: '7.96', net_amount: '191.94', provider_reference: 'ch_xyz', created_at: '2026-07-20T00:00:00Z' },
    { id: 'tx-2', intent: 'int-2', transaction_type: 'refund', status: 'succeeded', gross_amount: '89.50', fee_amount: '3.58', net_amount: '85.92', provider_reference: 're_abc', created_at: '2026-07-21T00:00:00Z' },
  ],
}

const BATCHES = {
  count: 2, next: null, previous: null,
  results: [
    {
      id: 'batch-1', provider: 'stripe', status: 'draft', confirmed_at: null,
      items: [
        { id: 'item-1', provider_reference: 'ch_xyz', gross_amount: '199.90', fee_amount: '7.96', settled_amount: '191.94', status: 'matched', difference_amount: '0.00' },
      ],
      created_at: '2026-07-22T00:00:00Z',
    },
    {
      id: 'batch-2', provider: 'mercadopago', status: 'confirmed', confirmed_at: '2026-07-21T00:00:00Z',
      items: [],
      created_at: '2026-07-21T00:00:00Z',
    },
  ],
}

const BATCH_DETAIL_DRAFT = {
  id: 'batch-1', provider: 'stripe', status: 'draft', confirmed_at: null,
  items: [
    { id: 'item-1', provider_reference: 'ch_xyz', gross_amount: '199.90', fee_amount: '7.96', settled_amount: '191.94', status: 'matched', difference_amount: '0.00' },
    { id: 'item-2', provider_reference: 'ch_abc', gross_amount: '89.50', fee_amount: '3.58', settled_amount: '88.90', status: 'divergent', difference_amount: '-2.98' },
  ],
  created_at: '2026-07-22T00:00:00Z',
}

const BATCH_DETAIL_DIVERGENT = {
  id: 'batch-3', provider: 'stripe', status: 'draft', confirmed_at: null,
  items: [
    { id: 'item-3', provider_reference: 'ch_div', gross_amount: '500.00', fee_amount: '20.00', settled_amount: '470.00', status: 'divergent', difference_amount: '-10.00' },
  ],
  created_at: '2026-07-22T00:00:00Z',
}

type PageType = 'provider-config' | 'transactions' | 'batches' | 'batch-detail'

function renderPage(type: PageType, batchId = 'batch-1') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const routeMap: Record<PageType, string> = {
    'provider-config': '/payments/provider-configs',
    transactions: '/payments/transactions',
    batches: '/payments/reconciliation-batches',
    'batch-detail': `/payments/reconciliation-batches/${batchId}`,
  }
  const routePath = routeMap[type]

  render(
    <QueryClientProvider client={qc}>
      <AuthContext.Provider value={authValue}>
        <TenantContext.Provider value={tenantValue}>
          <MemoryRouter initialEntries={[routePath]}>
            <Routes>
              <Route path="/payments/provider-configs" element={<ProviderConfigPage />} />
              <Route path="/payments/transactions" element={<TransactionsPage />} />
              <Route path="/payments/reconciliation-batches" element={<ReconciliationBatchesPage />} />
              <Route path="/payments/reconciliation-batches/:id" element={<ReconciliationBatchDetailPage />} />
            </Routes>
          </MemoryRouter>
        </TenantContext.Provider>
      </AuthContext.Provider>
    </QueryClientProvider>,
  )
}

describe('PaymentPages', () => {
  beforeEach(() => {
    server.use(
      http.get(`${BASE}/payments/provider-configs/`, () => HttpResponse.json(PROVIDER_CONFIGS)),
      http.post(`${BASE}/payments/provider-configs/`, async ({ request }) => {
        const body = await request.json() as Record<string, string>
        return HttpResponse.json(
          { id: 'pc-new', provider: body.provider, is_active: true, configured: true, created_at: '2026-07-22T00:00:00Z', updated_at: '2026-07-22T00:00:00Z' },
          { status: 201 },
        )
      }),
      http.patch(`${BASE}/payments/provider-configs/:id/`, async ({ params }) =>
        HttpResponse.json({ ...PROVIDER_CONFIGS.results[0], id: String(params.id), configured: true }),
      ),
      http.get(`${BASE}/payments/intents/`, () => HttpResponse.json(INTENTS)),
      http.get(`${BASE}/payments/transactions/`, () => HttpResponse.json(TRANSACTIONS)),
      http.get(`${BASE}/payments/reconciliation-batches/`, () => HttpResponse.json(BATCHES)),
      http.get(`${BASE}/payments/reconciliation-batches/batch-1/`, () => HttpResponse.json(BATCH_DETAIL_DRAFT)),
      http.get(`${BASE}/payments/reconciliation-batches/batch-3/`, () => HttpResponse.json(BATCH_DETAIL_DIVERGENT)),
      http.post(`${BASE}/payments/reconciliation-batches/batch-1/confirm/`, () =>
        HttpResponse.json({ ...BATCH_DETAIL_DRAFT, status: 'confirmed', confirmed_at: '2026-07-22T10:00:00Z' }),
      ),
      http.post(`${BASE}/payments/reconciliation-batches/batch-3/confirm/`, () =>
        HttpResponse.json(
          { type: 'https://errors.zyrp.com/payments/reconciliation-divergent', title: 'Divergent items', status: 409, detail: 'Batch contains divergent items' },
          { status: 409 },
        ),
      ),
    )
  })

  it('provider config list shows table', async () => {
    renderPage('provider-config')
    await waitFor(() => expect(screen.getByTestId('provider-config-page')).toBeInTheDocument())
    expect(screen.getByTestId('provider-config-table')).toBeInTheDocument()
    expect(screen.getAllByTestId('provider-config-row')).toHaveLength(2)
  })

  it('provider config form opens, secret field has placeholder', async () => {
    renderPage('provider-config')
    await waitFor(() => expect(screen.getByTestId('new-provider-btn')).toBeInTheDocument())
    const user = userEvent.setup()
    await user.click(screen.getByTestId('new-provider-btn'))
    expect(screen.getByTestId('provider-config-form')).toBeInTheDocument()
    expect(screen.getByTestId('provider-secret-input')).toBeInTheDocument()
    const secretInput = screen.getByTestId('provider-secret-input') as HTMLInputElement
    expect(secretInput.placeholder).toBe('••••••••')
  })

  it('provider config creates without returning secret', async () => {
    renderPage('provider-config')
    await waitFor(() => expect(screen.getByTestId('new-provider-btn')).toBeInTheDocument())
    const user = userEvent.setup()
    await user.click(screen.getByTestId('new-provider-btn'))
    await user.type(screen.getByTestId('form-provider-name'), 'pagarme')
    await user.type(screen.getByTestId('provider-secret-input'), 'sk_test')
    await user.click(screen.getByTestId('submit-provider-btn'))
    await waitFor(() => expect(screen.getByTestId('form-message')).toBeInTheDocument())
    expect(screen.getByTestId('form-message').textContent).toBe('Provider configurado com sucesso.')
    expect(screen.queryByTestId('provider-config-form')).toBeNull()
  })

  it('provider config edit shows blank secret field', async () => {
    renderPage('provider-config')
    await waitFor(() => expect(screen.getByTestId('provider-config-table')).toBeInTheDocument())
    const user = userEvent.setup()
    await user.click(screen.getByTestId('edit-provider-pc-1'))
    await waitFor(() => expect(screen.getByTestId('provider-config-form')).toBeInTheDocument())
    const secretInput = screen.getByTestId('provider-secret-input') as HTMLInputElement
    expect(secretInput.value).toBe('')
    expect(secretInput.placeholder).toBe('••••••••')
  })

  it('configured badge shows correct text when configured=true', async () => {
    renderPage('provider-config')
    await waitFor(() => expect(screen.getByTestId('configured-badge-pc-1')).toBeInTheDocument())
    expect(screen.getByTestId('configured-badge-pc-1').textContent).toBe('Configurado')
    expect(screen.getByTestId('configured-badge-pc-2').textContent).toBe('Pendente')
  })

  it('transactions list shows table with BRL amounts', async () => {
    renderPage('transactions')
    await waitFor(() => expect(screen.getByTestId('transactions-page')).toBeInTheDocument())
    expect(screen.getByTestId('transactions-table')).toBeInTheDocument()
    expect(screen.getAllByTestId('transaction-row')).toHaveLength(2)
    const rows = screen.getAllByTestId('transaction-row')
    expect(rows[0].textContent).toContain('R$')
  })

  it('transactions filter by type works', async () => {
    renderPage('transactions')
    await waitFor(() => expect(screen.getByTestId('transactions-filters')).toBeInTheDocument())
    const user = userEvent.setup()
    await user.selectOptions(screen.getByTestId('filter-type'), 'capture')
    expect(screen.getByTestId('filter-type')).toBeInTheDocument()
  })

  it('reconciliation batches list shows draft and confirmed', async () => {
    renderPage('batches')
    await waitFor(() => expect(screen.getByTestId('reconciliation-batches-page')).toBeInTheDocument())
    expect(screen.getByTestId('batches-table')).toBeInTheDocument()
    expect(screen.getAllByTestId('batch-row')).toHaveLength(2)
    expect(screen.getByTestId('confirm-batch-batch-1')).toBeInTheDocument()
    expect(screen.queryByTestId('confirm-batch-batch-2')).toBeNull()
  })

  it('batch detail shows items with difference', async () => {
    renderPage('batch-detail', 'batch-1')
    await waitFor(() => expect(screen.getByTestId('reconciliation-batch-detail-page')).toBeInTheDocument())
    expect(screen.getByTestId('batch-items-table')).toBeInTheDocument()
    const itemRows = screen.getAllByTestId('batch-item-row')
    expect(itemRows).toHaveLength(2)
    const diffEl = screen.getByTestId('item-difference-1')
    expect(diffEl.style.color).toBe('red')
  })

  it('confirm batch succeeds for draft', async () => {
    renderPage('batches')
    await waitFor(() => expect(screen.getByTestId('confirm-batch-batch-1')).toBeInTheDocument())
    const user = userEvent.setup()
    await user.click(screen.getByTestId('confirm-batch-batch-1'))
    await waitFor(() => expect(screen.getByTestId('batch-message')).toBeInTheDocument())
    expect(screen.getByTestId('batch-message').textContent).toBe('Lote confirmado com sucesso.')
  })

  it('confirm batch shows error for divergent (409)', async () => {
    server.use(
      http.get(`${BASE}/payments/reconciliation-batches/`, () =>
        HttpResponse.json({
          count: 1, next: null, previous: null,
          results: [BATCH_DETAIL_DIVERGENT],
        }),
      ),
    )
    renderPage('batches')
    await waitFor(() => expect(screen.getByTestId('batches-table')).toBeInTheDocument())
    const user = userEvent.setup()
    await user.click(screen.getByTestId('confirm-batch-batch-3'))
    await waitFor(() => expect(screen.getByTestId('batch-message')).toBeInTheDocument())
    expect(screen.getByTestId('batch-message').textContent).toContain('divergent')
  })
})