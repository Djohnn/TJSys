import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { AuthContext } from '../auth/AuthProvider'
import type { User, Membership } from '../auth/authApi'

import { TenantProvider, useTenant } from './TenantProvider'

const STORAGE_KEY = 'tjsys:selected-tenant'

const mockUser: User = {
  id: 1,
  email: 'admin@tjsys.local',
  name: 'Admin',
  is_active: true,
  is_mfa_enabled: false,
}

const mockMemberships: Membership[] = [
  { id: 1, tenant_id: 'tenant-alpha', tenant_name: 'Alpha', role: 'admin' },
  { id: 2, tenant_id: 'tenant-beta', tenant_name: 'Beta', role: 'editor' },
  { id: 3, tenant_id: 'tenant-gamma', tenant_name: 'Gamma', role: 'viewer' },
]

const authValue = {
  state: 'authenticated' as const,
  user: mockUser,
  memberships: mockMemberships,
  login: async () => ({ requiresMfa: false }),
  challengeMfa: async () => {},
  verifyRecovery: vi.fn(),
  logout: async () => {},
}

function TestDisplay() {
  const tenant = useTenant()
  return (
    <div>
      <span data-testid="tenant-id">
        {tenant.selectedTenant ? tenant.selectedTenant.tenant_id : 'null'}
      </span>
      <span data-testid="memberships-count">{tenant.memberships.length}</span>
      <button data-testid="btn-select-beta" onClick={() => tenant.selectTenant('tenant-beta')}>
        Select Beta
      </button>
    </div>
  )
}

function TestInvalidSelection() {
  const tenant = useTenant()
  const [error, setError] = useState<string | null>(null)

  const handleClick = () => {
    try {
      tenant.selectTenant('tenant-invalid')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div>
      <button data-testid="btn-select-invalid" onClick={handleClick}>
        Select Invalid
      </button>
      {error && <span data-testid="error">{error}</span>}
    </div>
  )
}

function renderWithAuth(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={authValue}>
          <TenantProvider>{ui}</TenantProvider>
        </AuthContext.Provider>
      </QueryClientProvider>,
    ),
  }
}

describe('TenantProvider', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('reads selected tenant from localStorage on mount', () => {
    localStorage.setItem(STORAGE_KEY, 'tenant-beta')

    renderWithAuth(<TestDisplay />)

    expect(screen.getByTestId('tenant-id')).toHaveTextContent('tenant-beta')
  })

  it('falls back to first membership when nothing in localStorage', () => {
    renderWithAuth(<TestDisplay />)

    expect(screen.getByTestId('tenant-id')).toHaveTextContent('tenant-alpha')
  })

  it('ignores invalid stored tenant ID', () => {
    localStorage.setItem(STORAGE_KEY, 'tenant-invalid')

    renderWithAuth(<TestDisplay />)

    expect(screen.getByTestId('tenant-id')).toHaveTextContent('tenant-alpha')
  })

  it('selectTenant updates localStorage', async () => {
    renderWithAuth(<TestDisplay />)

    expect(screen.getByTestId('tenant-id')).toHaveTextContent('tenant-alpha')

    const user = userEvent.setup()
    await user.click(screen.getByTestId('btn-select-beta'))

    await waitFor(() => {
      expect(localStorage.getItem(STORAGE_KEY)).toBe('tenant-beta')
      expect(screen.getByTestId('tenant-id')).toHaveTextContent('tenant-beta')
    })
  })

  it('reports error on invalid tenant selection', async () => {
    renderWithAuth(<TestInvalidSelection />)

    const user = userEvent.setup()
    await user.click(screen.getByTestId('btn-select-invalid'))

    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent(/not found/i)
    })
  })

  it('clears queryClient on tenant switch', async () => {
    const { queryClient } = renderWithAuth(<TestDisplay />)

    const clearSpy = vi.spyOn(queryClient, 'clear')

    const user = userEvent.setup()
    await user.click(screen.getByTestId('btn-select-beta'))

    await waitFor(() => {
      expect(clearSpy).toHaveBeenCalledOnce()
    })

    clearSpy.mockRestore()
  })
})
