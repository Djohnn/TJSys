import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { describe, it, expect, beforeEach } from 'vitest'

import { AuthContext } from '@/auth/AuthProvider'
import type { AuthContextValue } from '@/auth/AuthProvider'
import { TenantContext } from '@/tenant/TenantProvider'
import type { TenantContextValue } from '@/tenant/TenantProvider'
import { server } from '@/test/server'

import OperationsPage from './OperationsPage'

const BASE = '/api/v1'

const authValue: AuthContextValue = {
  state: 'authenticated',
  user: { id: 1, email: 'admin@tjsys.local', name: 'Admin', is_active: true, is_mfa_enabled: false },
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

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={qc}>
      <AuthContext.Provider value={authValue}>
        <TenantContext.Provider value={tenantValue}>
          <MemoryRouter initialEntries={['/monitoring/operations']}>
            <Routes>
              <Route path="/monitoring/operations" element={<OperationsPage />} />
            </Routes>
          </MemoryRouter>
        </TenantContext.Provider>
      </AuthContext.Provider>
    </QueryClientProvider>,
  )
}

const OPERATIONS_DATA = {
  health: { status: 'healthy', checks: { database: 'ok', cache: 'ok' }, timestamp: '2026-07-22T00:00:00Z' },
  readiness: { status: 'ready', services: { database: 'ok', cache: 'ok' } },
  system_metrics: {
    outbox: { total: 25, pending: 5, failed: 2, dead_letter: 0, published: 18, oldest_pending_at: '2026-07-21T00:00:00Z', newest_pending_at: '2026-07-22T00:00:00Z' },
    fiscal: { total: 50, pending: 3, processing: 2, concluded: 40, rejected: 3, cancelled: 1, failed: 1 },
  },
  runbook_links: [
    { id: 'db-down', label: 'Database outage', url: 'https://docs.tjsys.local/runbooks/db-down' },
    { id: 'cache-down', label: 'Cache outage', url: 'https://docs.tjsys.local/runbooks/cache-down' },
    { id: 'fiscal-rejected', label: 'Fiscal rejection', url: 'https://docs.tjsys.local/runbooks/fiscal-rejected' },
    { id: 'outbox-backlog', label: 'Outbox backlog', url: 'https://docs.tjsys.local/runbooks/outbox-backlog' },
  ],
}

describe('OperationsPage', () => {
  beforeEach(() => {
    server.use(
      http.get(`${BASE}/monitoring/operations/`, () => HttpResponse.json(OPERATIONS_DATA)),
    )
  })

  it('operations page loads health section', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByTestId('operations-page')).toBeInTheDocument())
    expect(screen.getByTestId('health-section')).toBeInTheDocument()
  })

  it('health shows healthy with ok checks', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByTestId('health-section')).toBeInTheDocument())
    expect(screen.getByTestId('health-status-badge').textContent).toBe('healthy')
    expect(screen.getByTestId('health-db-status').textContent).toBe('ok')
    expect(screen.getByTestId('health-cache-status').textContent).toBe('ok')
  })

  it('readiness section shows ready status', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByTestId('readiness-section')).toBeInTheDocument())
    expect(screen.getByTestId('readiness-status-badge').textContent).toBe('ready')
  })

  it('outbox metrics display pending count', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByTestId('outbox-pending')).toBeInTheDocument())
    expect(screen.getByTestId('outbox-pending')).toHaveTextContent('5')
  })

  it('outbox metrics display failed count', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByTestId('outbox-failed')).toBeInTheDocument())
    expect(screen.getByTestId('outbox-failed')).toHaveTextContent('2')
  })

  it('fiscal metrics display concluded count', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByTestId('fiscal-concluded')).toBeInTheDocument())
    expect(screen.getByTestId('fiscal-concluded')).toHaveTextContent('40')
  })

  it('runbook links are rendered', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByTestId('runbook-section')).toBeInTheDocument())
    expect(screen.getByTestId('runbook-link-db-down')).toBeInTheDocument()
    expect(screen.getByTestId('runbook-link-cache-down')).toBeInTheDocument()
    expect(screen.getByTestId('runbook-link-fiscal-rejected')).toBeInTheDocument()
    expect(screen.getByTestId('runbook-link-outbox-backlog')).toBeInTheDocument()
  })

  it('loading state shown initially then resolves', async () => {
    renderPage()
    expect(screen.getByTestId('loading-state')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('operations-page')).toBeInTheDocument())
    expect(screen.queryByTestId('loading-state')).toBeNull()
  })
})