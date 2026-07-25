import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, test, vi } from 'vitest'

import type { AuthContextValue } from './AuthProvider'

const mockUseAuth = vi.fn()

vi.mock('./AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}))

function renderProtected(state: AuthContextValue['state']) {
  mockUseAuth.mockReturnValue({
    state,
    user: null,
    memberships: [],
    login: vi.fn(),
    challengeMfa: vi.fn(),
    verifyRecovery: vi.fn(),
    logout: vi.fn(),
  } satisfies AuthContextValue)

  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/login" element={<div data-testid="login-page">Login</div>} />
        <Route path="/mfa" element={<div data-testid="mfa-page">MFA</div>} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <div data-testid="protected-content">Secret</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

import ProtectedRoute from './ProtectedRoute'

describe('ProtectedRoute', () => {
  test('redirects to /login when anonymous', () => {
    renderProtected('anonymous')
    expect(screen.getByTestId('login-page')).toBeInTheDocument()
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
  })

  test('redirects to /mfa when mfa_required', () => {
    renderProtected('mfa_required')
    expect(screen.getByTestId('mfa-page')).toBeInTheDocument()
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
  })

  test('renders children when authenticated', () => {
    mockUseAuth.mockReturnValue({
      state: 'authenticated',
      user: { id: 1, email: 'test@test.com', name: 'Test', is_active: true, is_mfa_enabled: false },
      memberships: [],
      login: vi.fn(),
      challengeMfa: vi.fn(),
      verifyRecovery: vi.fn(),
      logout: vi.fn(),
    } satisfies AuthContextValue)

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<ProtectedRoute><div data-testid="protected-content">Secret</div></ProtectedRoute>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('protected-content')).toHaveTextContent('Secret')
  })

  test('shows spinner when loading', () => {
    renderProtected('loading')
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument()
  })
})
