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

import MfaPolicyPage from './MfaPolicyPage'

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

const DEFAULT_POLICY = { allow_totp: true, allow_email: true }

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
}

function renderMfaPage() {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/security/mfa-policy']}>
        <AuthContext.Provider value={authValue}>
          <TenantContext.Provider value={tenantValue}>
            <Routes>
              <Route path="/security/mfa-policy" element={<MfaPolicyPage />} />
            </Routes>
          </TenantContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  server.use(
    http.get(`${BASE}/security/mfa-policy/`, () =>
      HttpResponse.json(DEFAULT_POLICY),
    ),
    http.patch(`${BASE}/security/mfa-policy/`, async ({ request }) => {
      const body = (await request.json()) as { allow_totp?: boolean; allow_email?: boolean }
      if (body.allow_totp === false && body.allow_email === false) {
        return HttpResponse.json(
          { type: 'about:blank', title: 'Validation Error', status: 422, detail: 'Pelo menos um método MFA deve estar ativo.', code: 'validation_error' },
          { status: 422 },
        )
      }
      return HttpResponse.json(body)
    }),
  )
})

describe('MfaPolicyPage', () => {
  it('shows loading state initially', () => {
    server.use(
      http.get(`${BASE}/security/mfa-policy/`, () => new Promise(() => {})),
    )
    renderMfaPage()
    expect(screen.getByTestId('loading-state')).toBeInTheDocument()
  })

  it('displays current MFA policy settings', async () => {
    renderMfaPage()
    await waitFor(() => {
      expect(screen.getByTestId('mfa-policy-page')).toBeInTheDocument()
    })
    const totpToggle = screen.getByLabelText(/autenticador/i)
    const emailToggle = screen.getByLabelText(/e-mail/i)
    expect(totpToggle).toBeChecked()
    expect(emailToggle).toBeChecked()
  })

  it('can toggle and save policy', async () => {
    renderMfaPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('mfa-policy-page')).toBeInTheDocument()
    })

    const emailToggle = screen.getByLabelText(/e-mail/i)
    await user.click(emailToggle)
    expect(emailToggle).not.toBeChecked()

    await user.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() => {
      expect(screen.getByText(/política mfa atualizada/i)).toBeInTheDocument()
    })
  })

  it('shows validation error when trying to disable all MFA methods', async () => {
    renderMfaPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('mfa-policy-page')).toBeInTheDocument()
    })

    const totpToggle = screen.getByLabelText(/autenticador/i)
    const emailToggle = screen.getByLabelText(/e-mail/i)

    await user.click(totpToggle)
    await user.click(emailToggle)

    await user.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() => {
      expect(screen.getByTestId('form-error')).toHaveTextContent(/pelo menos um método mfa/i)
    })
  })

  it('non-admin user sees read-only view (no save button)', async () => {
    const viewerAuthValue: AuthContextValue = {
      state: 'authenticated',
      user: { id: 2, email: 'viewer@zyrp.local', name: 'Viewer', is_active: true, is_mfa_enabled: false },
      memberships: [{ id: 2, tenant_id: 'tenant-alpha', tenant_name: 'Alpha', role: 'viewer' }],
      login: async () => ({ requiresMfa: false }),
      challengeMfa: async () => {},
      verifyRecovery: async () => {},
      logout: async () => {},
    }

    const viewerTenantValue = {
      selectedTenant: { id: 2, tenant_id: 'tenant-alpha', tenant_name: 'Alpha', role: 'viewer' },
      memberships: [{ id: 2, tenant_id: 'tenant-alpha', tenant_name: 'Alpha', role: 'viewer' }],
      selectTenant: () => {},
    }

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/security/mfa-policy']}>
          <AuthContext.Provider value={viewerAuthValue}>
            <TenantContext.Provider value={viewerTenantValue}>
              <Routes>
                <Route path="/security/mfa-policy" element={<MfaPolicyPage />} />
              </Routes>
            </TenantContext.Provider>
          </AuthContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('mfa-policy-page')).toBeInTheDocument()
    })

    expect(screen.queryByRole('button', { name: /salvar/i })).not.toBeInTheDocument()
    expect(screen.getByText(/somente leitura/i)).toBeInTheDocument()
  })

  it('shows error state when fetch fails', async () => {
    server.use(
      http.get(`${BASE}/security/mfa-policy/`, () =>
        HttpResponse.json(
          { type: 'about:blank', title: 'Server Error', status: 500, detail: 'Internal server error' },
          { status: 500 },
        ),
      ),
    )
    renderMfaPage()
    await waitFor(() => {
      expect(screen.getByTestId('error-state')).toBeInTheDocument()
    })
  })
})
