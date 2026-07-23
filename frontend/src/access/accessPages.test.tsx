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

import MembersPage from './MembersPage'
import InvitationsPage from './InvitationsPage'

const BASE = '/api/v1'

const authValue: AuthContextValue = {
  state: 'authenticated',
  user: { id: 1, email: 'admin@zyrp.local', name: 'Admin', is_active: true, is_mfa_enabled: false },
  memberships: [{ id: 1, tenant_id: 'tenant-alpha', tenant_name: 'Alpha', role: 'admin' }],
  login: async () => ({ requiresMfa: false }),
  challengeMfa: async () => {},
  logout: async () => {},
}

const tenantValue = {
  selectedTenant: { id: 1, tenant_id: 'tenant-alpha', tenant_name: 'Alpha', role: 'admin' },
  memberships: [{ id: 1, tenant_id: 'tenant-alpha', tenant_name: 'Alpha', role: 'admin' }],
  selectTenant: () => {},
}

const operatorTenantValue = {
  selectedTenant: { id: 1, tenant_id: 'tenant-alpha', tenant_name: 'Alpha', role: 'operator' },
  memberships: [{ id: 1, tenant_id: 'tenant-alpha', tenant_name: 'Alpha', role: 'operator' }],
  selectTenant: () => {},
}

const MEMBERS = {
  count: 3,
  next: null,
  previous: null,
  results: [
    { id: 1, user: { id: 1, email: 'admin@zyrp.local', name: 'Admin' }, role: 'admin', is_active: true, branch_ids: [], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    { id: 2, user: { id: 2, email: 'gerente@zyrp.local', name: 'Gerente' }, role: 'manager', is_active: true, branch_ids: ['branch-1'], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    { id: 3, user: { id: 3, email: 'operador@zyrp.local', name: 'Operador' }, role: 'operator', is_active: false, branch_ids: ['branch-1', 'branch-2'], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  ],
}

const INVITATIONS = {
  count: 2,
  next: null,
  previous: null,
  results: [
    { id: 1, email: 'convite1@zyrp.local', role: 'manager', status: 'pending', expires_at: '2026-08-01T00:00:00Z', created_at: '2026-07-01T00:00:00Z' },
    { id: 2, email: 'convite2@zyrp.local', role: 'operator', status: 'accepted', expires_at: '2026-07-15T00:00:00Z', created_at: '2026-06-01T00:00:00Z' },
  ],
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
}

function renderMembersPage(tValue = tenantValue) {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/access/members']}>
        <AuthContext.Provider value={authValue}>
          <TenantContext.Provider value={tValue}>
            <Routes>
              <Route path="/access/members" element={<MembersPage />} />
            </Routes>
          </TenantContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function renderInvitationsPage() {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/access/invitations']}>
        <AuthContext.Provider value={authValue}>
          <TenantContext.Provider value={tenantValue}>
            <Routes>
              <Route path="/access/invitations" element={<InvitationsPage />} />
            </Routes>
          </TenantContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  server.use(
    http.get(`${BASE}/memberships/`, () => HttpResponse.json(MEMBERS)),
    http.patch(`${BASE}/memberships/:id/`, async ({ request, params }) => {
      const body = await request.json() as { role?: string }
      return HttpResponse.json({
        id: Number(params.id),
        user: { id: 1, email: 'admin@zyrp.local', name: 'Admin' },
        role: body.role ?? 'admin',
        is_active: true,
        branch_ids: [],
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-07-01T00:00:00Z',
      })
    }),
    http.get(`${BASE}/invitations/`, () => HttpResponse.json(INVITATIONS)),
    http.post(`${BASE}/invitations/`, async ({ request }) => {
      const body = await request.json() as { email?: string }
      if (body.email === 'duplicate@zyrp.local') {
        return HttpResponse.json(
          { type: 'about:blank', title: 'Conflict', status: 409, detail: 'Já existe um convite para este email.', code: 'unique_violation' },
          { status: 409 },
        )
      }
      return HttpResponse.json(
        { id: 3, email: body.email, role: 'operator', status: 'pending', expires_at: '2026-08-01T00:00:00Z', created_at: '2026-07-22T00:00:00Z' },
        { status: 201 },
      )
    }),
    http.post(`${BASE}/invitations/:id/resend/`, () =>
      HttpResponse.json({ detail: 'Convite reenviado.' }),
    ),
  )
})

describe('MembersPage', () => {
  it('shows loading state initially', () => {
    server.use(
      http.get(`${BASE}/memberships/`, () => new Promise(() => {})),
    )
    renderMembersPage()
    expect(screen.getByTestId('loading-state')).toBeInTheDocument()
  })

  it('shows list of members', async () => {
    renderMembersPage()
    await waitFor(() => {
      expect(screen.getByText('admin@zyrp.local')).toBeInTheDocument()
    })
    expect(screen.getByText('gerente@zyrp.local')).toBeInTheDocument()
    expect(screen.getByText('operador@zyrp.local')).toBeInTheDocument()
  })

  it('shows role labels in Portuguese', async () => {
    renderMembersPage()
    await waitFor(() => {
      expect(screen.getAllByText('Admin').length).toBeGreaterThanOrEqual(1)
    })
    expect(screen.getAllByText('Gerente').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Operador').length).toBeGreaterThanOrEqual(1)
  })

  it('shows status for each member', async () => {
    renderMembersPage()
    await waitFor(() => {
      const activeLabels = screen.getAllByText('Ativo')
      expect(activeLabels).toHaveLength(2)
    })
    expect(screen.getByText('Inativo')).toBeInTheDocument()
  })

  it('shows empty state when no members', async () => {
    server.use(
      http.get(`${BASE}/memberships/`, () =>
        HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
      ),
    )
    renderMembersPage()
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })
  })

  it('can update member role via inline edit form', async () => {
    renderMembersPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('admin@zyrp.local')).toBeInTheDocument()
    })

    const editButtons = screen.getAllByRole('button', { name: /editar/i })
    await user.click(editButtons[0])

    expect(screen.getByTestId('member-edit-form')).toBeInTheDocument()

    const roleSelect = screen.getByLabelText(/função/i)
    await user.selectOptions(roleSelect, 'manager')
    await user.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() => {
      expect(screen.queryByTestId('member-edit-form')).not.toBeInTheDocument()
    })
  })

  it('does not show Editar button when current user role is operator', async () => {
    renderMembersPage(operatorTenantValue)
    await waitFor(() => {
      expect(screen.getByText('admin@zyrp.local')).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /editar/i })).not.toBeInTheDocument()
  })

  it('shows error message on 403 when updating member', async () => {
    server.use(
      http.patch(`${BASE}/memberships/:id/`, () =>
        HttpResponse.json(
          { type: 'about:blank', title: 'Forbidden', status: 403, detail: 'Você não tem permissão para alterar membros.' },
          { status: 403 },
        ),
      ),
    )
    renderMembersPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('admin@zyrp.local')).toBeInTheDocument()
    })

    const editButtons = screen.getAllByRole('button', { name: /editar/i })
    await user.click(editButtons[0])

    const roleSelect = screen.getByLabelText(/função/i)
    await user.selectOptions(roleSelect, 'manager')
    await user.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() => {
      expect(screen.getByTestId('form-error')).toHaveTextContent(/não tem permissão/i)
    })
  })
})

describe('InvitationsPage', () => {
  it('shows loading state initially', () => {
    server.use(
      http.get(`${BASE}/invitations/`, () => new Promise(() => {})),
    )
    renderInvitationsPage()
    expect(screen.getByTestId('loading-state')).toBeInTheDocument()
  })

  it('shows list of invitations', async () => {
    renderInvitationsPage()
    await waitFor(() => {
      expect(screen.getByText('convite1@zyrp.local')).toBeInTheDocument()
    })
    expect(screen.getByText('convite2@zyrp.local')).toBeInTheDocument()
  })

  it('shows status labels in Portuguese', async () => {
    renderInvitationsPage()
    await waitFor(() => {
      expect(screen.getAllByText('Pendente').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('Aceito').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('shows empty state when no invitations', async () => {
    server.use(
      http.get(`${BASE}/invitations/`, () =>
        HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
      ),
    )
    renderInvitationsPage()
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })
  })

  it('can create invitation and closes form on success', async () => {
    renderInvitationsPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('convite1@zyrp.local')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /novo convite/i }))
    expect(screen.getByTestId('invitation-form')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/email/i), 'novo@zyrp.local')
    await user.selectOptions(screen.getByLabelText(/função/i), 'manager')
    await user.click(screen.getByRole('button', { name: /convidar/i }))

    await waitFor(() => {
      expect(screen.queryByTestId('invitation-form')).not.toBeInTheDocument()
    })
  })

  it('shows validation error for empty email', async () => {
    renderInvitationsPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('convite1@zyrp.local')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /novo convite/i }))
    await user.click(screen.getByRole('button', { name: /convidar/i }))

    await waitFor(() => {
      expect(screen.getByText(/Email inválido/i)).toBeInTheDocument()
    })
  })

  it('shows error on 409 conflict for duplicate email', async () => {
    renderInvitationsPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('convite1@zyrp.local')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /novo convite/i }))
    await user.type(screen.getByLabelText(/email/i), 'duplicate@zyrp.local')
    await user.selectOptions(screen.getByLabelText(/função/i), 'operator')
    await user.click(screen.getByRole('button', { name: /convidar/i }))

    await waitFor(() => {
      expect(screen.getByTestId('form-error')).toHaveTextContent(/já existe/i)
    })
  })

  it('can resend invitation', async () => {
    renderInvitationsPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('convite1@zyrp.local')).toBeInTheDocument()
    })

    const resendButtons = screen.getAllByRole('button', { name: /reenviar/i })
    expect(resendButtons).toHaveLength(1)

    await user.click(resendButtons[0])
    await waitFor(() => {
      expect(screen.getByText('convite1@zyrp.local')).toBeInTheDocument()
    })
  })
})
