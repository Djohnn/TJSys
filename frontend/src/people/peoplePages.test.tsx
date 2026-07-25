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

import PeoplePage from './PeoplePage'
import PersonDetailPage from './PersonDetailPage'

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

const operatorTenantValue = {
  selectedTenant: { id: 1, tenant_id: 'tenant-alpha', tenant_name: 'Alpha', role: 'operator' },
  memberships: [{ id: 1, tenant_id: 'tenant-alpha', tenant_name: 'Alpha', role: 'operator' }],
  selectTenant: () => {},
}

const PEOPLE_ALL = {
  count: 3,
  next: null,
  previous: null,
  results: [
    { id: 'p1', person_type: 'PF', name: 'João Silva', document: '123.456.789-00', role: 'customer', is_active: true },
    { id: 'p2', person_type: 'PJ', name: 'Empresa ABC Ltda', document: '11.222.333/0001-44', role: 'supplier', is_active: true },
    { id: 'p3', person_type: 'PF', name: 'Maria Oliveira', document: '987.654.321-00', role: 'employee', is_active: false },
  ],
}

const PEOPLE_SEARCH = {
  count: 1,
  next: null,
  previous: null,
  results: [
    { id: 'p1', person_type: 'PF', name: 'João Silva', document: '123.456.789-00', role: 'customer', is_active: true },
  ],
}

const PEOPLE_FILTERED_ROLE = {
  count: 1,
  next: null,
  previous: null,
  results: [
    { id: 'p2', person_type: 'PJ', name: 'Empresa ABC Ltda', document: '11.222.333/0001-44', role: 'supplier', is_active: true },
  ],
}

const PEOPLE_FILTERED_ACTIVE = {
  count: 1,
  next: null,
  previous: null,
  results: [
    { id: 'p3', person_type: 'PF', name: 'Maria Oliveira', document: '987.654.321-00', role: 'employee', is_active: false },
  ],
}

function createPersonDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    person_type: 'PF',
    name: 'João Silva',
    cpf: '123.456.789-00',
    rg: '12.345.678-9',
    company_name: null,
    trade_name: null,
    cnpj: null,
    ie: null,
    role: 'customer',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    addresses: [
      { id: 'addr-1', street: 'Rua A', number: '100', complement: 'Apto 1', neighborhood: 'Centro', city: 'São Paulo', state: 'SP', zip: '01001-000', is_primary: true },
      { id: 'addr-2', street: 'Rua B', number: '200', complement: '', neighborhood: 'Vila Nova', city: 'São Paulo', state: 'SP', zip: '02002-000', is_primary: false },
    ],
    contacts: [
      { id: 'cont-1', type: 'phone', value: '(11) 99999-8888', is_primary: true },
      { id: 'cont-2', type: 'email', value: 'joao@email.com', is_primary: false },
    ],
    consents: [
      { id: 'cons-1', type: 'privacy_policy', granted_at: '2026-01-01T00:00:00Z', revoked_at: null },
      { id: 'cons-2', type: 'marketing', granted_at: '2026-01-15T00:00:00Z', revoked_at: '2026-06-01T00:00:00Z' },
    ],
    ...overrides,
  }
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
}

function renderPeoplePage(initialRoute = '/people', tValue = tenantValue, piiPermission = true) {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <AuthContext.Provider value={authValue}>
          <TenantContext.Provider value={tValue}>
            <Routes>
              <Route path="/people" element={<PeoplePage hasPiiPermission={piiPermission} />} />
              <Route path="/people/:id" element={<PersonDetailPage hasPiiPermission={piiPermission} />} />
            </Routes>
          </TenantContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  server.use(
    http.get(`${BASE}/people/`, ({ request }) => {
      const url = new URL(request.url)
      const q = url.searchParams.get('q')
      const role = url.searchParams.get('role')
      const active = url.searchParams.get('active')
      if (q) return HttpResponse.json(PEOPLE_SEARCH)
      if (role) return HttpResponse.json(PEOPLE_FILTERED_ROLE)
      if (active) return HttpResponse.json(PEOPLE_FILTERED_ACTIVE)
      return HttpResponse.json(PEOPLE_ALL)
    }),

    http.post(`${BASE}/people/`, async ({ request }) => {
      const body = (await request.json()) as { name?: string; person_type?: string }
      if (!body.name && body.person_type === 'PF') {
        return HttpResponse.json(
          { type: 'about:blank', title: 'Validation Error', status: 422, detail: 'Invalid input', errors: { name: ['Nome é obrigatório.'] } },
          { status: 422 },
        )
      }
      return HttpResponse.json(
        { id: 'p-new', person_type: body.person_type ?? 'PF', name: body.name ?? 'New Person', document: '', role: 'customer', is_active: true },
        { status: 201 },
      )
    }),

    http.get(`${BASE}/people/:id/`, ({ params }) => {
      if (params.id === 'p-not-found') {
        return HttpResponse.json(
          { type: 'about:blank', title: 'Not Found', status: 404, detail: 'Pessoa não encontrada.' },
          { status: 404 },
        )
      }
      return HttpResponse.json(createPersonDetail())
    }),

    http.patch(`${BASE}/people/:id/`, async ({ request, params }) => {
      const body = (await request.json()) as Record<string, unknown>
      return HttpResponse.json({ ...createPersonDetail(), id: params.id, ...body })
    }),

    http.post(`${BASE}/people/:id/deactivate/`, ({ params }) => {
      if (params.id === 'p-fail-deactivate') {
        return HttpResponse.json(
          { type: 'about:blank', title: 'Conflict', status: 409, detail: 'Não é possível desativar esta pessoa.', code: 'cannot_deactivate' },
          { status: 409 },
        )
      }
      return HttpResponse.json({ detail: 'Pessoa desativada com sucesso.' })
    }),

    http.post(`${BASE}/people/:id/consents/`, async ({ request }) => {
      const body = (await request.json()) as { type?: string }
      return HttpResponse.json(
        { id: 'cons-new', type: body.type, granted_at: '2026-07-22T00:00:00Z', revoked_at: null },
        { status: 201 },
      )
    }),

    http.post(`${BASE}/people/:id/consents/:consentId/revoke/`, ({ params }) => {
      return HttpResponse.json(
        { id: params.consentId, type: 'privacy_policy', granted_at: '2026-01-01T00:00:00Z', revoked_at: '2026-07-22T00:00:00Z' },
      )
    }),

    http.post(`${BASE}/people/:personId/addresses/`, async ({ request }) => {
      const body = (await request.json()) as { street?: string }
      if (!body.street) {
        return HttpResponse.json(
          { type: 'about:blank', title: 'Validation Error', status: 422, detail: 'Invalid input', errors: { street: ['Logradouro é obrigatório.'] } },
          { status: 422 },
        )
      }
      return HttpResponse.json(
        { id: 'addr-new', ...body, complement: '', is_primary: false },
        { status: 201 },
      )
    }),

    http.patch(`${BASE}/people/:personId/addresses/:addressId/`, async ({ request, params }) => {
      const body = (await request.json()) as Record<string, unknown>
      return HttpResponse.json({ id: params.addressId, ...body })
    }),

    http.post(`${BASE}/people/:personId/contacts/`, async ({ request }) => {
      const body = (await request.json()) as { value?: string }
      if (!body.value) {
        return HttpResponse.json(
          { type: 'about:blank', title: 'Validation Error', status: 422, detail: 'Invalid input', errors: { value: ['Valor é obrigatório.'] } },
          { status: 422 },
        )
      }
      return HttpResponse.json(
        { id: 'cont-new', ...body, is_primary: false },
        { status: 201 },
      )
    }),

    http.patch(`${BASE}/people/:personId/contacts/:contactId/`, async ({ request, params }) => {
      const body = (await request.json()) as Record<string, unknown>
      return HttpResponse.json({ id: params.contactId, ...body })
    }),
  )
})

describe('PeoplePage', () => {
  it('shows loading state initially', () => {
    server.use(
      http.get(`${BASE}/people/`, () => new Promise(() => {})),
    )
    renderPeoplePage()
    expect(screen.getByTestId('loading-state')).toBeInTheDocument()
  })

  it('displays person list', async () => {
    renderPeoplePage()
    await waitFor(() => {
      expect(screen.getByText('João Silva')).toBeInTheDocument()
    })
    expect(screen.getByText('Empresa ABC Ltda')).toBeInTheDocument()
    expect(screen.getByText('Maria Oliveira')).toBeInTheDocument()
  })

  it('searches people by name', async () => {
    renderPeoplePage('/people?q=João')
    await waitFor(() => {
      expect(screen.getByText('João Silva')).toBeInTheDocument()
    })
    expect(screen.queryByText('Empresa ABC Ltda')).not.toBeInTheDocument()
  })

  it('filters people by role', async () => {
    renderPeoplePage('/people?role=supplier')
    await waitFor(() => {
      expect(screen.getByText('Empresa ABC Ltda')).toBeInTheDocument()
    })
    expect(screen.queryByText('João Silva')).not.toBeInTheDocument()
  })

  it('filters people by active status', async () => {
    renderPeoplePage('/people?active=false')
    await waitFor(() => {
      expect(screen.getByText('Maria Oliveira')).toBeInTheDocument()
    })
    expect(screen.queryByText('João Silva')).not.toBeInTheDocument()
  })

  it('shows empty state when no people', async () => {
    server.use(
      http.get(`${BASE}/people/`, () =>
        HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
      ),
    )
    renderPeoplePage()
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })
  })

  it('creates a new person and closes form on success', async () => {
    renderPeoplePage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('João Silva')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /nova pessoa/i }))
    expect(screen.getByTestId('person-form')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/nome/i), 'João Teste')
    await user.type(screen.getByLabelText(/cpf/i), '12345678900')
    await user.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() => {
      expect(screen.queryByTestId('person-form')).not.toBeInTheDocument()
    })
  })

  it('shows validation error for missing PF required fields', async () => {
    renderPeoplePage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('João Silva')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /nova pessoa/i }))
    await user.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() => {
      expect(screen.getByText(/Nome é obrigatório/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/CPF é obrigatório/i)).toBeInTheDocument()
  })

  it('masks documents for users without PII permission', async () => {
    renderPeoplePage('/people', operatorTenantValue, false)
    await waitFor(() => {
      expect(screen.getByText('João Silva')).toBeInTheDocument()
    })
    expect(screen.getByText(/900$/)).toBeInTheDocument()
    expect(screen.queryByText('123.456.789-00')).not.toBeInTheDocument()
  })
})

describe('PersonForm', () => {
  it('shows PF fields by default', async () => {
    renderPeoplePage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('João Silva')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /nova pessoa/i }))
    expect(screen.getByTestId('person-form')).toBeInTheDocument()

    expect(screen.getByLabelText(/nome/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/cpf/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/rg/i)).toBeInTheDocument()
  })

  it('shows PJ fields when type is changed', async () => {
    renderPeoplePage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('João Silva')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /nova pessoa/i }))
    await user.selectOptions(screen.getByLabelText(/tipo/i), 'PJ')

    expect(screen.getByLabelText(/razão social/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/nome fantasia/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/cnpj/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/inscrição estadual/i)).toBeInTheDocument()
  })

  it('validates PJ required fields', async () => {
    renderPeoplePage()
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('João Silva')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /nova pessoa/i }))
    await user.selectOptions(screen.getByLabelText(/tipo/i), 'PJ')
    await user.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() => {
      expect(screen.getByText(/Razão Social é obrigatória/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/Nome Fantasia é obrigatório/i)).toBeInTheDocument()
    expect(screen.getByText(/CNPJ é obrigatório/i)).toBeInTheDocument()
  })
})

describe('PersonDetailPage', () => {
  it('displays person info', async () => {
    renderPeoplePage('/people/p1')
    await waitFor(() => {
      expect(screen.getByTestId('person-detail-page')).toBeInTheDocument()
    })
    expect(screen.getAllByText('João Silva').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/Pessoa Física/)).toBeInTheDocument()
    expect(screen.getByText(/123.456.789-00/)).toBeInTheDocument()
  })

  it('shows addresses section', async () => {
    renderPeoplePage('/people/p1')
    await waitFor(() => {
      expect(screen.getByTestId('addresses-section')).toBeInTheDocument()
    })
    expect(screen.getByText(/Rua A/)).toBeInTheDocument()
    expect(screen.getAllByText(/100/).length).toBeGreaterThanOrEqual(1)
  })

  it('shows contacts section', async () => {
    renderPeoplePage('/people/p1')
    await waitFor(() => {
      expect(screen.getByTestId('contacts-section')).toBeInTheDocument()
    })
    expect(screen.getByText(/\(11\) 99999-8888/)).toBeInTheDocument()
    expect(screen.getByText(/joao@email.com/)).toBeInTheDocument()
  })

  it('shows consents section', async () => {
    renderPeoplePage('/people/p1')
    await waitFor(() => {
      expect(screen.getByTestId('consents-section')).toBeInTheDocument()
    })
    expect(screen.getByText(/Política de Privacidade/)).toBeInTheDocument()
  })

  it('shows deactivate confirmation dialog', async () => {
    renderPeoplePage('/people/p1')
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('person-detail-page')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('deactivate-btn'))
    expect(screen.getByTestId('deactivate-confirm')).toBeInTheDocument()
  })

  it('shows deactivate success message', async () => {
    renderPeoplePage('/people/p1')
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('person-detail-page')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('deactivate-btn'))
    await user.click(screen.getByTestId('confirm-deactivate-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('deactivate-success')).toBeInTheDocument()
    })
  })

  it('shows error when deactivate fails', async () => {
    renderPeoplePage('/people/p-fail-deactivate')
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('person-detail-page')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('deactivate-btn'))
    await user.click(screen.getByTestId('confirm-deactivate-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('deactivate-error')).toBeInTheDocument()
    })
  })

  it('returns 404 for cross-tenant access', async () => {
    renderPeoplePage('/people/p-not-found')
    await waitFor(() => {
      expect(screen.getByTestId('error-state')).toBeInTheDocument()
    })
  })

  it('masks PII fields for operator role', async () => {
    renderPeoplePage('/people/p1', operatorTenantValue, false)
    await waitFor(() => {
      expect(screen.getByTestId('person-detail-page')).toBeInTheDocument()
    })
    expect(screen.getByText(/900$/)).toBeInTheDocument()
    expect(screen.queryByText(/123.456.789-00/)).not.toBeInTheDocument()
  })
})

describe('AddressesSection', () => {
  it('adds a new address', async () => {
    renderPeoplePage('/people/p1')
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('addresses-section')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /adicionar endereço/i }))
    expect(screen.getByTestId('address-form')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/logradouro/i), 'Rua Teste')
    await user.type(screen.getByLabelText(/número/i), '500')
    await user.type(screen.getByLabelText(/bairro/i), 'Centro')
    await user.type(screen.getByLabelText(/cidade/i), 'São Paulo')
    await user.type(screen.getByLabelText(/estado/i), 'SP')
    await user.type(screen.getByLabelText(/cep/i), '01001-000')
    await user.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() => {
      expect(screen.queryByTestId('address-form')).not.toBeInTheDocument()
    })
  })

  it('edits an existing address', async () => {
    renderPeoplePage('/people/p1')
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('addresses-section')).toBeInTheDocument()
    })

    const editButtons = screen.getAllByRole('button', { name: /editar/i })
    await user.click(editButtons[0])

    expect(screen.getByTestId('address-form')).toBeInTheDocument()
    const streetInput = screen.getByLabelText(/logradouro/i)
    await user.clear(streetInput)
    await user.type(streetInput, 'Rua Editada')
    await user.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() => {
      expect(screen.queryByTestId('address-form')).not.toBeInTheDocument()
    })
  })
})

describe('ContactsSection', () => {
  it('adds a new contact', async () => {
    renderPeoplePage('/people/p1')
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('contacts-section')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /adicionar contato/i }))
    expect(screen.getByTestId('contact-form')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/valor/i), '11988887777')
    await user.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() => {
      expect(screen.queryByTestId('contact-form')).not.toBeInTheDocument()
    })
  })

  it('edits an existing contact', async () => {
    renderPeoplePage('/people/p1')
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('contacts-section')).toBeInTheDocument()
    })

    const contactsSection = screen.getByTestId('contacts-section')
    const editButtons = contactsSection.querySelectorAll('button')
    await user.click(editButtons[0] as HTMLElement)

    expect(screen.getByTestId('contact-form')).toBeInTheDocument()
    const valueInput = screen.getByLabelText(/valor/i)
    await user.clear(valueInput)
    await user.type(valueInput, 'novo@email.com')
    await user.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() => {
      expect(screen.queryByTestId('contact-form')).not.toBeInTheDocument()
    })
  })
})

describe('ConsentsSection', () => {
  it('grants a new consent', async () => {
    renderPeoplePage('/people/p1')
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('consents-section')).toBeInTheDocument()
    })

    const select = screen.getByLabelText(/conceder consentimento/i)
    await user.selectOptions(select, 'terms_of_service')
    expect(screen.getByText(/Termos de Serviço/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /confirmar/i }))
  })

  it('revokes a consent with confirmation', async () => {
    renderPeoplePage('/people/p1')
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('consents-section')).toBeInTheDocument()
    })

    const revokeBtn = screen.getAllByRole('button', { name: /revogar/i })
    expect(revokeBtn.length).toBeGreaterThanOrEqual(1)
    await user.click(revokeBtn[0])

    expect(screen.getByText(/tem certeza/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /sim, revogar/i }))
  })

  it('shows revoked consents with strikethrough', async () => {
    renderPeoplePage('/people/p1')
    await waitFor(() => {
      expect(screen.getByTestId('consents-section')).toBeInTheDocument()
    })

    const consentRows = screen.getAllByTestId('consent-row')
    const revokedRow = consentRows[1]
    expect(revokedRow.style.textDecoration).toBe('line-through')
  })
})
