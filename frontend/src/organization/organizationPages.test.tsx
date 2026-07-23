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

import CompaniesPage from './CompaniesPage'
import BranchesPage from './BranchesPage'

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

const orgValue = {
  companies: [],
  branches: [],
  currentCompany: null,
  currentBranch: null,
  setCurrentBranch: () => {},
  isLoading: false,
}

const COMPANIES_PAGE_1 = {
  count: 3,
  next: `${BASE}/companies/?page=2`,
  previous: null,
  results: [
    { id: 'c1', name: 'Matriz', cnpj: '11.222.333/0001-44', ie: '123', address_json: {}, is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    { id: 'c2', name: 'Filial Norte', cnpj: '22.333.444/0001-55', ie: '456', address_json: {}, is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    { id: 'c3', name: 'Filial Sul', cnpj: '33.444.555/0001-66', ie: '789', address_json: {}, is_active: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  ],
}

const COMPANIES_PAGE_2 = {
  count: 4,
  next: null,
  previous: `${BASE}/companies/?page=1`,
  results: [
    { id: 'c4', name: 'Nova Matriz', cnpj: '', ie: '', address_json: {}, is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  ],
}

const BRANCHES = {
  count: 2,
  next: null,
  previous: null,
  results: [
    { id: 'b1', company: 'c1', company_name: 'Matriz', name: 'Centro', is_active: true, ie: '', address_json: {}, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    { id: 'b2', company: 'c1', company_name: 'Matriz', name: 'Shopping', is_active: false, ie: '', address_json: {}, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  ],
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
}

function renderCompaniesPage(initialRoute = '/organization/companies') {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <AuthContext.Provider value={authValue}>
          <TenantContext.Provider value={tenantValue}>
            <OrganizationContext.Provider value={orgValue}>
              <Routes>
                <Route path="/organization/companies" element={<CompaniesPage />} />
              </Routes>
            </OrganizationContext.Provider>
          </TenantContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function renderBranchesPage() {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/organization/branches']}>
        <AuthContext.Provider value={authValue}>
          <TenantContext.Provider value={tenantValue}>
            <OrganizationContext.Provider value={orgValue}>
              <Routes>
                <Route path="/organization/branches" element={<BranchesPage />} />
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
    http.get(`${BASE}/companies/`, ({ request }) => {
      const url = new URL(request.url)
      const page = url.searchParams.get('page')
      if (page === '2') return HttpResponse.json(COMPANIES_PAGE_2)
      return HttpResponse.json(COMPANIES_PAGE_1)
    }),
    http.post(`${BASE}/companies/`, async ({ request }) => {
      const body = await request.json() as { name?: string }
      if (!body.name) {
        return HttpResponse.json(
          { type: 'about:blank', title: 'Validation Error', status: 422, detail: 'Invalid input', errors: { name: ['Este campo é obrigatório.'] } },
          { status: 422 },
        )
      }
      if (body.name === 'Duplicada') {
        return HttpResponse.json(
          { type: 'about:blank', title: 'Conflict', status: 409, detail: 'Já existe uma empresa com este nome.', code: 'unique_violation' },
          { status: 409 },
        )
      }
      return HttpResponse.json(
        { id: 'c-new', name: body.name, cnpj: '', ie: '', address_json: {}, is_active: true, created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z' },
        { status: 201 },
      )
    }),
    http.patch(`${BASE}/companies/:id/`, async ({ request, params }) => {
      const body = await request.json() as { name?: string }
      if (!body.name) {
        return HttpResponse.json(
          { type: 'about:blank', title: 'Validation Error', status: 422, detail: 'Invalid input', errors: { name: ['Este campo é obrigatório.'] } },
          { status: 422 },
        )
      }
      return HttpResponse.json(
        { id: params.id, ...body, cnpj: '', ie: '', address_json: {}, is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z' },
      )
    }),
    http.get(`${BASE}/companies/:id/`, ({ params }) =>
      HttpResponse.json({
        id: params.id,
        name: params.id === 'c1' ? 'Matriz' : 'Unknown',
        cnpj: '11.222.333/0001-44',
        ie: '123',
        address_json: {},
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      }),
    ),
    http.get(`${BASE}/branches/`, () => HttpResponse.json(BRANCHES)),
    http.post(`${BASE}/branches/`, async ({ request }) => {
      const body = await request.json() as { name?: string; company?: string }
      if (!body.name) {
        return HttpResponse.json(
          { type: 'about:blank', title: 'Validation Error', status: 422, detail: 'Invalid input', errors: { name: ['Este campo é obrigatório.'] } },
          { status: 422 },
        )
      }
      if (body.name === 'Conflito') {
        return HttpResponse.json(
          { type: 'about:blank', title: 'Conflict', status: 409, detail: 'Já existe uma filial com este nome.', code: 'unique_violation' },
          { status: 409 },
        )
      }
      return HttpResponse.json(
        { id: 'b-new', company: body.company, company_name: 'Matriz', name: body.name, is_active: true, ie: '', address_json: {}, created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z' },
        { status: 201 },
      )
    }),
    http.patch(`${BASE}/branches/:id/`, async ({ request, params }) => {
      const body = await request.json() as { name?: string }
      return HttpResponse.json(
        { id: params.id, company: 'c1', company_name: 'Matriz', ...body, is_active: true, ie: '', address_json: {}, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z' },
      )
    }),
  )
})

describe('CompaniesPage', () => {
  it('shows loading state initially', () => {
    server.use(
      http.get(`${BASE}/companies/`, () => new Promise(() => {})),
    )
    renderCompaniesPage()
    expect(screen.getByTestId('loading-state')).toBeInTheDocument()
  })

  it('displays company list', async () => {
    renderCompaniesPage()
    await waitFor(() => {
      expect(screen.getByText('Matriz')).toBeInTheDocument()
    })
    expect(screen.getByText('Filial Norte')).toBeInTheDocument()
    expect(screen.getByText('Filial Sul')).toBeInTheDocument()
  })

  it('shows CNPJ and status for each company', async () => {
    renderCompaniesPage()
    await waitFor(() => {
      expect(screen.getByText('11.222.333/0001-44')).toBeInTheDocument()
    })
    const activeLabels = screen.getAllByText('Ativo')
    expect(activeLabels).toHaveLength(2)
    expect(screen.getByText('Inativo')).toBeInTheDocument()
  })

  it('shows empty state when no companies', async () => {
    server.use(
      http.get(`${BASE}/companies/`, () =>
        HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
      ),
    )
    renderCompaniesPage()
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })
  })

  it('paginates with many companies', async () => {
    const manyResults = Array.from({ length: 30 }, (_, i) => ({
      id: `c-big-${i}`,
      name: `Empresa ${i + 1}`,
      cnpj: '',
      ie: '',
      address_json: {},
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }))
    server.use(
      http.get(`${BASE}/companies/`, ({ request }) => {
        const url = new URL(request.url)
        const page = url.searchParams.get('page')
        if (page === '2') {
          return HttpResponse.json({ count: 30, next: null, previous: `${BASE}/companies/?page=1`, results: manyResults.slice(25) })
        }
        return HttpResponse.json({ count: 30, next: `${BASE}/companies/?page=2`, previous: null, results: manyResults.slice(0, 25) })
      }),
    )
    renderCompaniesPage()
    await waitFor(() => {
      expect(screen.getByText('Empresa 1')).toBeInTheDocument()
    })
    expect(screen.getByText(/página 1 de 2/i)).toBeInTheDocument()

    const nextBtn = screen.getByRole('button', { name: /próxima/i })
    const user = userEvent.setup()
    await user.click(nextBtn)

    await waitFor(() => {
      expect(screen.getByText('Empresa 26')).toBeInTheDocument()
    })
    expect(screen.getByText(/página 2 de 2/i)).toBeInTheDocument()
  })

  it('creates a new company via form and closes form on success', async () => {
    renderCompaniesPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Matriz')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /nova empresa/i }))
    expect(screen.getByTestId('company-form')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/nome/i), 'Empresa Teste')
    await user.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() => {
      expect(screen.queryByTestId('company-form')).not.toBeInTheDocument()
    })
  })

  it('shows validation error for empty name', async () => {
    renderCompaniesPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Matriz')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /nova empresa/i }))
    await user.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() => {
      expect(screen.getByText(/Nome é obrigatório/i)).toBeInTheDocument()
    })
  })

  it('shows error on 409 conflict', async () => {
    renderCompaniesPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Matriz')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /nova empresa/i }))
    await user.type(screen.getByLabelText(/nome/i), 'Duplicada')
    await user.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() => {
      expect(screen.getByTestId('form-error')).toHaveTextContent(/já existe/i)
    })
  })

  it('edits a company name and closes form on success', async () => {
    renderCompaniesPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Matriz')).toBeInTheDocument()
    })

    const editButtons = screen.getAllByRole('button', { name: /editar/i })
    await user.click(editButtons[0])

    expect(screen.getByTestId('company-form')).toBeInTheDocument()
    const nameInput = screen.getByLabelText(/nome/i)
    await user.clear(nameInput)
    await user.type(nameInput, 'Matriz Editada')
    await user.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() => {
      expect(screen.queryByTestId('company-form')).not.toBeInTheDocument()
    })
  })
})

describe('BranchesPage', () => {
  it('shows loading state initially', () => {
    server.use(
      http.get(`${BASE}/branches/`, () => new Promise(() => {})),
    )
    renderBranchesPage()
    expect(screen.getByTestId('loading-state')).toBeInTheDocument()
  })

  it('displays branch list', async () => {
    renderBranchesPage()
    await waitFor(() => {
      expect(screen.getByText('Centro')).toBeInTheDocument()
    })
    expect(screen.getByText('Shopping')).toBeInTheDocument()
  })

  it('shows company name for each branch', async () => {
    renderBranchesPage()
    await waitFor(() => {
      const rows = screen.getAllByTestId('branch-row')
      expect(rows[0]).toHaveTextContent('Matriz')
      expect(rows[0]).toHaveTextContent('Centro')
    })
  })

  it('shows empty state when no branches', async () => {
    server.use(
      http.get(`${BASE}/branches/`, () =>
        HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
      ),
    )
    renderBranchesPage()
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })
  })

  it('creates a new branch and closes form on success', async () => {
    renderBranchesPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Centro')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /nova filial/i }))
    expect(screen.getByTestId('branch-form')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText(/empresa/i), 'c1')
    await user.type(screen.getByLabelText(/nome/i), 'Filial Nova')
    await user.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() => {
      expect(screen.queryByTestId('branch-form')).not.toBeInTheDocument()
    })
  })

  it('shows validation error for empty branch name', async () => {
    renderBranchesPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Centro')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /nova filial/i }))
    await user.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() => {
      expect(screen.getByText(/Empresa é obrigatória/i)).toBeInTheDocument()
    })
  })

  it('shows error on 409 conflict for branch', async () => {
    renderBranchesPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Centro')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /nova filial/i }))
    await user.selectOptions(screen.getByLabelText(/empresa/i), 'c1')
    await user.type(screen.getByLabelText(/nome/i), 'Conflito')
    await user.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() => {
      expect(screen.getByTestId('form-error')).toHaveTextContent(/já existe/i)
    })
  })

  it('edits a branch name and closes form on success', async () => {
    renderBranchesPage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Centro')).toBeInTheDocument()
    })

    const editButtons = screen.getAllByRole('button', { name: /editar/i })
    await user.click(editButtons[0])

    expect(screen.getByTestId('branch-form')).toBeInTheDocument()
    const nameInput = screen.getByLabelText(/nome/i)
    await user.clear(nameInput)
    await user.type(nameInput, 'Centro Editado')
    await user.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() => {
      expect(screen.queryByTestId('branch-form')).not.toBeInTheDocument()
    })
  })
})
