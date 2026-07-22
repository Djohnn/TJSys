import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, it, expect, beforeEach } from 'vitest'

import { AuthContext } from '@/auth/AuthProvider'
import type { AuthContextValue } from '@/auth/AuthProvider'
import { TenantContext } from '@/tenant/TenantProvider'
import type { TenantContextValue } from '@/tenant/TenantProvider'
import { server } from '@/test/server'

import ReturnDialog from './ReturnDialog'
import CancellationDialog from './CancellationDialog'
import RefundDialog from './RefundDialog'

const BASE = '/api/v1'

const authValue: AuthContextValue = {
  state: 'authenticated',
  user: { id: 1, email: 'admin@zyrp.local', name: 'Admin', is_active: true, is_mfa_enabled: false },
  memberships: [{ id: 1, tenant_id: 'tenant-alpha', tenant_name: 'Alpha', role: 'admin' }],
  login: async () => ({ requiresMfa: false }),
  challengeMfa: async () => {},
  logout: async () => {},
}

const tenantValue: TenantContextValue = {
  selectedTenant: { id: 1, tenant_id: 'tenant-alpha', tenant_name: 'Alpha', role: 'admin' },
  memberships: [{ id: 1, tenant_id: 'tenant-alpha', tenant_name: 'Alpha', role: 'admin' }],
  selectTenant: () => {},
}

const SALE_DETAIL = {
  id: 'sale-1',
  number: 'V-001',
  status: 'completed',
  customer_name: 'Cliente A',
  branch_name: 'Centro',
  total: '150.00',
  created_at: '2026-07-22T10:00:00Z',
  items: [
    { id: 'sale-item-1', product: 'prod-1', product_name: 'Parafuso', quantity: '10', unit_price: '10.00', total: '100.00' },
    { id: 'sale-item-2', product: 'prod-2', product_name: 'Porca', quantity: '5', unit_price: '10.00', total: '50.00' },
  ],
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
}

function renderWithProviders(element: React.ReactElement) {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={authValue}>
        <TenantContext.Provider value={tenantValue}>
          {element}
        </TenantContext.Provider>
      </AuthContext.Provider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  server.use(
    http.get(`${BASE}/sales/sale-1/`, () =>
      HttpResponse.json(SALE_DETAIL),
    ),
    http.post(`${BASE}/sales/sale-1/return/`, async ({ request }) => {
      const body = await request.json() as { items?: unknown[]; reason?: string }
      if (!body.items || body.items.length === 0 || !body.reason?.trim()) {
        return HttpResponse.json(
          { type: 'about:blank', title: 'Validation Error', status: 422, detail: 'Invalid input', errors: { reason: !body.reason?.trim() ? ['Este campo é obrigatório.'] : undefined } },
          { status: 422 },
        )
      }
      return HttpResponse.json({ detail: 'Devolução registrada com sucesso.' }, { status: 200 })
    }),
    http.post(`${BASE}/sales/sale-1/cancel/`, async ({ request }) => {
      const body = await request.json() as { reason?: string }
      if (!body.reason?.trim()) {
        return HttpResponse.json(
          { type: 'about:blank', title: 'Validation Error', status: 422, detail: 'Motivo é obrigatório.', errors: { reason: ['Este campo é obrigatório.'] } },
          { status: 422 },
        )
      }
      return HttpResponse.json({ detail: 'Venda cancelada com sucesso.' }, { status: 200 })
    }),
    http.post(`${BASE}/sales/sale-1/refund/`, async ({ request }) => {
      const body = await request.json() as { amount?: string; reason?: string }
      if (!body.reason?.trim()) {
        return HttpResponse.json(
          { type: 'about:blank', title: 'Validation Error', status: 422, detail: 'Motivo é obrigatório.', errors: { reason: ['Este campo é obrigatório.'] } },
          { status: 422 },
        )
      }
      return HttpResponse.json({ detail: 'Reembolso processado com sucesso.' }, { status: 200 })
    }),
    http.post(`${BASE}/sales/sale-409-return/return/`, () =>
      HttpResponse.json(
        { type: 'about:blank', title: 'Conflict', status: 409, detail: 'Esta venda já possui devolução registrada.', code: 'already_returned' },
        { status: 409 },
      ),
    ),
    http.post(`${BASE}/sales/sale-409-cancel/cancel/`, () =>
      HttpResponse.json(
        { type: 'about:blank', title: 'Conflict', status: 409, detail: 'Esta venda já está cancelada.', code: 'already_cancelled' },
        { status: 409 },
      ),
    ),
    http.post(`${BASE}/sales/sale-403/return/`, () =>
      HttpResponse.json(
        { type: 'about:blank', title: 'Forbidden', status: 403, detail: 'Permissão negada. Reautenticação MFA necessária.', code: 'mfa_required' },
        { status: 403 },
      ),
    ),
    http.post(`${BASE}/sales/sale-403/cancel/`, () =>
      HttpResponse.json(
        { type: 'about:blank', title: 'Forbidden', status: 403, detail: 'Permissão negada. Reautenticação MFA necessária.', code: 'mfa_required' },
        { status: 403 },
      ),
    ),
    http.post(`${BASE}/sales/sale-403/refund/`, () =>
      HttpResponse.json(
        { type: 'about:blank', title: 'Forbidden', status: 403, detail: 'Permissão negada. Reautenticação MFA necessária.', code: 'mfa_required' },
        { status: 403 },
      ),
    ),
    http.get(`${BASE}/sales/sale-409-return/`, () =>
      HttpResponse.json({ ...SALE_DETAIL, id: 'sale-409-return', status: 'returned' }),
    ),
    http.get(`${BASE}/sales/sale-409-cancel/`, () =>
      HttpResponse.json({ ...SALE_DETAIL, id: 'sale-409-cancel', status: 'cancelled' }),
    ),
    http.get(`${BASE}/sales/sale-403/`, () =>
      HttpResponse.json({ ...SALE_DETAIL, id: 'sale-403' }),
    ),
  )
})

// ---------------------------------------------------------------------------
// ReturnDialog
// ---------------------------------------------------------------------------
describe('ReturnDialog', () => {
  it('opens, loads items, and confirms return successfully', async () => {
    const onClose = vi.fn()
    renderWithProviders(<ReturnDialog saleId="sale-1" onClose={onClose} />)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Parafuso')).toBeInTheDocument()
    })
    expect(screen.getByText('Porca')).toBeInTheDocument()

    const qtyInputs = screen.getAllByTestId(/^return-qty-/)
    expect(qtyInputs).toHaveLength(2)

    await user.clear(qtyInputs[0])
    await user.type(qtyInputs[0], '3')

    await user.type(screen.getByTestId('return-reason'), 'Produto com defeito')

    await user.click(screen.getByRole('button', { name: /confirmar/i }))

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  it('shows validation error when no items selected', async () => {
    renderWithProviders(<ReturnDialog saleId="sale-1" onClose={() => {}} />)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Parafuso')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /confirmar/i }))

    await waitFor(() => {
      expect(screen.getByTestId('return-error')).toHaveTextContent(/selecione pelo menos um item/i)
    })
  })

  it('shows validation error when reason is empty', async () => {
    renderWithProviders(<ReturnDialog saleId="sale-1" onClose={() => {}} />)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Parafuso')).toBeInTheDocument()
    })

    const qtyInputs = screen.getAllByTestId(/^return-qty-/)
    await user.clear(qtyInputs[0])
    await user.type(qtyInputs[0], '3')

    await user.click(screen.getByRole('button', { name: /confirmar/i }))

    await waitFor(() => {
      expect(screen.getByTestId('return-error')).toHaveTextContent(/motivo/i)
    })
  })

  it('shows consequence summary with computed values', async () => {
    renderWithProviders(<ReturnDialog saleId="sale-1" onClose={() => {}} />)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Parafuso')).toBeInTheDocument()
    })

    const qtyInputs = screen.getAllByTestId(/^return-qty-/)
    await user.clear(qtyInputs[0])
    await user.type(qtyInputs[0], '3')

    await waitFor(() => {
      expect(screen.getByTestId('return-summary')).toHaveTextContent(/reduzir o estoque/i)
      expect(screen.getByTestId('return-summary')).toHaveTextContent(/R\$ 30\.00/)
    })
  })

  it('handles 409 already-returned error', async () => {
    renderWithProviders(<ReturnDialog saleId="sale-409-return" onClose={() => {}} />)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Parafuso')).toBeInTheDocument()
    })

    const qtyInputs = screen.getAllByTestId(/^return-qty-/)
    await user.clear(qtyInputs[0])
    await user.type(qtyInputs[0], '2')

    await user.type(screen.getByTestId('return-reason'), 'Defeito')

    await user.click(screen.getByRole('button', { name: /confirmar/i }))

    await waitFor(() => {
      expect(screen.getByTestId('return-error')).toHaveTextContent(/já possui devolução/i)
    })
  })

  it('sends Idempotency-Key header on return', async () => {
    let capturedKey: string | null = null
    server.use(
      http.post(`${BASE}/sales/sale-1/return/`, async ({ request }) => {
        capturedKey = request.headers.get('Idempotency-Key')
        const body = await request.json() as { items?: unknown[]; reason?: string }
        if (!body.items?.length || !body.reason?.trim()) {
          return HttpResponse.json(
            { type: 'about:blank', title: 'Validation Error', status: 422, detail: 'Invalid input' },
            { status: 422 },
          )
        }
        return HttpResponse.json({ detail: 'Devolução registrada.' }, { status: 200 })
      }),
    )
    renderWithProviders(<ReturnDialog saleId="sale-1" onClose={() => {}} />)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Parafuso')).toBeInTheDocument()
    })

    const qtyInputs = screen.getAllByTestId(/^return-qty-/)
    await user.clear(qtyInputs[0])
    await user.type(qtyInputs[0], '1')
    await user.type(screen.getByTestId('return-reason'), 'Teste')

    await user.click(screen.getByRole('button', { name: /confirmar/i }))

    await waitFor(() => {
      expect(capturedKey).toBeTruthy()
      expect(capturedKey).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      )
    })
  })

  it('handles 403 MFA/permission denial', async () => {
    renderWithProviders(<ReturnDialog saleId="sale-403" onClose={() => {}} />)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Parafuso')).toBeInTheDocument()
    })

    const qtyInputs = screen.getAllByTestId(/^return-qty-/)
    await user.clear(qtyInputs[0])
    await user.type(qtyInputs[0], '1')
    await user.type(screen.getByTestId('return-reason'), 'Teste')

    await user.click(screen.getByRole('button', { name: /confirmar/i }))

    await waitFor(() => {
      expect(screen.getByTestId('return-error')).toHaveTextContent(/permis.*?nega|mfa/i)
    })
  })
})

// ---------------------------------------------------------------------------
// CancellationDialog
// ---------------------------------------------------------------------------
describe('CancellationDialog', () => {
  it('opens, confirms and cancels sale successfully', async () => {
    const onClose = vi.fn()
    renderWithProviders(<CancellationDialog saleId="sale-1" onClose={onClose} />)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('cancel-dialog')).toBeInTheDocument()
    })

    await user.type(screen.getByTestId('cancel-reason'), 'Cliente desistiu')

    await user.click(screen.getByRole('button', { name: /confirmar cancelamento/i }))

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  it('shows consequence summary for cancellation', async () => {
    renderWithProviders(<CancellationDialog saleId="sale-1" onClose={() => {}} />)

    await waitFor(() => {
      expect(screen.getByTestId('cancel-summary')).toHaveTextContent(/estornar/i)
      expect(screen.getByTestId('cancel-summary')).toHaveTextContent(/R\$ 150,00/)
    })
  })

  it('handles 409 already-cancelled error', async () => {
    renderWithProviders(<CancellationDialog saleId="sale-409-cancel" onClose={() => {}} />)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('cancel-dialog')).toBeInTheDocument()
    })

    await user.type(screen.getByTestId('cancel-reason'), 'Motivo qualquer')

    await user.click(screen.getByRole('button', { name: /confirmar cancelamento/i }))

    await waitFor(() => {
      expect(screen.getByTestId('cancel-error')).toHaveTextContent(/já está cancelada/i)
    })
  })

  it('shows validation when reason is empty', async () => {
    renderWithProviders(<CancellationDialog saleId="sale-1" onClose={() => {}} />)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('cancel-dialog')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /confirmar cancelamento/i }))

    await waitFor(() => {
      expect(screen.getByTestId('cancel-error')).toHaveTextContent(/motivo/i)
    })
  })

  it('handles 403 MFA/permission denial on cancel', async () => {
    renderWithProviders(<CancellationDialog saleId="sale-403" onClose={() => {}} />)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('cancel-dialog')).toBeInTheDocument()
    })

    await user.type(screen.getByTestId('cancel-reason'), 'Motivo qualquer')
    await user.click(screen.getByRole('button', { name: /confirmar cancelamento/i }))

    await waitFor(() => {
      expect(screen.getByTestId('cancel-error')).toHaveTextContent(/permis.*?nega|mfa/i)
    })
  })
})

// ---------------------------------------------------------------------------
// RefundDialog
// ---------------------------------------------------------------------------
describe('RefundDialog', () => {
  it('processes partial refund successfully', async () => {
    const onClose = vi.fn()
    renderWithProviders(<RefundDialog saleId="sale-1" onClose={onClose} />)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('refund-dialog')).toBeInTheDocument()
    })

    const amountInput = screen.getByTestId('refund-amount')
    await user.clear(amountInput)
    await user.type(amountInput, '50.00')

    await user.type(screen.getByTestId('refund-reason'), 'Reembolso parcial')

    await user.click(screen.getByRole('button', { name: /confirmar reembolso/i }))

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  it('shows consequence summary with full amount by default', async () => {
    renderWithProviders(<RefundDialog saleId="sale-1" onClose={() => {}} />)

    await waitFor(() => {
      expect(screen.getByTestId('refund-summary')).toHaveTextContent(/R\$ 150,00/)
    })
  })

  it('handles 403 MFA/permission denial on refund', async () => {
    renderWithProviders(<RefundDialog saleId="sale-403" onClose={() => {}} />)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('refund-dialog')).toBeInTheDocument()
    })

    await user.type(screen.getByTestId('refund-reason'), 'Reembolso')
    await user.click(screen.getByRole('button', { name: /confirmar reembolso/i }))

    await waitFor(() => {
      expect(screen.getByTestId('refund-error')).toHaveTextContent(/permis.*?nega|mfa/i)
    })
  })

  it('sends Idempotency-Key header on refund', async () => {
    let capturedKey: string | null = null
    server.use(
      http.post(`${BASE}/sales/sale-1/refund/`, async ({ request }) => {
        capturedKey = request.headers.get('Idempotency-Key')
        return HttpResponse.json({ detail: 'Reembolso processado.' }, { status: 200 })
      }),
    )
    const onClose = vi.fn()
    renderWithProviders(<RefundDialog saleId="sale-1" onClose={onClose} />)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('refund-dialog')).toBeInTheDocument()
    })

    await user.type(screen.getByTestId('refund-reason'), 'Teste')
    await user.click(screen.getByRole('button', { name: /confirmar reembolso/i }))

    await waitFor(() => {
      expect(capturedKey).toBeTruthy()
      expect(capturedKey).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      )
    })
  })
})
