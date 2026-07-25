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

import DevicesPage from './DevicesPage'

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

const DEVICES_PAGE_1 = {
  count: 3,
  next: null,
  previous: null,
  results: [
    { id: 'dev-1', name: 'iPhone 15', device_id: 'abc12345xyz', platform: 'iOS', app_version: '2.1.0', os_version: '18.0', last_seen_at: '2026-07-20T10:00:00Z', status: 'active', branch_name: 'Centro', registered_at: '2026-06-01T00:00:00Z' },
    { id: 'dev-2', name: 'Samsung Galaxy S24', device_id: 'def67890uvw', platform: 'Android', app_version: '2.1.0', os_version: '14.0', last_seen_at: '2026-07-19T08:00:00Z', status: 'active', branch_name: 'Shopping', registered_at: '2026-05-15T00:00:00Z' },
    { id: 'dev-3', name: 'iPad Pro', device_id: 'ghi11111rst', platform: 'iOS', app_version: '2.0.5', os_version: '17.5', last_seen_at: null, status: 'inactive', branch_name: 'Centro', registered_at: '2026-04-10T00:00:00Z' },
  ],
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
}

function renderDevicesPage(initialRoute = '/devices') {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <AuthContext.Provider value={authValue}>
          <TenantContext.Provider value={tenantValue}>
            <Routes>
              <Route path="/devices" element={<DevicesPage />} />
            </Routes>
          </TenantContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  server.use(
    http.get(`${BASE}/devices/list/`, ({ request }) => {
      const url = new URL(request.url)
      const status = url.searchParams.get('status')
      let results = DEVICES_PAGE_1.results
      if (status === 'active') {
        results = DEVICES_PAGE_1.results.filter((d) => d.status === 'active')
      } else if (status === 'inactive') {
        results = DEVICES_PAGE_1.results.filter((d) => d.status === 'inactive')
      }
      return HttpResponse.json({ ...DEVICES_PAGE_1, results })
    }),
    http.post(`${BASE}/devices/:id/revoke/`, ({ params }) => {
      if (params.id === 'dev-fail') {
        return HttpResponse.json(
          { type: 'about:blank', title: 'Error', status: 400, detail: 'Falha ao revogar dispositivo.', correlationId: 'corr-revoke-001' },
          { status: 400 },
        )
      }
      return HttpResponse.json({ detail: 'Dispositivo revogado com sucesso.' }, { status: 200 })
    }),
  )
})

describe('DevicesPage', () => {
  it('shows loading state initially', () => {
    server.use(
      http.get(`${BASE}/devices/list/`, () => new Promise(() => {})),
    )
    renderDevicesPage()
    expect(screen.getByTestId('loading-state')).toBeInTheDocument()
  })

  it('displays device list', async () => {
    renderDevicesPage()
    await waitFor(() => {
      expect(screen.getByText('iPhone 15')).toBeInTheDocument()
    })
    expect(screen.getByText('Samsung Galaxy S24')).toBeInTheDocument()
    expect(screen.getByText('iPad Pro')).toBeInTheDocument()
  })

  it('shows truncated device ID', async () => {
    renderDevicesPage()
    await waitFor(() => {
      expect(screen.getByText('abc12345')).toBeInTheDocument()
    })
  })

  it('filters by status using URLSearchParams', async () => {
    renderDevicesPage('/devices?status=active')
    await waitFor(() => {
      expect(screen.getByText('iPhone 15')).toBeInTheDocument()
    })
    expect(screen.getByText('Samsung Galaxy S24')).toBeInTheDocument()
    expect(screen.queryByText('iPad Pro')).not.toBeInTheDocument()
  })

  it('shows empty state when no devices', async () => {
    server.use(
      http.get(`${BASE}/devices/list/`, () =>
        HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
      ),
    )
    renderDevicesPage()
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })
  })

  it('opens revoke dialog on click', async () => {
    renderDevicesPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('iPhone 15')).toBeInTheDocument()
    })

    const revokeButtons = screen.getAllByRole('button', { name: /revogar/i })
    await user.click(revokeButtons[0])

    expect(screen.getByTestId('revoke-dialog')).toBeInTheDocument()
    expect(screen.getByText(/tem certeza que deseja revogar/i)).toBeInTheDocument()
  })

  it('confirmed revoke succeeds', async () => {
    renderDevicesPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('iPhone 15')).toBeInTheDocument()
    })

    const revokeButtons = screen.getAllByRole('button', { name: /revogar/i })
    await user.click(revokeButtons[0])

    expect(screen.getByTestId('revoke-dialog')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /confirmar/i }))

    await waitFor(() => {
      expect(screen.queryByTestId('revoke-dialog')).not.toBeInTheDocument()
    })
  })

  it('cancel revoke closes dialog', async () => {
    renderDevicesPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('iPhone 15')).toBeInTheDocument()
    })

    const revokeButtons = screen.getAllByRole('button', { name: /revogar/i })
    await user.click(revokeButtons[0])

    expect(screen.getByTestId('revoke-dialog')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /cancelar/i }))

    await waitFor(() => {
      expect(screen.queryByTestId('revoke-dialog')).not.toBeInTheDocument()
    })
  })

  it('shows correlation ID on revoke error', async () => {
    server.use(
      http.post(`${BASE}/devices/:id/revoke/`, () =>
        HttpResponse.json(
          { type: 'about:blank', title: 'Error', status: 400, detail: 'Falha ao revogar dispositivo.' },
          { status: 400, headers: { 'X-Correlation-ID': 'corr-revoke-001' } },
        ),
      ),
    )
    renderDevicesPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('iPhone 15')).toBeInTheDocument()
    })

    const revokeButtons = screen.getAllByRole('button', { name: /revogar/i })
    await user.click(revokeButtons[0])

    expect(screen.getByTestId('revoke-dialog')).toBeInTheDocument()
    expect(screen.getByText(/tem certeza que deseja revogar/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /confirmar/i }))

    await waitFor(() => {
      expect(screen.getByText(/corr-revoke-001/i)).toBeInTheDocument()
    })
  })

  it('secret fields never appear in DOM', async () => {
    renderDevicesPage()
    await waitFor(() => {
      expect(screen.getByText('iPhone 15')).toBeInTheDocument()
    })

    expect(screen.queryByText(/key_hash/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/refresh_secret/i)).not.toBeInTheDocument()
  })
})
