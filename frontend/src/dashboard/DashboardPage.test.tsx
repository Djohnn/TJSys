import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { describe, it, expect, beforeEach } from 'vitest'

import { AuthContext } from '@/auth/AuthProvider'
import type { AuthContextValue } from '@/auth/AuthProvider'
import { TenantContext } from '@/tenant/TenantProvider'
import type { TenantContextValue } from '@/tenant/TenantProvider'
import { OrganizationContext } from '@/organization/OrganizationProvider'
import type { OrganizationContextValue } from '@/organization/OrganizationProvider'
import { server } from '@/test/server'

import DashboardPage from './DashboardPage'

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

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AuthContext.Provider value={authValue}>
          <TenantContext.Provider value={tenantValue}>
            <OrganizationContext.Provider value={orgValue}>
              <DashboardPage />
            </OrganizationContext.Provider>
          </TenantContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('DashboardPage', () => {
  beforeEach(() => {
    server.use(
      http.get(`${BASE}/health/`, () =>
        HttpResponse.json({ status: 'ok' }),
      ),
    )
  })

  it('renders tenant name and role', async () => {
    renderDashboard()

    await waitFor(() => {
      expect(screen.getByTestId('current-tenant')).toHaveTextContent('Alpha')
      expect(screen.getByTestId('current-tenant')).toHaveTextContent('admin')
    })
  })

  it('shows health status as online when backend responds', async () => {
    renderDashboard()

    await waitFor(() => {
      expect(screen.getByTestId('health-status')).toHaveTextContent('Backend online')
    })
  })

  it('shows all module cards for admin role', async () => {
    renderDashboard()

    await waitFor(() => {
      expect(screen.getByTestId('module-cards')).toBeInTheDocument()
    })

    const cards = screen.getByTestId('module-cards')
    expect(cards).toHaveTextContent('Empresas e Filiais')
    expect(cards).toHaveTextContent('Catálogo')
    expect(cards).toHaveTextContent('Estoque')
    expect(cards).toHaveTextContent('Vendas')
    expect(cards).toHaveTextContent('Financeiro')
    expect(cards).toHaveTextContent('Acesso')
    expect(cards).toHaveTextContent('Segurança')
    expect(cards).toHaveTextContent('Dispositivos')
  })

  it('every card links to the correct route', async () => {
    renderDashboard()

    await waitFor(() => {
      expect(screen.getByTestId('card-organization')).toBeInTheDocument()
    })

    expect(screen.getByTestId('card-organization')).toHaveAttribute('href', '/organization/companies')
    expect(screen.getByTestId('card-catalog')).toHaveAttribute('href', '/catalog')
    expect(screen.getByTestId('card-sales')).toHaveAttribute('href', '/sales')
    expect(screen.getByTestId('card-access')).toHaveAttribute('href', '/access/members')
    expect(screen.getByTestId('card-security')).toHaveAttribute('href', '/security/mfa')
    expect(screen.getByTestId('card-devices')).toHaveAttribute('href', '/devices')
  })
})

describe('DashboardPage - role-based filtering', () => {
  const managerAuth: AuthContextValue = {
    ...authValue,
    memberships: [{ id: 2, tenant_id: 'tenant-beta', tenant_name: 'Beta', role: 'manager' }],
  }
  const managerTenant: TenantContextValue = {
    ...tenantValue,
    selectedTenant: { id: 2, tenant_id: 'tenant-beta', tenant_name: 'Beta', role: 'manager' },
    memberships: [{ id: 2, tenant_id: 'tenant-beta', tenant_name: 'Beta', role: 'manager' }],
  }

  it('hides access card for manager role', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuthContext.Provider value={managerAuth}>
            <TenantContext.Provider value={managerTenant}>
              <OrganizationContext.Provider value={orgValue}>
                <DashboardPage />
              </OrganizationContext.Provider>
            </TenantContext.Provider>
          </AuthContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('module-cards')).toBeInTheDocument()
    })

    const cards = screen.getByTestId('module-cards')
    expect(cards).toHaveTextContent('Empresas e Filiais')
    expect(cards).toHaveTextContent('Financeiro')
    expect(cards).not.toHaveTextContent('Acesso')
  })

  it('shows limited cards for operator role', async () => {
    const operatorAuth: AuthContextValue = {
      ...authValue,
      memberships: [{ id: 3, tenant_id: 'tenant-gamma', tenant_name: 'Gamma', role: 'operator' }],
    }
    const operatorTenant: TenantContextValue = {
      ...tenantValue,
      selectedTenant: { id: 3, tenant_id: 'tenant-gamma', tenant_name: 'Gamma', role: 'operator' },
      memberships: [{ id: 3, tenant_id: 'tenant-gamma', tenant_name: 'Gamma', role: 'operator' }],
    }

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuthContext.Provider value={operatorAuth}>
            <TenantContext.Provider value={operatorTenant}>
              <OrganizationContext.Provider value={orgValue}>
                <DashboardPage />
              </OrganizationContext.Provider>
            </TenantContext.Provider>
          </AuthContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('module-cards')).toBeInTheDocument()
    })

    const cards = screen.getByTestId('module-cards')
    expect(cards).toHaveTextContent('Catálogo')
    expect(cards).toHaveTextContent('Estoque')
    expect(cards).toHaveTextContent('Vendas')
    expect(cards).not.toHaveTextContent('Empresas')
    expect(cards).not.toHaveTextContent('Financeiro')
    expect(cards).not.toHaveTextContent('Acesso')
    expect(cards).not.toHaveTextContent('Segurança')
    expect(cards).not.toHaveTextContent('Dispositivos')
  })
})
