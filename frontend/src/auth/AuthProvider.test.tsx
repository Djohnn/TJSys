import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { describe, it, expect } from 'vitest'

import { server } from '../test/server'

import { AuthProvider, useAuth } from './AuthProvider'
import { fetchCsrf } from './authApi'

const BASE = '/api/v1'

function TestDisplay() {
  const auth = useAuth()
  return (
    <div>
      <span data-testid="auth-state">{auth.state}</span>
      {auth.user && <span data-testid="auth-user">{auth.user.email}</span>}
      <span data-testid="auth-memberships-count">{auth.memberships.length}</span>
      <button data-testid="btn-login" onClick={() => auth.login('admin@zyrp.local', 'password')}>
        Login
      </button>
      <button data-testid="btn-logout" onClick={() => auth.logout()}>
        Logout
      </button>
    </div>
  )
}

function TestMfaFlow() {
  const auth = useAuth()
  const [tempToken, setTempToken] = useState<string | null>(null)

  const handleLoginMfa = async () => {
    const result = await auth.login('mfa@zyrp.local', 'password')
    if (result.requiresMfa && result.temporaryToken) {
      setTempToken(result.temporaryToken)
    }
  }

  const handleChallenge = async () => {
    if (tempToken) {
      await auth.challengeMfa(tempToken, '123456')
    }
  }

  return (
    <div>
      <span data-testid="auth-state">{auth.state}</span>
      <button data-testid="btn-login-mfa" onClick={handleLoginMfa}>
        Login MFA
      </button>
      <button data-testid="btn-mfa" onClick={handleChallenge}>
        MFA Challenge
      </button>
    </div>
  )
}

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{ui}</AuthProvider>
    </QueryClientProvider>,
  )
}

describe('AuthProvider', () => {
  it('deduplicates concurrent CSRF initialization requests', async () => {
    let requestCount = 0
    server.use(
      http.get(`${BASE}/auth/csrf/`, () => {
        requestCount += 1
        return HttpResponse.json({ detail: 'CSRF cookie set' })
      }),
    )

    await Promise.all([fetchCsrf(), fetchCsrf()])

    expect(requestCount).toBe(1)
  })

  it('starts in loading state', () => {
    renderWithClient(<TestDisplay />)
    expect(screen.getByTestId('auth-state')).toHaveTextContent('loading')
  })

  it('transitions to authenticated on successful session check', async () => {
    renderWithClient(<TestDisplay />)

    await waitFor(() => {
      expect(screen.getByTestId('auth-state')).toHaveTextContent('authenticated')
    })
    expect(screen.getByTestId('auth-user')).toHaveTextContent('admin@zyrp.local')
    expect(screen.getByTestId('auth-memberships-count')).toHaveTextContent('1')
  })

  it('transitions to anonymous when /me returns 401', async () => {
    server.use(
      http.get(`${BASE}/auth/me/`, () =>
        HttpResponse.json(
          { type: 'about:blank', title: 'Unauthorized', status: 401, detail: 'Not authenticated' },
          { status: 401 },
        ),
      ),
    )

    renderWithClient(<TestDisplay />)

    await waitFor(() => {
      expect(screen.getByTestId('auth-state')).toHaveTextContent('anonymous')
    })
  })

  it('transitions to authenticated on successful login', async () => {
    renderWithClient(<TestDisplay />)

    await waitFor(() => {
      expect(screen.getByTestId('auth-state')).toHaveTextContent('authenticated')
    })

    const user = userEvent.setup()
    await user.click(screen.getByTestId('btn-login'))

    await waitFor(() => {
      expect(screen.getByTestId('auth-state')).toHaveTextContent('authenticated')
    })
  })

  it('transitions to mfa_required when login requires MFA', async () => {
    renderWithClient(<TestMfaFlow />)

    await waitFor(() => {
      expect(screen.getByTestId('auth-state')).toHaveTextContent('authenticated')
    })

    const user = userEvent.setup()
    await user.click(screen.getByTestId('btn-login-mfa'))

    await waitFor(() => {
      expect(screen.getByTestId('auth-state')).toHaveTextContent('mfa_required')
    })
  })

  it('transitions to authenticated after MFA challenge', async () => {
    renderWithClient(<TestMfaFlow />)

    await waitFor(() => {
      expect(screen.getByTestId('auth-state')).toHaveTextContent('authenticated')
    })

    const user = userEvent.setup()
    await user.click(screen.getByTestId('btn-login-mfa'))

    await waitFor(() => {
      expect(screen.getByTestId('auth-state')).toHaveTextContent('mfa_required')
    })

    await user.click(screen.getByTestId('btn-mfa'))

    await waitFor(() => {
      expect(screen.getByTestId('auth-state')).toHaveTextContent('authenticated')
    })
  })

  it('transitions to anonymous on logout', async () => {
    renderWithClient(<TestDisplay />)

    await waitFor(() => {
      expect(screen.getByTestId('auth-state')).toHaveTextContent('authenticated')
    })

    const user = userEvent.setup()
    await user.click(screen.getByTestId('btn-logout'))

    await waitFor(() => {
      expect(screen.getByTestId('auth-state')).toHaveTextContent('anonymous')
    })
  })
})
