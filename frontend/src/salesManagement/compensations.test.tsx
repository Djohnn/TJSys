import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { useState, type ReactElement } from 'react'
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
  user: {
    id: 1,
    email: 'admin@zyrp.local',
    name: 'Admin',
    is_active: true,
    is_mfa_enabled: false,
  },
  memberships: [
    { id: 1, tenant_id: 'tenant-alpha', tenant_name: 'Alpha', role: 'admin' },
  ],
  login: async () => ({ requiresMfa: false }),
  challengeMfa: async () => {},
  verifyRecovery: vi.fn(),
  logout: async () => {},
}

const tenantValue: TenantContextValue = {
  selectedTenant: {
    id: 1,
    tenant_id: 'tenant-alpha',
    tenant_name: 'Alpha',
    role: 'admin',
  },
  memberships: [
    { id: 1, tenant_id: 'tenant-alpha', tenant_name: 'Alpha', role: 'admin' },
  ],
  selectTenant: () => {},
}

const SALE_DETAIL = {
  id: 'sale-1',
  branch: 'branch-1',
  cash_session: 'cash-session-1',
  operator: 'operator-1',
  customer: null,
  status: 'confirmed',
  gross_total: '150.00',
  discount_total: '0.00',
  net_total: '150.00',
  refundable_balance: '150.00',
  created_at: '2026-07-22T10:00:00Z',
  version: 1,
  payments: [
    {
      id: 'payment-1',
      method: 'cash',
      amount: '150.00',
      reference: 'receipt-1',
    },
  ],
  items: [
    {
      id: 'sale-item-1',
      product: 'prod-1',
      unit: 'unit-1',
      unit_precision: 0,
      stock_operation: 'stock-op-1',
      quantity: '10.000000',
      factor: '1.000000',
      unit_price: '10.00',
      discount_amount: '0.00',
      line_total: '100.00',
    },
    {
      id: 'sale-item-2',
      product: 'prod-2',
      unit: 'unit-1',
      unit_precision: 0,
      stock_operation: 'stock-op-2',
      quantity: '5.000000',
      factor: '1.000000',
      unit_price: '10.00',
      discount_amount: '0.00',
      line_total: '50.00',
    },
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
    http.get(`${BASE}/sales/sale-1/`, () => HttpResponse.json(SALE_DETAIL)),
    http.get(`${BASE}/sales/sale-refund-pix/`, () =>
      HttpResponse.json({
        ...SALE_DETAIL,
        id: 'sale-refund-pix',
        payments: [{ ...SALE_DETAIL.payments[0], method: 'pix' }],
      }),
    ),
    http.get(`${BASE}/sales/sale-refund-card/`, () =>
      HttpResponse.json({
        ...SALE_DETAIL,
        id: 'sale-refund-card',
        payments: [{ ...SALE_DETAIL.payments[0], method: 'card_credit' }],
      }),
    ),
    http.get(`${BASE}/sales/sale-refund-multiple/`, () =>
      HttpResponse.json({
        ...SALE_DETAIL,
        id: 'sale-refund-multiple',
        payments: [
          { ...SALE_DETAIL.payments[0], method: 'cash' },
          { ...SALE_DETAIL.payments[0], id: 'payment-2', method: 'pix' },
        ],
      }),
    ),
    http.get(`${BASE}/sales/sale-refund-empty/`, () =>
      HttpResponse.json({ ...SALE_DETAIL, id: 'sale-refund-empty', payments: [] }),
    ),
    http.get(`${BASE}/sales/sale-refund-partial/`, () =>
      HttpResponse.json({
        ...SALE_DETAIL,
        id: 'sale-refund-partial',
        net_total: '150.00',
        refundable_balance: '100.00',
      }),
    ),
    http.get(`${BASE}/sales/sale-return-empty/`, () =>
      HttpResponse.json({ ...SALE_DETAIL, id: 'sale-return-empty', items: [] }),
    ),
    http.get(`${BASE}/sales/sale-return-discount/`, () =>
      HttpResponse.json({
        ...SALE_DETAIL,
        id: 'sale-return-discount',
        items: [
          {
            ...SALE_DETAIL.items[0],
            id: 'sale-item-discount',
            product: 'prod-discount',
            quantity: '2.000000',
            unit_precision: 6,
            unit_price: '10.00',
            discount_amount: '2.00',
            line_total: '18.00',
          },
        ],
      }),
    ),
    http.get(`${BASE}/sales/sale-return-fractional/`, () =>
      HttpResponse.json({
        ...SALE_DETAIL,
        id: 'sale-return-fractional',
        items: [
          {
            ...SALE_DETAIL.items[0],
            id: 'sale-item-fractional',
            product: 'prod-fractional',
            product_name: 'Produto prod-fractional',
            quantity: '2.000000',
            unit_precision: 6,
            unit_price: '10.00',
            discount_amount: '2.00',
            line_total: '18.00',
          },
        ],
      }),
    ),
    http.post(`${BASE}/sales/sale-1/returns/`, async ({ request }) => {
      const body = (await request.json()) as {
        items?: unknown[]
        reason?: string
      }
      if (!body.items || body.items.length === 0 || !body.reason?.trim()) {
        return HttpResponse.json(
          {
            type: 'about:blank',
            title: 'Validation Error',
            status: 422,
            detail: 'Invalid input',
            errors: {
              reason: !body.reason?.trim()
                ? ['Este campo é obrigatório.']
                : undefined,
            },
          },
          { status: 422 },
        )
      }
      return HttpResponse.json(
        { detail: 'Devolução registrada com sucesso.' },
        { status: 201 },
      )
    }),
    http.post(`${BASE}/sales/sale-1/cancel/`, async ({ request }) => {
      const body = (await request.json()) as { reason?: string }
      if (!body.reason?.trim()) {
        return HttpResponse.json(
          {
            type: 'about:blank',
            title: 'Validation Error',
            status: 422,
            detail: 'Motivo é obrigatório.',
            errors: { reason: ['Este campo é obrigatório.'] },
          },
          { status: 422 },
        )
      }
      return HttpResponse.json(
        { detail: 'Venda cancelada com sucesso.' },
        { status: 201 },
      )
    }),
    http.post(`${BASE}/sales/sale-1/refund/`, async ({ request }) => {
      const body = (await request.json()) as {
        method?: string
        amount?: string
        reason?: string
      }
      if (!body.reason?.trim()) {
        return HttpResponse.json(
          {
            type: 'about:blank',
            title: 'Validation Error',
            status: 422,
            detail: 'Motivo é obrigatório.',
            errors: { reason: ['Este campo é obrigatório.'] },
          },
          { status: 422 },
        )
      }
      return HttpResponse.json(
        { detail: 'Reembolso processado com sucesso.' },
        { status: 201 },
      )
    }),
    http.post(`${BASE}/sales/sale-409-return/returns/`, () =>
      HttpResponse.json(
        {
          type: 'about:blank',
          title: 'Conflict',
          status: 409,
          detail: 'Esta venda já possui devolução registrada.',
          code: 'already_returned',
        },
        { status: 409 },
      ),
    ),
    http.post(`${BASE}/sales/sale-409-cancel/cancel/`, () =>
      HttpResponse.json(
        {
          type: 'about:blank',
          title: 'Conflict',
          status: 409,
          detail: 'Esta venda já está cancelada.',
          code: 'already_cancelled',
        },
        { status: 409 },
      ),
    ),
    http.post(`${BASE}/sales/sale-403/returns/`, () =>
      HttpResponse.json(
        {
          type: 'about:blank',
          title: 'Forbidden',
          status: 403,
          detail: 'Permissão negada. Reautenticação MFA necessária.',
          code: 'mfa_required',
        },
        { status: 403 },
      ),
    ),
    http.post(`${BASE}/sales/sale-403/cancel/`, () =>
      HttpResponse.json(
        {
          type: 'about:blank',
          title: 'Forbidden',
          status: 403,
          detail: 'Permissão negada. Reautenticação MFA necessária.',
          code: 'mfa_required',
        },
        { status: 403 },
      ),
    ),
    http.post(`${BASE}/sales/sale-403/refund/`, () =>
      HttpResponse.json(
        {
          type: 'about:blank',
          title: 'Forbidden',
          status: 403,
          detail: 'Permissão negada. Reautenticação MFA necessária.',
          code: 'mfa_required',
        },
        { status: 403 },
      ),
    ),
    http.get(`${BASE}/sales/sale-409-return/`, () =>
      HttpResponse.json({
        ...SALE_DETAIL,
        id: 'sale-409-return',
        status: 'returned',
      }),
    ),
    http.get(`${BASE}/sales/sale-409-cancel/`, () =>
      HttpResponse.json({
        ...SALE_DETAIL,
        id: 'sale-409-cancel',
        status: 'cancelled',
      }),
    ),
    http.get(`${BASE}/sales/sale-403/`, () =>
      HttpResponse.json({ ...SALE_DETAIL, id: 'sale-403' }),
    ),
    http.get(`${BASE}/sales/sale-cancel-404/`, () =>
      HttpResponse.json(
        {
          type: 'https://zyrp.local/problems/not_found',
          title: 'Sales operation rejected',
          status: 404,
          detail: 'Resource not found.',
          code: 'not_found',
        },
        {
          status: 404,
          headers: { 'Content-Type': 'application/problem+json' },
        },
      ),
    ),
  )
})

function renderDialogHarness(
  testId: string,
  createDialog: (onClose: () => void) => ReactElement,
) {
  const onClose = vi.fn()

  function Harness() {
    const [open, setOpen] = useState(false)
    return (
      <>
        <button type="button" data-testid={`${testId}-opener`} onClick={() => setOpen(true)}>
          Abrir
        </button>
        {open &&
          createDialog(() => {
            onClose()
            setOpen(false)
          })}
      </>
    )
  }

  renderWithProviders(<Harness />)
  return onClose
}

// ---------------------------------------------------------------------------
// ReturnDialog
// ---------------------------------------------------------------------------
describe('ReturnDialog', () => {
  it('opens, loads items, and confirms return successfully', async () => {
    const onClose = vi.fn()
    renderWithProviders(<ReturnDialog saleId="sale-1" onClose={onClose} />)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Produto prod-1')).toBeInTheDocument()
    })
    expect(screen.getByText('Produto prod-2')).toBeInTheDocument()

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
      expect(screen.getByText('Produto prod-1')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /confirmar/i }))

    await waitFor(() => {
      expect(screen.getByTestId('return-error')).toHaveTextContent(
        /selecione pelo menos um item/i,
      )
    })
  })

  it('shows validation error when reason is empty', async () => {
    renderWithProviders(<ReturnDialog saleId="sale-1" onClose={() => {}} />)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Produto prod-1')).toBeInTheDocument()
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
      expect(screen.getByText('Produto prod-1')).toBeInTheDocument()
    })

    const qtyInputs = screen.getAllByTestId(/^return-qty-/)
    await user.clear(qtyInputs[0])
    await user.type(qtyInputs[0], '3')

    await waitFor(() => {
      expect(screen.getByTestId('return-summary')).toHaveTextContent(
        /reduzir o estoque/i,
      )
      expect(screen.getByTestId('return-summary')).toHaveTextContent(
        /R\$ 30\.00/,
      )
    })
  })

  it('uses discounted line total proportionally for a partial return', async () => {
    // Given a two-unit line whose discounted line_total is R$ 18,00
    renderWithProviders(
      <ReturnDialog saleId="sale-return-discount" onClose={() => {}} />,
    )
    const user = userEvent.setup()

    // When one of the two units is selected for return
    await screen.findByText('Produto prod-discount')
    await user.type(screen.getByTestId('return-qty-prod-discount'), '1')

    // Then the credit is the proportional discounted amount, R$ 9,00
    await waitFor(() => {
      expect(screen.getByTestId('return-summary')).toHaveTextContent(/R\$ 9\.00/)
    })
  })

  it('supports fractional quantities at the backend precision without losing discounted credit', async () => {
    // Given a two-unit discounted line from the real serializer shape
    renderWithProviders(
      <ReturnDialog saleId="sale-return-fractional" onClose={() => {}} />,
    )
    const user = userEvent.setup()

    // When half a unit is selected
    const input = await screen.findByTestId('return-qty-prod-fractional')
    expect(input).toHaveAttribute('step', '0.000001')
    await user.type(input, '0.5')

    // Then the proportional credit uses Decimal arithmetic: R$ 4,50
    await waitFor(() => {
      expect(screen.getByTestId('return-summary')).toHaveTextContent(/R\$ 4\.50/)
    })
  })

  it('shows an explicit empty state and disables confirmation with no items', async () => {
    // Given a sale returned by the serializer with no items
    renderWithProviders(<ReturnDialog saleId="sale-return-empty" onClose={() => {}} />)

    // When the dialog finishes loading
    expect(await screen.findByTestId('return-empty')).toBeInTheDocument()

    // Then the empty state is accessible and no return can be submitted
    expect(screen.getByRole('button', { name: /confirmar/i })).toBeDisabled()
  })

  it('handles 409 already-returned error', async () => {
    renderWithProviders(
      <ReturnDialog saleId="sale-409-return" onClose={() => {}} />,
    )
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Produto prod-1')).toBeInTheDocument()
    })

    const qtyInputs = screen.getAllByTestId(/^return-qty-/)
    await user.clear(qtyInputs[0])
    await user.type(qtyInputs[0], '2')

    await user.type(screen.getByTestId('return-reason'), 'Defeito')

    await user.click(screen.getByRole('button', { name: /confirmar/i }))

    await waitFor(() => {
      expect(screen.getByTestId('return-error')).toHaveTextContent(
        /já possui devolução/i,
      )
    })
  })

  it('sends Idempotency-Key header on return', async () => {
    let capturedKey: string | null = null
    server.use(
      http.post(`${BASE}/sales/sale-1/returns/`, async ({ request }) => {
        capturedKey = request.headers.get('Idempotency-Key')
        const body = (await request.json()) as {
          items?: unknown[]
          reason?: string
        }
        if (!body.items?.length || !body.reason?.trim()) {
          return HttpResponse.json(
            {
              type: 'about:blank',
              title: 'Validation Error',
              status: 422,
              detail: 'Invalid input',
            },
            { status: 422 },
          )
        }
        return HttpResponse.json(
          { detail: 'Devolução registrada.' },
          { status: 201 },
        )
      }),
    )
    renderWithProviders(<ReturnDialog saleId="sale-1" onClose={() => {}} />)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Produto prod-1')).toBeInTheDocument()
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

  it('sends the plural return contract with sale item ids and no legacy product field', async () => {
    let capturedBody: {
      items?: { sale_item_id?: string; quantity?: string; product?: string }[]
      reason?: string
    } | null = null
    let capturedKey: string | null = null
    server.use(
      http.post(`${BASE}/sales/sale-1/returns/`, async ({ request }) => {
        capturedKey = request.headers.get('Idempotency-Key')
        capturedBody = (await request.json()) as {
          items?: {
            sale_item_id?: string
            quantity?: string
            product?: string
          }[]
          reason?: string
        }
        return HttpResponse.json(
          { detail: 'Devolução registrada.' },
          { status: 201 },
        )
      }),
    )
    renderWithProviders(<ReturnDialog saleId="sale-1" onClose={() => {}} />)
    const user = userEvent.setup()

    await waitFor(() =>
      expect(screen.getByText('Produto prod-1')).toBeInTheDocument(),
    )
    await user.type(screen.getAllByTestId(/^return-qty-/)[0], '1')
    await user.type(screen.getByTestId('return-reason'), 'Teste de contrato')
    await user.click(screen.getByRole('button', { name: /confirmar/i }))

    await waitFor(() => expect(capturedBody).not.toBeNull())
    const body = capturedBody as unknown as {
      items?: { sale_item_id?: string; quantity?: string; product?: string }[]
      reason?: string
    }
    expect(body).toEqual({
      items: [{ sale_item_id: 'sale-item-1', quantity: '1' }],
      reason: 'Teste de contrato',
    })
    expect(body.items?.[0]).not.toHaveProperty('product')
    expect(capturedKey).toBeTruthy()
  })

  it('keeps one return request and key when submit is clicked twice', async () => {
    const capturedKeys: string[] = []
    let requestCount = 0
    let resolveRequest: (() => void) | undefined
    const requestCompleted = new Promise<void>((resolve) => {
      resolveRequest = resolve
    })
    server.use(
      http.post(`${BASE}/sales/sale-1/returns/`, async ({ request }) => {
        requestCount += 1
        const key = request.headers.get('Idempotency-Key')
        if (key) capturedKeys.push(key)
        await requestCompleted
        return HttpResponse.json(
          { detail: 'Devolução registrada.' },
          { status: 201 },
        )
      }),
    )
    renderWithProviders(<ReturnDialog saleId="sale-1" onClose={() => {}} />)
    const user = userEvent.setup()

    await waitFor(() =>
      expect(screen.getByText('Produto prod-1')).toBeInTheDocument(),
    )
    await user.type(screen.getAllByTestId(/^return-qty-/)[0], '1')
    await user.type(screen.getByTestId('return-reason'), 'Teste de duplicidade')
    const submit = screen.getByRole('button', { name: /confirmar/i })
    await user.click(submit)
    await waitFor(() => expect(requestCount).toBe(1))
    await user.click(submit)

    expect(requestCount).toBe(1)
    expect(capturedKeys).toHaveLength(1)
    expect(capturedKeys[0]).toBeTruthy()
    resolveRequest?.()
  })

  it('handles 403 MFA/permission denial', async () => {
    renderWithProviders(<ReturnDialog saleId="sale-403" onClose={() => {}} />)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByText('Produto prod-1')).toBeInTheDocument()
    })

    const qtyInputs = screen.getAllByTestId(/^return-qty-/)
    await user.clear(qtyInputs[0])
    await user.type(qtyInputs[0], '1')
    await user.type(screen.getByTestId('return-reason'), 'Teste')

    await user.click(screen.getByRole('button', { name: /confirmar/i }))

    await waitFor(() => {
      expect(screen.getByTestId('return-error')).toHaveTextContent(
        /permis.*?nega|mfa/i,
      )
    })
  })

  it('renders an accessible not-found state without the return form', async () => {
    server.use(
      http.get(`${BASE}/sales/sale-return-404/`, () =>
        HttpResponse.json(
          {
            type: 'https://zyrp.local/problems/not_found',
            title: 'Sales operation rejected',
            status: 404,
            detail: 'Resource not found.',
            code: 'not_found',
          },
          {
            status: 404,
            headers: { 'Content-Type': 'application/problem+json' },
          },
        ),
      ),
    )
    renderWithProviders(
      <ReturnDialog saleId="sale-return-404" onClose={() => {}} />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('return-error')).toHaveTextContent(
        /venda n[aã]o encontrada/i,
      )
    })
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('renders a server error state without crashing', async () => {
    server.use(
      http.get(`${BASE}/sales/sale-return-error/`, () =>
        HttpResponse.json(
          {
            type: 'about:blank',
            title: 'Server Error',
            status: 500,
            detail: 'Falha temporária ao consultar a venda.',
          },
          { status: 500 },
        ),
      ),
    )
    renderWithProviders(
      <ReturnDialog saleId="sale-return-error" onClose={() => {}} />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('return-error')).toHaveTextContent(
        /falha tempor[aá]ria/i,
      )
    })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// CancellationDialog
// ---------------------------------------------------------------------------
describe('CancellationDialog', () => {
  it('opens, confirms and cancels sale successfully', async () => {
    const onClose = vi.fn()
    renderWithProviders(
      <CancellationDialog saleId="sale-1" onClose={onClose} />,
    )
    const user = userEvent.setup()

    await user.type(
      await screen.findByTestId('cancel-reason'),
      'Cliente desistiu',
    )

    await user.click(
      screen.getByRole('button', { name: /confirmar cancelamento/i }),
    )

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  it('shows consequence summary for cancellation', async () => {
    renderWithProviders(
      <CancellationDialog saleId="sale-1" onClose={() => {}} />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('cancel-summary')).toHaveTextContent(
        /estornar/i,
      )
      expect(screen.getByTestId('cancel-summary')).toHaveTextContent(
        /R\$ 150,00/,
      )
    })
  })

  it('handles 409 already-cancelled error', async () => {
    renderWithProviders(
      <CancellationDialog saleId="sale-409-cancel" onClose={() => {}} />,
    )
    const user = userEvent.setup()

    await user.type(
      await screen.findByTestId('cancel-reason'),
      'Motivo qualquer',
    )

    await user.click(
      screen.getByRole('button', { name: /confirmar cancelamento/i }),
    )

    await waitFor(() => {
      expect(screen.getByTestId('cancel-error')).toHaveTextContent(
        /já está cancelada/i,
      )
    })
  })

  it('shows validation when reason is empty', async () => {
    renderWithProviders(
      <CancellationDialog saleId="sale-1" onClose={() => {}} />,
    )
    const user = userEvent.setup()

    await screen.findByRole('button', { name: /confirmar cancelamento/i })
    await user.click(
      screen.getByRole('button', { name: /confirmar cancelamento/i }),
    )

    await waitFor(() => {
      expect(screen.getByTestId('cancel-error')).toHaveTextContent(/motivo/i)
    })
  })

  it('handles 403 MFA/permission denial on cancel', async () => {
    renderWithProviders(
      <CancellationDialog saleId="sale-403" onClose={() => {}} />,
    )
    const user = userEvent.setup()

    await user.type(
      await screen.findByTestId('cancel-reason'),
      'Motivo qualquer',
    )
    await user.click(
      screen.getByRole('button', { name: /confirmar cancelamento/i }),
    )

    await waitFor(() => {
      expect(screen.getByTestId('cancel-error')).toHaveTextContent(
        /permis.*?nega|mfa/i,
      )
    })
  })

  it('renders a cancellation not-found state without the form', async () => {
    // Given the dialog request is answered with Problem Details 404
    renderWithProviders(
      <CancellationDialog saleId="sale-cancel-404" onClose={() => {}} />,
    )

    // When the sale cannot be loaded
    const dialog = await screen.findByTestId('cancel-dialog')
    await waitFor(() =>
      expect(within(dialog).queryByTestId('cancel-error')).toBeInTheDocument(),
    )

    // Then the user gets an accessible indistinguishable not-found state
    expect(within(dialog).getByTestId('cancel-error')).toHaveTextContent(
      /venda n[aã]o encontrada/i,
    )
    expect(within(dialog).queryByTestId('cancel-reason')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// RefundDialog
// ---------------------------------------------------------------------------
describe('RefundDialog', () => {
  it.each([
    ['sale-refund-pix', 'pix'],
    ['sale-refund-card', 'card_external'],
  ])('derives the initial refund method from the sale payment (%s)', async (saleId, expectedMethod) => {
    // Given a canonical serializer payment method (PIX or a card variant)
    renderWithProviders(<RefundDialog saleId={saleId} onClose={() => {}} />)

    // When the dialog loads the sale
    const methodSelect = await screen.findByTestId('refund-method')

    // Then the supported refund method is selected without legacy fields
    expect(methodSelect).toHaveValue(expectedMethod)
  })

  it('warns when multiple payments use the first supported method but remain adjustable', async () => {
    // Given a sale with multiple payments in serializer order
    renderWithProviders(
      <RefundDialog saleId="sale-refund-multiple" onClose={() => {}} />,
    )

    // When the dialog loads
    const methodSelect = await screen.findByTestId('refund-method')

    // Then the first method is selected and the user receives safe guidance
    expect(methodSelect).toHaveValue('cash')
    expect(screen.getByTestId('refund-multiple-payments')).toBeInTheDocument()
  })

  it('shows an explicit empty state and disables confirmation without payments', async () => {
    // Given a sale returned by the serializer without payments
    renderWithProviders(<RefundDialog saleId="sale-refund-empty" onClose={() => {}} />)

    // When the dialog finishes loading
    expect(await screen.findByTestId('refund-empty')).toBeInTheDocument()

    // Then no refund can be submitted
    expect(
      screen.getByRole('button', { name: /confirmar reembolso/i }),
    ).toBeDisabled()
  })

  it.each([
    ['cash', 'Dinheiro'],
    ['pix', 'PIX'],
    ['card_external', 'Cartão externo'],
  ])('offers the %s refund method as %s', async (method, label) => {
    let capturedBody: { method?: string; reason?: string } | null = null
    server.use(
      http.post(`${BASE}/sales/sale-1/refund/`, async ({ request }) => {
        capturedBody = (await request.json()) as {
          method?: string
          reason?: string
        }
        return HttpResponse.json(
          { detail: 'Reembolso processado.' },
          { status: 201 },
        )
      }),
    )
    renderWithProviders(<RefundDialog saleId="sale-1" onClose={() => {}} />)
    const user = userEvent.setup()

    const methodSelect = await screen.findByRole('combobox', {
      name: 'Método do reembolso',
    })
    expect(screen.getByRole('option', { name: label })).toBeInTheDocument()
    await user.selectOptions(methodSelect, method)
    await user.type(screen.getByTestId('refund-reason'), 'Teste de método')
    await user.click(
      screen.getByRole('button', { name: /confirmar reembolso/i }),
    )

    await waitFor(() => expect(capturedBody).not.toBeNull())
    expect(capturedBody).toMatchObject({ method, reason: 'Teste de método' })
  })

  it('processes partial refund successfully', async () => {
    const onClose = vi.fn()
    renderWithProviders(<RefundDialog saleId="sale-1" onClose={onClose} />)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('refund-dialog')).toBeInTheDocument()
    })

    const amountInput = await screen.findByTestId('refund-amount')
    await user.clear(amountInput)
    await user.type(amountInput, '50.00')

    await user.type(screen.getByTestId('refund-reason'), 'Reembolso parcial')

    await user.click(
      screen.getByRole('button', { name: /confirmar reembolso/i }),
    )

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  it('sends a partial amount explicitly', async () => {
    let capturedBody: {
      method?: string
      amount?: string
      reason?: string
    } | null = null
    server.use(
      http.post(`${BASE}/sales/sale-1/refund/`, async ({ request }) => {
        capturedBody = (await request.json()) as {
          method?: string
          amount?: string
          reason?: string
        }
        return HttpResponse.json(
          { detail: 'Reembolso processado.' },
          { status: 201 },
        )
      }),
    )
    renderWithProviders(<RefundDialog saleId="sale-1" onClose={() => {}} />)
    const user = userEvent.setup()

    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Método do reembolso' }),
      'pix',
    )
    await user.type(screen.getByTestId('refund-amount'), '50.00')
    await user.type(screen.getByTestId('refund-reason'), 'Reembolso parcial')
    await user.click(
      screen.getByRole('button', { name: /confirmar reembolso/i }),
    )

    await waitFor(() => expect(capturedBody).not.toBeNull())
    expect(capturedBody).toEqual({
      method: 'pix',
      amount: '50',
      reason: 'Reembolso parcial',
    })
  })

  it('omits amount when the field is empty and preserves an explicit full amount', async () => {
    const capturedBodies: Record<string, unknown>[] = []
    server.use(
      http.post(`${BASE}/sales/sale-1/refund/`, async ({ request }) => {
        capturedBodies.push((await request.json()) as Record<string, unknown>)
        return HttpResponse.json(
          { detail: 'Reembolso processado.' },
          { status: 201 },
        )
      }),
    )
    const firstClose = vi.fn()
    const firstRender = renderWithProviders(
      <RefundDialog saleId="sale-1" onClose={firstClose} />,
    )
    const user = userEvent.setup()

    await user.type(await screen.findByTestId('refund-reason'), 'Saldo total')
    await user.click(
      screen.getByRole('button', { name: /confirmar reembolso/i }),
    )
    await waitFor(() => expect(firstClose).toHaveBeenCalledTimes(1))
    expect(capturedBodies[0]).toEqual({
      method: 'cash',
      reason: 'Saldo total',
    })
    firstRender.unmount()

    const secondClose = vi.fn()
    renderWithProviders(<RefundDialog saleId="sale-1" onClose={secondClose} />)
    await user.type(await screen.findByTestId('refund-amount'), '150.00')
    await user.type(screen.getByTestId('refund-reason'), 'Total explícito')
    await user.click(
      screen.getByRole('button', { name: /confirmar reembolso/i }),
    )
    await waitFor(() => expect(secondClose).toHaveBeenCalledTimes(1))
    expect(capturedBodies[1]).toEqual({
      method: 'cash',
      amount: '150',
      reason: 'Total explícito',
    })
  })

  it('shows consequence summary with full amount by default', async () => {
    renderWithProviders(<RefundDialog saleId="sale-1" onClose={() => {}} />)

    await waitFor(() => {
      expect(screen.getByTestId('refund-summary')).toHaveTextContent(
        /R\$ 150,00/,
      )
    })
  })

  it('displays and validates the real refundable balance after a previous partial refund', async () => {
    // Given the serializer exposes R$ 100,00 refundable after a prior R$ 50,00 refund
    let requestCount = 0
    server.use(
      http.post(`${BASE}/sales/sale-refund-partial/refund/`, async () => {
        requestCount += 1
        return HttpResponse.json({ detail: 'Reembolso processado.' }, { status: 201 })
      }),
    )
    renderWithProviders(
      <RefundDialog saleId="sale-refund-partial" onClose={() => {}} />,
    )
    const user = userEvent.setup()

    // When the operator enters more than that balance
    const summary = await screen.findByTestId('refund-summary')
    expect(summary).toHaveTextContent(/R\$ 100,00/)
    const amount = screen.getByTestId('refund-amount')
    expect(amount).toHaveAttribute('max', '100.00')
    await user.type(amount, '100.01')
    await user.type(screen.getByTestId('refund-reason'), 'Excesso de saldo')
    await user.click(
      screen.getByRole('button', { name: /confirmar reembolso/i }),
    )

    // Then validation uses the exact Decimal balance and sends no request
    await waitFor(() => expect(screen.getByTestId('refund-error')).toHaveTextContent(/saldo/i))
    expect(requestCount).toBe(0)
  })

  it('handles 403 MFA/permission denial on refund', async () => {
    renderWithProviders(<RefundDialog saleId="sale-403" onClose={() => {}} />)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('refund-dialog')).toBeInTheDocument()
    })

    await user.type(await screen.findByTestId('refund-reason'), 'Reembolso')
    await user.click(
      screen.getByRole('button', { name: /confirmar reembolso/i }),
    )

    await waitFor(() => {
      expect(screen.getByTestId('refund-error')).toHaveTextContent(
        /permis.*?nega|mfa/i,
      )
    })
  })

  it('sends Idempotency-Key header on refund', async () => {
    let capturedKey: string | null = null
    server.use(
      http.post(`${BASE}/sales/sale-1/refund/`, async ({ request }) => {
        capturedKey = request.headers.get('Idempotency-Key')
        return HttpResponse.json(
          { detail: 'Reembolso processado.' },
          { status: 201 },
        )
      }),
    )
    const onClose = vi.fn()
    renderWithProviders(<RefundDialog saleId="sale-1" onClose={onClose} />)
    const user = userEvent.setup()

    await waitFor(() => {
      expect(screen.getByTestId('refund-dialog')).toBeInTheDocument()
    })

    await user.type(await screen.findByTestId('refund-reason'), 'Teste')
    await user.click(
      screen.getByRole('button', { name: /confirmar reembolso/i }),
    )

    await waitFor(() => {
      expect(capturedKey).toBeTruthy()
      expect(capturedKey).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      )
    })
  })

  it('renders Problem Details without exposing the raw response', async () => {
    server.use(
      http.post(`${BASE}/sales/sale-1/refund/`, () =>
        HttpResponse.json(
          {
            type: 'about:blank',
            title: 'Conflict',
            status: 409,
            detail: 'O reembolso já foi registrado.',
            code: 'already_refunded',
          },
          {
            status: 409,
            headers: { 'Content-Type': 'application/problem+json' },
          },
        ),
      ),
    )
    renderWithProviders(<RefundDialog saleId="sale-1" onClose={() => {}} />)
    const user = userEvent.setup()

    await user.type(await screen.findByTestId('refund-reason'), 'Conflito')
    await user.click(
      screen.getByRole('button', { name: /confirmar reembolso/i }),
    )

    await waitFor(() =>
      expect(screen.getByTestId('refund-error')).toHaveTextContent(
        'O reembolso já foi registrado.',
      ),
    )
    expect(screen.getByTestId('refund-error')).not.toHaveTextContent(
      'already_refunded',
    )
    expect(screen.getByTestId('refund-error')).not.toHaveTextContent(
      'application/problem+json',
    )
  })

  it('keeps one refund request and key when submit is clicked twice', async () => {
    const capturedKeys: string[] = []
    let requestCount = 0
    let resolveRequest: (() => void) | undefined
    const requestCompleted = new Promise<void>((resolve) => {
      resolveRequest = resolve
    })
    server.use(
      http.post(`${BASE}/sales/sale-1/refund/`, async ({ request }) => {
        requestCount += 1
        const key = request.headers.get('Idempotency-Key')
        if (key) capturedKeys.push(key)
        await requestCompleted
        return HttpResponse.json(
          { detail: 'Reembolso processado.' },
          { status: 201 },
        )
      }),
    )
    renderWithProviders(<RefundDialog saleId="sale-1" onClose={() => {}} />)
    const user = userEvent.setup()

    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Método do reembolso' }),
      'card_external',
    )
    await user.type(screen.getByTestId('refund-reason'), 'Teste de duplicidade')
    const submit = screen.getByRole('button', { name: /confirmar reembolso/i })
    await user.click(submit)
    await waitFor(() => expect(requestCount).toBe(1))
    await user.click(submit)

    expect(requestCount).toBe(1)
    expect(capturedKeys).toHaveLength(1)
    expect(capturedKeys[0]).toBeTruthy()
    resolveRequest?.()
  })

  it('renders an accessible not-found state without the refund form', async () => {
    server.use(
      http.get(`${BASE}/sales/sale-refund-404/`, () =>
        HttpResponse.json(
          {
            type: 'https://zyrp.local/problems/not_found',
            title: 'Sales operation rejected',
            status: 404,
            detail: 'Resource not found.',
            code: 'not_found',
          },
          {
            status: 404,
            headers: { 'Content-Type': 'application/problem+json' },
          },
        ),
      ),
    )
    renderWithProviders(
      <RefundDialog saleId="sale-refund-404" onClose={() => {}} />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('refund-error')).toHaveTextContent(
        /venda n[aã]o encontrada/i,
      )
    })
    expect(screen.queryByTestId('refund-method')).not.toBeInTheDocument()
  })

  it('renders a server error state without crashing', async () => {
    server.use(
      http.get(`${BASE}/sales/sale-refund-error/`, () =>
        HttpResponse.json(
          {
            type: 'about:blank',
            title: 'Server Error',
            status: 500,
            detail: 'Falha temporária ao consultar a venda.',
          },
          { status: 500 },
        ),
      ),
    )
    renderWithProviders(
      <RefundDialog saleId="sale-refund-error" onClose={() => {}} />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('refund-error')).toHaveTextContent(
        /falha tempor[aá]ria/i,
      )
    })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('shared compensation dialog modal contract', () => {
  it.each([
    ['return-dialog', 'sale-1', (onClose: () => void) => <ReturnDialog saleId="sale-1" onClose={onClose} />],
    ['cancel-dialog', 'sale-1', (onClose: () => void) => <CancellationDialog saleId="sale-1" onClose={onClose} />],
    ['refund-dialog', 'sale-1', (onClose: () => void) => <RefundDialog saleId="sale-1" onClose={onClose} />],
  ])('traps focus, closes with Escape, and restores focus for %s', async (testId, saleId, createDialog) => {
    // Given an operator opened one of the compensation dialogs from a focused trigger
    const onClose = renderDialogHarness(testId, createDialog)
    const user = userEvent.setup()
    const opener = screen.getByTestId(`${testId}-opener`)
    await user.click(opener)
    const dialog = await screen.findByTestId(testId)
    await within(dialog).findByText(saleId)

    // Then initial focus enters the dialog and reverse tab cannot escape it
    const closeButton = within(dialog).getByRole('button', { name: /fechar/i })
    expect(closeButton).toHaveFocus()
    await user.tab({ shift: true })
    expect(dialog).toContainElement(document.activeElement as HTMLElement | null)

    // When Escape closes it, focus returns to the trigger
    await user.keyboard('{Escape}')
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(opener).toHaveFocus()
  })

  it.each([
    ['return-dialog', 'sale-loading-return', (onClose: () => void) => <ReturnDialog saleId="sale-loading-return" onClose={onClose} />],
    ['cancel-dialog', 'sale-loading-cancel', (onClose: () => void) => <CancellationDialog saleId="sale-loading-cancel" onClose={onClose} />],
    ['refund-dialog', 'sale-loading-refund', (onClose: () => void) => <RefundDialog saleId="sale-loading-refund" onClose={onClose} />],
  ])('keeps a close action available while %s is loading', async (testId, saleId, createDialog) => {
    // Given the sale request remains pending
    server.use(
      http.get(`${BASE}/sales/${saleId}/`, async () => await new Promise<never>(() => {})),
    )
    const onClose = renderDialogHarness(testId, createDialog)
    const user = userEvent.setup()
    await user.click(screen.getByTestId(`${testId}-opener`))

    // When loading is visible, the operator can still cancel/close
    const dialog = await screen.findByTestId(testId)
    expect(within(dialog).getByRole('status')).toBeInTheDocument()
    await user.click(
      within(dialog).getByRole('button', { name: /^Fechar$/ }),
    )

    // Then the parent is notified and the pending request is abandoned on unmount
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
