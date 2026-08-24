import { http, HttpResponse } from 'msw'

const BASE = '/api/v1'

export const handlers = [
  http.get(`${BASE}/auth/me/`, () =>
    HttpResponse.json({
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
    }),
  ),

  http.post(`${BASE}/auth/login/`, async ({ request }) => {
    const body = (await request.json()) as { email?: string; password?: string }
    if (body.email === 'mfa@zyrp.local') {
      return HttpResponse.json(
        { requires_mfa: true, mfa_session: 'mfa_session_abc' },
        { status: 200 },
      )
    }
    return HttpResponse.json(
      { access: 'access_token', refresh: 'refresh_token' },
      { status: 200 },
    )
  }),

  http.post(`${BASE}/auth/mfa/challenge/`, async ({ request }) => {
    const body = (await request.json()) as { mfa_session?: string; code?: string }
    if (body.code === '123456') {
      return HttpResponse.json({ access: 'access_token', refresh: 'refresh_token' }, { status: 200 })
    }
    return HttpResponse.json(
      { type: 'about:blank', title: 'Invalid code', status: 400, detail: 'Invalid MFA code' },
      { status: 400 },
    )
  }),

  http.post(`${BASE}/auth/logout/`, () =>
    HttpResponse.json({ detail: 'Logged out' }, { status: 200 }),
  ),

  http.get(`${BASE}/auth/csrf/`, () =>
    HttpResponse.json(
      { detail: 'CSRF cookie set' },
      {
        status: 200,
        headers: { 'Set-Cookie': 'csrftoken=test-csrf-token; Path=/' },
      },
    ),
  ),

  http.get(`${BASE}/test/success`, () =>
    HttpResponse.json({ message: 'ok', data: [1, 2, 3] }),
  ),

  http.post(`${BASE}/test/echo`, async ({ request }) =>
    HttpResponse.json(await request.json()),
  ),

  http.get(`${BASE}/test/401`, () =>
    HttpResponse.json(
      { type: 'about:blank', title: 'Unauthorized', status: 401, detail: 'Authentication credentials were not provided.' },
      { status: 401 },
    ),
  ),

  http.post(`${BASE}/test/422`, () =>
    HttpResponse.json(
      {
        type: 'about:blank',
        title: 'Validation Error',
        status: 422,
        detail: 'Invalid input',
        code: 'validation_error',
        errors: { email: ['Enter a valid email address.'] },
      },
      { status: 422 },
    ),
  ),

  http.get(`${BASE}/test/correlation`, () =>
    HttpResponse.json(
      { message: 'ok' },
      { status: 200, headers: { 'X-Correlation-ID': 'corr-123' } },
    ),
  ),

  http.get(`${BASE}/health/`, () =>
    HttpResponse.json({ status: 'ok' }),
  ),

  http.get(`${BASE}/companies/`, () =>
    HttpResponse.json({
      count: 2,
      next: null,
      previous: null,
      results: [
        { id: 'comp-1', name: 'Matriz', cnpj: '', ie: '', address_json: {}, is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
        { id: 'comp-2', name: 'Filial Ltda', cnpj: '', ie: '', address_json: {}, is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    }),
  ),

  http.get(`${BASE}/branches/`, () =>
    HttpResponse.json({
      count: 2,
      next: null,
      previous: null,
      results: [
        { id: 'branch-1', company: 'comp-1', company_name: 'Matriz', name: 'Centro', is_active: true, ie: '', address_json: {}, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
        { id: 'branch-2', company: 'comp-1', company_name: 'Matriz', name: 'Shopping', is_active: true, ie: '', address_json: {}, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    }),
  ),

  http.get(`${BASE}/branches/:id/`, ({ params }) =>
    HttpResponse.json({
      id: params.id,
      company: 'comp-1',
      company_name: 'Matriz',
      name: 'Centro',
      is_active: true,
      ie: '',
      address_json: {},
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }),
  ),

  http.get(`${BASE}/memberships/`, () =>
    HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
  ),

  http.patch(`${BASE}/memberships/:id/`, ({ params }) =>
    HttpResponse.json({
      id: Number(params.id),
      user: { id: 1, email: 'admin@zyrp.local', name: 'Admin' },
      role: 'admin',
      is_active: true,
      branch_ids: [],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-07-01T00:00:00Z',
    }),
  ),

  http.get(`${BASE}/invitations/`, () =>
    HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
  ),

  http.post(`${BASE}/invitations/`, () =>
    HttpResponse.json(
      { id: 1, email: 'test@zyrp.local', role: 'operator', status: 'pending', expires_at: '2026-08-01T00:00:00Z', created_at: '2026-07-22T00:00:00Z' },
      { status: 201 },
    ),
  ),

  http.post(`${BASE}/invitations/:id/resend/`, () =>
    HttpResponse.json({ detail: 'Convite reenviado.' }),
  ),

  http.get(`${BASE}/security/mfa-policy/`, () =>
    HttpResponse.json({ allow_totp: true, allow_email: true }),
  ),

  http.patch(`${BASE}/security/mfa-policy/`, async ({ request }) => {
    const body = await request.json() as { allow_totp?: boolean; allow_email?: boolean }
    if (body.allow_totp === false && body.allow_email === false) {
      return HttpResponse.json(
        { type: 'about:blank', title: 'Validation Error', status: 422, detail: 'Pelo menos um método MFA deve estar ativo.', code: 'validation_error' },
        { status: 422 },
      )
    }
    return HttpResponse.json(body)
  }),

  http.get(`${BASE}/devices/list/`, () =>
    HttpResponse.json({
      count: 2,
      next: null,
      previous: null,
      results: [
        { id: 'dev-1', name: 'iPhone 15', device_id: 'abc12345xyz', platform: 'iOS', app_version: '2.1.0', os_version: '18.0', last_seen_at: '2026-07-20T10:00:00Z', status: 'active', branch_name: 'Centro', registered_at: '2026-06-01T00:00:00Z' },
        { id: 'dev-2', name: 'Samsung Galaxy S24', device_id: 'def67890uvw', platform: 'Android', app_version: '2.1.0', os_version: '14.0', last_seen_at: '2026-07-19T08:00:00Z', status: 'active', branch_name: 'Shopping', registered_at: '2026-05-15T00:00:00Z' },
      ],
    }),
  ),

  http.post(`${BASE}/devices/:id/revoke/`, () =>
    HttpResponse.json({ detail: 'Dispositivo revogado com sucesso.' }),
  ),

  http.get(`${BASE}/inventory/balances/`, () =>
    HttpResponse.json({
      count: 2,
      next: null,
      previous: null,
      results: [
        { id: 'bal-1', product: 'prod-1', product_name: 'Parafuso', product_sku: 'PRF-001', branch: 'branch-1', branch_name: 'Centro', location: 'loc-a', location_name: 'Prateleira A', quantity: '100.00', unit_name: 'un', updated_at: '2026-07-22T10:00:00Z' },
        { id: 'bal-2', product: 'prod-2', product_name: 'Porca', product_sku: 'PRC-001', branch: 'branch-2', branch_name: 'Shopping', location: 'loc-b', location_name: 'Prateleira B', quantity: '50.50', unit_name: 'un', updated_at: '2026-07-22T09:00:00Z' },
      ],
    }),
  ),

  http.get(`${BASE}/inventory/movements/`, () =>
    HttpResponse.json({
      count: 2,
      next: null,
      previous: null,
      results: [
        { id: 'mov-1', product: 'prod-1', product_name: 'Parafuso', branch: 'branch-1', branch_name: 'Centro', type: 'in', quantity: '100.00', reason: 'Compra', reference_id: null, created_at: '2026-07-22T10:00:00Z', created_by_name: 'Admin' },
        { id: 'mov-2', product: 'prod-2', product_name: 'Porca', branch: 'branch-2', branch_name: 'Shopping', type: 'out', quantity: '-10.00', reason: 'Venda', reference_id: null, created_at: '2026-07-22T09:00:00Z', created_by_name: 'Operador' },
      ],
    }),
  ),

  http.post(`${BASE}/inventory/movements/`, () =>
    HttpResponse.json(
      {
        id: 'mov-new',
        product: 'prod-1',
        product_name: 'Parafuso',
        branch: 'branch-1',
        branch_name: 'Centro',
        type: 'in',
        quantity: '50.00',
        reason: 'Recebimento',
        reference_id: null,
        created_at: '2026-07-22T14:00:00Z',
        created_by_name: 'Admin',
      },
      { status: 201 },
    ),
  ),

  http.get(`${BASE}/inventory/lots/`, () =>
    HttpResponse.json({
      count: 2,
      next: null,
      previous: null,
      results: [
        { id: 'lot-1', product: 'prod-1', product_name: 'Parafuso', product_sku: 'PRF-001', lot_number: 'LOT-001', quantity: '100.00', expiry_date: '2027-01-01', branch: 'branch-1', branch_name: 'Centro', created_at: '2026-06-01T00:00:00Z' },
        { id: 'lot-2', product: 'prod-2', product_name: 'Porca', product_sku: 'PRC-001', lot_number: 'LOT-002', quantity: '50.00', expiry_date: null, branch: 'branch-2', branch_name: 'Shopping', created_at: '2026-06-15T00:00:00Z' },
      ],
    }),
  ),

  http.get(`${BASE}/catalog/products/`, () =>
    HttpResponse.json({
      count: 2,
      next: null,
      previous: null,
      results: [
        { id: 'prod-1', name: 'Parafuso', sku: 'PRF-001', barcode: '789000001', category: 'cat-1', category_name: 'Ferragens', unit: 'unit-1', unit_name: 'un', is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
        { id: 'prod-2', name: 'Porca', sku: 'PRC-001', barcode: '789000002', category: 'cat-1', category_name: 'Ferragens', unit: 'unit-1', unit_name: 'un', is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    }),
  ),

  http.post(`${BASE}/catalog/products/`, async ({ request }) =>
    HttpResponse.json(
      {
        id: 'prod-new',
        name: ((await request.json()) as { name?: string }).name ?? 'New Product',
        sku: '',
        barcode: '',
        category: null,
        category_name: '',
        unit: null,
        unit_name: '',
        is_active: true,
        created_at: '2026-07-22T00:00:00Z',
        updated_at: '2026-07-22T00:00:00Z',
      },
      { status: 201 },
    ),
  ),

  http.patch(`${BASE}/catalog/products/:id/`, async ({ request, params }) =>
    HttpResponse.json({
      id: params.id,
      ...((await request.json()) as Record<string, unknown>),
      category_name: '',
      unit_name: '',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-07-22T00:00:00Z',
    }),
  ),

  http.get(`${BASE}/catalog/categories/`, () =>
    HttpResponse.json({
      count: 2,
      next: null,
      previous: null,
      results: [
        { id: 'cat-1', name: 'Ferragens', is_active: true },
        { id: 'cat-2', name: 'Hidráulica', is_active: true },
      ],
    }),
  ),

  http.post(`${BASE}/catalog/categories/`, async ({ request }) =>
    HttpResponse.json(
      {
        id: 'cat-new',
        name: ((await request.json()) as { name?: string }).name ?? 'New Category',
        is_active: true,
      },
      { status: 201 },
    ),
  ),

  http.patch(`${BASE}/catalog/categories/:id/`, async ({ request, params }) =>
    HttpResponse.json({
      id: params.id,
      ...((await request.json()) as Record<string, unknown>),
      is_active: true,
    }),
  ),

  http.get(`${BASE}/catalog/units/`, () =>
    HttpResponse.json({
      count: 2,
      next: null,
      previous: null,
      results: [
        { id: 'unit-1', name: 'Unidade', abbreviation: 'un' },
        { id: 'unit-2', name: 'Quilograma', abbreviation: 'kg' },
      ],
    }),
  ),

  http.get(`${BASE}/purchasing/suppliers/`, () =>
    HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
  ),

  http.post(`${BASE}/purchasing/suppliers/`, async ({ request }) => {
    const body = await request.json() as { name?: string }
    return HttpResponse.json(
      { id: 's-default', name: body.name, cnpj: '', ie: '', is_active: true, created_at: '2026-01-01T00:00:00Z' },
      { status: 201 },
    )
  }),

  http.patch(`${BASE}/purchasing/suppliers/:id/`, async ({ request, params }) => {
    const body = await request.json() as { name?: string }
    return HttpResponse.json(
      { id: params.id, ...body, cnpj: '', ie: '', is_active: true, created_at: '2026-01-01T00:00:00Z' },
    )
  }),

  http.get(`${BASE}/purchasing/orders/`, () =>
    HttpResponse.json({
      count: 2,
      next: null,
      previous: null,
      results: [
        { id: 'order-1', number: 'PO-001', supplier: 's1', supplier_name: 'Fornecedor A', branch: 'b1', branch_name: 'Centro', status: 'approved', total: '100.00', items: [], created_at: '2026-07-20T00:00:00Z', created_by_name: 'Admin' },
        { id: 'order-2', number: 'PO-002', supplier: 's2', supplier_name: 'Fornecedor B', branch: 'b2', branch_name: 'Shopping', status: 'draft', total: '200.00', items: [], created_at: '2026-07-21T00:00:00Z', created_by_name: 'Admin' },
      ],
    }),
  ),

  http.post(`${BASE}/purchasing/orders/`, async ({ request }) => {
    const body = await request.json() as { supplier?: string; branch?: string; items?: unknown[] }
    return HttpResponse.json(
      {
        id: 'po-default',
        number: 'PO-001',
        supplier: body.supplier,
        supplier_name: 'Default Supplier',
        branch: body.branch,
        branch_name: 'Default Branch',
        status: 'draft',
        total: '0.00',
        items: (body.items ?? []).map((_: unknown, i: number) => ({
          id: `item-${i}`,
          product: 'prod-default',
          product_name: 'Default Product',
          quantity: '1',
          unit_price: '0.00',
          total: '0.00',
        })),
        created_at: '2026-07-22T00:00:00Z',
        created_by_name: 'Admin',
      },
      { status: 201 },
    )
  }),

  http.get(`${BASE}/purchasing/orders/:id/`, ({ params }) => {
    const orderItems: Record<string, { id: string; product: string; product_name: string; quantity: string; unit_price: string; total: string }[]> = {
      'order-1': [
        { id: 'item-1', product: 'prod-1', product_name: 'Produto A', quantity: '10', unit_price: '10.00', total: '100.00' },
        { id: 'item-2', product: 'prod-2', product_name: 'Produto B', quantity: '5', unit_price: '20.00', total: '100.00' },
      ],
    }
    const items = orderItems[params.id as string] ?? [
      { id: 'item-1', product: 'prod-1', product_name: 'Produto 1', quantity: '2', unit_price: '50.00', total: '100.00' },
    ]
    return HttpResponse.json({
      id: params.id,
      number: 'PO-001',
      supplier: 's1',
      supplier_name: 'Fornecedor Padrão',
      branch: 'b1',
      branch_name: 'Filial Padrão',
      status: 'draft',
      total: '100.00',
      items,
      created_at: '2026-07-22T00:00:00Z',
      created_by_name: 'Admin',
    })
  }),

  http.patch(`${BASE}/purchasing/orders/:id/`, async ({ request, params }) => {
    const body = await request.json() as { supplier?: string }
    return HttpResponse.json({
      id: params.id,
      number: 'PO-001',
      supplier: body.supplier,
      supplier_name: 'Fornecedor Padrão',
      branch: 'b1',
      branch_name: 'Filial Padrão',
      status: 'draft',
      total: '100.00',
      items: [],
      created_at: '2026-07-22T00:00:00Z',
      created_by_name: 'Admin',
    })
  }),

  http.post(`${BASE}/purchasing/orders/:id/approve/`, ({ params }) =>
    HttpResponse.json({
      id: params.id,
      number: 'PO-001',
      supplier: 's1',
      supplier_name: 'Fornecedor Padrão',
      branch: 'b1',
      branch_name: 'Filial Padrão',
      status: 'approved',
      total: '100.00',
      items: [],
      created_at: '2026-07-22T00:00:00Z',
      created_by_name: 'Admin',
    }),
  ),

  // Purchasing — Receipts
  http.get(`${BASE}/purchasing/receipts/`, ({ request }) => {
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const order = url.searchParams.get('order')
    let results = RECEIPTS_DATA
    if (status) results = results.filter((r) => r.status === status)
    if (order) results = results.filter((r) => r.order === order)
    return HttpResponse.json({ count: results.length, next: null, previous: null, results })
  }),

  http.post(`${BASE}/purchasing/receipts/`, async ({ request }) => {
    const body = await request.json() as { order?: string; items?: { product: string; received_quantity: string }[] }
    if (!body.order) {
      return HttpResponse.json(
        { type: 'about:blank', title: 'Validation Error', status: 422, detail: 'Invalid input', errors: { order: ['Este campo é obrigatório.'] } },
        { status: 422 },
      )
    }
    if (body.items?.some((i) => Number.parseFloat(i.received_quantity) > 10)) {
      return HttpResponse.json(
        { type: 'about:blank', title: 'Validation Error', status: 422, detail: 'Quantidade recebida excede a quantidade pedida.', code: 'over_receipt' },
        { status: 422 },
      )
    }
    return HttpResponse.json(
      {
        id: 'receipt-new',
        order: body.order,
        order_number: 'PO-001',
        supplier_name: 'Fornecedor A',
        branch_name: 'Centro',
        status: 'completed',
        items: (body.items ?? []).map((item, i) => ({
          id: `ri-new-${i}`,
          product: item.product,
          product_name: `Produto ${i + 1}`,
          ordered_quantity: '10',
          received_quantity: item.received_quantity,
          unit_name: 'UN',
        })),
        created_at: '2026-07-22T10:00:00Z',
        created_by_name: 'Admin',
        linked_stock_movement: 'sm-001',
        linked_payable: 'pay-001',
        linked_fiscal_document: 'fd-001',
      },
      { status: 201 },
    )
  }),

  http.get(`${BASE}/purchasing/receipts/:id/`, ({ params }) => {
    const receipt = RECEIPTS_DATA.find((r) => r.id === params.id)
    if (!receipt) {
      return HttpResponse.json(
        { type: 'about:blank', title: 'Not Found', status: 404, detail: 'Recebimento não encontrado.' },
        { status: 404 },
      )
    }
    return HttpResponse.json(receipt)
  }),

  http.post(`${BASE}/purchasing/receipts/:id/cancel/`, ({ params }) => {
    if (params.id === 'receipt-fail-cancel') {
      return HttpResponse.json(
        { type: 'about:blank', title: 'Conflict', status: 409, detail: 'Recebimento não pode ser cancelado.', code: 'cannot_cancel' },
        { status: 409 },
      )
    }
    return HttpResponse.json({ detail: 'Recebimento cancelado com sucesso.' })
  }),

  // Purchasing — Returns
  http.get(`${BASE}/purchasing/returns/`, ({ request }) => {
    const url = new URL(request.url)
    const supplier = url.searchParams.get('supplier')
    let results = RETURNS_DATA
    if (supplier) results = results.filter((r) => r.supplier_name === supplier)
    return HttpResponse.json({ count: results.length, next: null, previous: null, results })
  }),

  http.post(`${BASE}/purchasing/returns/`, async ({ request }) => {
    const body = await request.json() as { order?: string; reason?: string; items?: { product: string; quantity: string }[] }
    if (!body.order || !body.reason) {
      return HttpResponse.json(
        { type: 'about:blank', title: 'Validation Error', status: 422, detail: 'Invalid input', errors: { order: ['Este campo é obrigatório.'], reason: ['Este campo é obrigatório.'] } },
        { status: 422 },
      )
    }
    return HttpResponse.json(
      {
        id: 'return-new',
        supplier_name: 'Fornecedor A',
        order_number: 'PO-001',
        total: '50.00',
        reason: body.reason,
        status: 'pending',
        created_at: '2026-07-22T10:00:00Z',
      },
      { status: 201 },
    )
  }),

  // Purchasing — Recurring Templates
  http.get(`${BASE}/purchasing/recurring-templates/`, () =>
    HttpResponse.json({
      count: TEMPLATES_DATA.length,
      next: null,
      previous: null,
      results: TEMPLATES_DATA,
    }),
  ),

  http.patch(`${BASE}/purchasing/recurring-templates/:id/`, async ({ request, params }) => {
    const body = await request.json() as { is_active?: boolean }
    const template = TEMPLATES_DATA.find((t) => t.id === params.id)
    if (!template) {
      return HttpResponse.json(
        { type: 'about:blank', title: 'Not Found', status: 404, detail: 'Template não encontrado.' },
        { status: 404 },
      )
    }
    return HttpResponse.json({ ...template, is_active: body.is_active ?? template.is_active })
  }),

  // Sales — management list & compensating actions
  http.get(`${BASE}/sales/`, ({ request }) => {
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    let results = SALES_LIST_DATA
    if (status) results = results.filter((s) => s.status === status)
    return HttpResponse.json({ count: results.length, next: null, previous: null, results })
  }),

  http.get(`${BASE}/sales/:id/`, ({ params }) => {
    const detail = SALES_DETAIL_MAP[params.id as string]
    if (detail) return HttpResponse.json(detail)
    const sale = SALES_DATA.find((s) => s.id === params.id)
    if (!sale) {
      return HttpResponse.json(
        { type: 'about:blank', title: 'Not Found', status: 404, detail: 'Venda não encontrada.', correlationId: 'corr-sale-404' },
        { status: 404, headers: { 'X-Correlation-ID': 'corr-sale-404' } },
      )
    }
    return HttpResponse.json(sale)
  }),

  http.post(`${BASE}/sales/:id/returns/`, async ({ request, params }) => {
    const saleId = params.id as string
    if (saleId === 'sale-409-return' || saleId === 'sale-conflict') {
      return HttpResponse.json(
        { type: 'about:blank', title: 'Conflict', status: 409, detail: 'Esta venda já possui devolução registrada.', code: 'already_returned' },
        { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
      )
    }
    const body = await request.json() as { items?: { sale_item_id?: string; quantity: string; product?: string }[]; reason?: string }
    if (!body.items?.length || body.items.some((item) => !item.sale_item_id || item.product) || !body.reason?.trim()) {
      return HttpResponse.json(
        { type: 'about:blank', title: 'Validation Error', status: 422, detail: 'Invalid input', errors: { reason: !body.reason?.trim() ? ['Este campo é obrigatório.'] : undefined } },
        { status: 422, headers: { 'Content-Type': 'application/problem+json' } },
      )
    }
    return HttpResponse.json({ detail: 'Devolução registrada com sucesso.' }, { status: 201 })
  }),

  http.post(`${BASE}/sales/:id/cancel/`, async ({ request, params }) => {
    const saleId = params.id as string
    if (saleId === 'sale-409-cancel' || saleId === 'sale-already-cancelled') {
      return HttpResponse.json(
        { type: 'about:blank', title: 'Conflict', status: 409, detail: 'Esta venda já está cancelada.', code: 'already_cancelled' },
        { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
      )
    }
    const body = await request.json() as { reason?: string }
    if (!body.reason?.trim()) {
      return HttpResponse.json(
        { type: 'about:blank', title: 'Validation Error', status: 422, detail: 'Motivo é obrigatório.', errors: { reason: ['Este campo é obrigatório.'] } },
        { status: 422, headers: { 'Content-Type': 'application/problem+json' } },
      )
    }
    return HttpResponse.json({ detail: 'Venda cancelada com sucesso.' }, { status: 201 })
  }),

  http.post(`${BASE}/sales/:id/refund/`, async ({ request, params }) => {
    const saleId = params.id as string
    if (saleId === 'sale-409-refund' || saleId === 'sale-already-refunded') {
      return HttpResponse.json(
        { type: 'about:blank', title: 'Conflict', status: 409, detail: 'Esta venda já possui reembolso.', code: 'already_refunded' },
        { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
      )
    }
    if (saleId === 'sale-403') {
      return HttpResponse.json(
        { type: 'about:blank', title: 'Forbidden', status: 403, detail: 'Permissão negada. Reautenticação MFA necessária.', code: 'mfa_required' },
        { status: 403 },
      )
    }
    const body = await request.json() as { method?: string; amount?: string; reason?: string }
    if (!body.method || !['cash', 'pix', 'card_external'].includes(body.method) || !body.reason?.trim()) {
      return HttpResponse.json(
        { type: 'about:blank', title: 'Validation Error', status: 422, detail: 'Método e motivo são obrigatórios.', errors: { reason: ['Este campo é obrigatório.'] } },
        { status: 422, headers: { 'Content-Type': 'application/problem+json' } },
      )
    }
    return HttpResponse.json({ detail: 'Reembolso processado com sucesso.' }, { status: 201 })
  }),

  // Cash sessions — management
  http.get(`${BASE}/cash-sessions/`, () => {
    return HttpResponse.json({ count: CASH_SESSIONS_LIST.length, next: null, previous: null, results: CASH_SESSIONS_LIST })
  }),

  http.get(`${BASE}/cash-sessions/:id/`, ({ params }) => {
    const session = CASH_SESSIONS_LIST.find((s) => s.id === params.id)
    if (!session) {
      return HttpResponse.json(
        { type: 'about:blank', title: 'Not Found', status: 404, detail: 'Sessão de caixa não encontrada.' },
        { status: 404 },
      )
    }
    const detail = CASH_SESSION_DETAILS[params.id as string]
    return HttpResponse.json(detail ?? session)
  }),

  // People — PII-controlled
  http.get(`${BASE}/people/`, ({ request }) => {
    const url = new URL(request.url)
    const q = url.searchParams.get('q')
    const role = url.searchParams.get('role')
    const active = url.searchParams.get('active')
    const all = [
      { id: 'p1', person_type: 'PF', name: 'João Silva', document: '123.456.789-00', role: 'customer', is_active: true },
      { id: 'p2', person_type: 'PJ', name: 'Empresa ABC Ltda', document: '11.222.333/0001-44', role: 'supplier', is_active: true },
      { id: 'p3', person_type: 'PF', name: 'Maria Oliveira', document: '987.654.321-00', role: 'employee', is_active: false },
    ]
    let results = all
    if (q) results = results.filter((r) => r.name.includes(q))
    if (role) results = results.filter((r) => r.role === role)
    if (active !== '') results = results.filter((r) => String(r.is_active) === active)
    return HttpResponse.json({ count: results.length, next: null, previous: null, results })
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
    return HttpResponse.json({
      id: params.id,
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
      ],
      contacts: [
        { id: 'cont-1', type: 'phone', value: '(11) 99999-8888', is_primary: true },
      ],
      consents: [
        { id: 'cons-1', type: 'privacy_policy', granted_at: '2026-01-01T00:00:00Z', revoked_at: null },
      ],
    })
  }),

  http.patch(`${BASE}/people/:id/`, async ({ request, params }) => {
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({ id: params.id, ...body })
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
]

interface PurchaseReceipt {
  id: string
  order: string
  order_number: string
  supplier_name: string
  branch_name: string
  status: string
  items: { id: string; product: string; product_name: string; ordered_quantity: string; received_quantity: string; unit_name: string }[]
  created_at: string
  created_by_name: string
  linked_stock_movement: string | null
  linked_payable: string | null
  linked_fiscal_document: string | null
}

interface SupplierReturn {
  id: string
  supplier_name: string
  order_number: string
  total: string
  reason: string
  status: string
  created_at: string
}

interface RecurringTemplate {
  id: string
  name: string
  supplier_name: string
  frequency: string
  next_date: string
  is_active: boolean
}

const RECEIPTS_DATA: PurchaseReceipt[] = [
  {
    id: 'receipt-1',
    order: 'order-1',
    order_number: 'PO-001',
    supplier_name: 'Fornecedor A',
    branch_name: 'Centro',
    status: 'completed',
    items: [
      { id: 'ri-1', product: 'prod-1', product_name: 'Produto A', ordered_quantity: '10', received_quantity: '10', unit_name: 'UN' },
      { id: 'ri-2', product: 'prod-2', product_name: 'Produto B', ordered_quantity: '5', received_quantity: '5', unit_name: 'CX' },
    ],
    created_at: '2026-07-20T10:00:00Z',
    created_by_name: 'Admin',
    linked_stock_movement: 'sm-001',
    linked_payable: 'pay-001',
    linked_fiscal_document: 'fd-001',
  },
  {
    id: 'receipt-2',
    order: 'order-2',
    order_number: 'PO-002',
    supplier_name: 'Fornecedor B',
    branch_name: 'Shopping',
    status: 'draft',
    items: [
      { id: 'ri-3', product: 'prod-3', product_name: 'Produto C', ordered_quantity: '20', received_quantity: '0', unit_name: 'KG' },
    ],
    created_at: '2026-07-21T14:00:00Z',
    created_by_name: 'Admin',
    linked_stock_movement: null,
    linked_payable: null,
    linked_fiscal_document: null,
  },
  {
    id: 'receipt-3',
    order: 'order-3',
    order_number: 'PO-003',
    supplier_name: 'Fornecedor A',
    branch_name: 'Centro',
    status: 'cancelled',
    items: [],
    created_at: '2026-07-19T08:00:00Z',
    created_by_name: 'Admin',
    linked_stock_movement: null,
    linked_payable: null,
    linked_fiscal_document: null,
  },
  {
    id: 'receipt-fail-cancel',
    order: 'order-4',
    order_number: 'PO-004',
    supplier_name: 'Fornecedor C',
    branch_name: 'Centro',
    status: 'completed',
    items: [
      { id: 'ri-4', product: 'prod-4', product_name: 'Produto D', ordered_quantity: '10', received_quantity: '10', unit_name: 'UN' },
    ],
    created_at: '2026-07-22T10:00:00Z',
    created_by_name: 'Admin',
    linked_stock_movement: null,
    linked_payable: null,
    linked_fiscal_document: null,
  },
]

const RETURNS_DATA: SupplierReturn[] = [
  {
    id: 'return-1',
    supplier_name: 'Fornecedor A',
    order_number: 'PO-001',
    total: '150.00',
    reason: 'Produto com defeito',
    status: 'pending',
    created_at: '2026-07-21T10:00:00Z',
  },
  {
    id: 'return-2',
    supplier_name: 'Fornecedor B',
    order_number: 'PO-002',
    total: '75.50',
    reason: 'Quantidade excedente',
    status: 'approved',
    created_at: '2026-07-20T08:00:00Z',
  },
]

interface SaleItem {
  id: string
  product: string
  product_name: string
  quantity: string
  unit_price: string
  total: string
}

interface Sale {
  id: string
  number: string
  status: string
  customer_name?: string
  branch_name?: string
  total: string
  created_at: string
  items: SaleItem[]
}

const SALES_DATA: Sale[] = [
  {
    id: 'sale-1',
    number: 'V-001',
    status: 'completed',
    customer_name: 'Cliente A',
    branch_name: 'Centro',
    total: '150.00',
    created_at: '2026-07-22T10:00:00Z',
    items: [
      { id: 'si-1', product: 'prod-1', product_name: 'Parafuso', quantity: '10', unit_price: '10.00', total: '100.00' },
      { id: 'si-2', product: 'prod-2', product_name: 'Porca', quantity: '5', unit_price: '10.00', total: '50.00' },
    ],
  },
  {
    id: 'sale-409-return',
    number: 'V-002',
    status: 'returned',
    customer_name: 'Cliente B',
    branch_name: 'Shopping',
    total: '200.00',
    created_at: '2026-07-22T11:00:00Z',
    items: [
      { id: 'si-3', product: 'prod-3', product_name: 'Prego', quantity: '20', unit_price: '10.00', total: '200.00' },
    ],
  },
  {
    id: 'sale-409-cancel',
    number: 'V-003',
    status: 'cancelled',
    customer_name: 'Cliente C',
    branch_name: 'Centro',
    total: '75.00',
    created_at: '2026-07-21T10:00:00Z',
    items: [
      { id: 'si-4', product: 'prod-4', product_name: 'Arruela', quantity: '15', unit_price: '5.00', total: '75.00' },
    ],
  },
  {
    id: 'sale-403',
    number: 'V-004',
    status: 'completed',
    customer_name: 'Cliente D',
    branch_name: 'Shopping',
    total: '300.00',
    created_at: '2026-07-22T12:00:00Z',
    items: [
      { id: 'si-5', product: 'prod-5', product_name: 'Martelo', quantity: '3', unit_price: '100.00', total: '300.00' },
    ],
  },
]

const SALES_LIST_DATA = [
  {
    id: 'sale-1', created_at: '2026-07-22T10:30:00Z', customer: 'cust-1', customer_name: 'João Silva',
    operator: 'op-1', operator_name: 'Maria Souza', branch: 'branch-1', branch_name: 'Centro',
    device: 'dev-1', device_name: 'PDV Centro #1', total: '150.00', status: 'completed', status_label: 'Concluída',
    items: [], payments: [], linked_stock_movement: null, linked_fiscal_document: null, linked_financial_entries: [],
  },
  {
    id: 'sale-2', created_at: '2026-07-22T14:00:00Z', customer: 'cust-2', customer_name: 'Maria Santos',
    operator: 'op-1', operator_name: 'Maria Souza', branch: 'branch-2', branch_name: 'Shopping',
    device: 'dev-2', device_name: 'PDV Shopping #1', total: '89.90', status: 'cancelled', status_label: 'Cancelada',
    items: [], payments: [], linked_stock_movement: null, linked_fiscal_document: null, linked_financial_entries: [],
  },
]

const SALES_DETAIL_MAP: Record<string, unknown> = {
  'sale-1': {
    id: 'sale-1', created_at: '2026-07-22T10:30:00Z', customer: 'cust-1', customer_name: 'João Silva',
    operator: 'op-1', operator_name: 'Maria Souza', branch: 'branch-1', branch_name: 'Centro',
    device: 'dev-1', device_name: 'PDV Centro #1', total: '150.00', status: 'completed', status_label: 'Concluída',
    items: [
      { id: 'si-1', product: 'prod-1', product_name: 'Parafuso', quantity: '10', unit_price: '10.00', total: '100.00' },
      { id: 'si-2', product: 'prod-2', product_name: 'Porca', quantity: '5', unit_price: '10.00', total: '50.00' },
    ],
    payments: [
      { id: 'sp-1', method: 'cash', method_name: 'Dinheiro', amount: '150.00', status: 'confirmed', status_label: 'Confirmado' },
    ],
    linked_stock_movement: 'sm-001', linked_fiscal_document: 'fd-001', linked_financial_entries: ['fin-001', 'fin-002'],
  },
  'sale-409-cancel': {
    id: 'sale-409-cancel', created_at: '2026-07-21T10:00:00Z', customer: 'cust-3', customer_name: 'Cliente C',
    operator: 'op-1', operator_name: 'Maria Souza', branch: 'branch-1', branch_name: 'Centro',
    device: 'dev-1', device_name: 'PDV Centro #1', total: '75.00', status: 'completed', status_label: 'Concluída',
    items: [{ id: 'si-4', product: 'prod-4', product_name: 'Arruela', quantity: '15', unit_price: '5.00', total: '75.00' }],
    payments: [{ id: 'sp-4', method: 'cash', method_name: 'Dinheiro', amount: '75.00', status: 'confirmed', status_label: 'Confirmado' }],
    linked_stock_movement: null, linked_fiscal_document: null, linked_financial_entries: [],
  },
  'sale-409-return': {
    id: 'sale-409-return', created_at: '2026-07-22T11:00:00Z', customer: 'cust-2', customer_name: 'Cliente B',
    operator: 'op-1', operator_name: 'Maria Souza', branch: 'branch-2', branch_name: 'Shopping',
    device: 'dev-2', device_name: 'PDV Shopping #1', total: '200.00', status: 'completed', status_label: 'Concluída',
    items: [{ id: 'si-3', product: 'prod-3', product_name: 'Prego', quantity: '20', unit_price: '10.00', total: '200.00' }],
    payments: [{ id: 'sp-3', method: 'cash', method_name: 'Dinheiro', amount: '200.00', status: 'confirmed', status_label: 'Confirmado' }],
    linked_stock_movement: null, linked_fiscal_document: null, linked_financial_entries: [],
  },
  'sale-409-refund': {
    id: 'sale-409-refund', created_at: '2026-07-22T12:00:00Z', customer: 'cust-4', customer_name: 'Cliente E',
    operator: 'op-1', operator_name: 'Maria Souza', branch: 'branch-1', branch_name: 'Centro',
    device: 'dev-1', device_name: 'PDV Centro #1', total: '120.00', status: 'completed', status_label: 'Concluída',
    items: [{ id: 'si-6', product: 'prod-6', product_name: 'Chave', quantity: '4', unit_price: '30.00', total: '120.00' }],
    payments: [{ id: 'sp-6', method: 'cash', method_name: 'Dinheiro', amount: '120.00', status: 'confirmed', status_label: 'Confirmado' }],
    linked_stock_movement: null, linked_fiscal_document: null, linked_financial_entries: [],
  },
  'sale-403': {
    id: 'sale-403', created_at: '2026-07-22T12:00:00Z', customer: 'cust-5', customer_name: 'Cliente D',
    operator: 'op-1', operator_name: 'Maria Souza', branch: 'branch-2', branch_name: 'Shopping',
    device: 'dev-2', device_name: 'PDV Shopping #1', total: '300.00', status: 'completed', status_label: 'Concluída',
    items: [{ id: 'si-5', product: 'prod-5', product_name: 'Martelo', quantity: '3', unit_price: '100.00', total: '300.00' }],
    payments: [{ id: 'sp-5', method: 'cash', method_name: 'Dinheiro', amount: '300.00', status: 'confirmed', status_label: 'Confirmado' }],
    linked_stock_movement: null, linked_fiscal_document: null, linked_financial_entries: [],
  },
}

const CASH_SESSIONS_LIST = [
  {
    id: 'cs-1', date: '2026-07-22', branch: 'branch-1', branch_name: 'Centro',
    operator: 'op-1', operator_name: 'Maria Souza', opened_at: '2026-07-22T08:00:00Z',
    closed_at: '2026-07-22T18:00:00Z', expected_balance: '2500.00', actual_balance: '2510.00',
    difference: '10.00', status: 'closed', movements: [],
  },
  {
    id: 'cs-2', date: '2026-07-22', branch: 'branch-2', branch_name: 'Shopping',
    operator: 'op-1', operator_name: 'Maria Souza', opened_at: '2026-07-22T09:00:00Z',
    closed_at: '2026-07-22T17:00:00Z', expected_balance: '3089.90', actual_balance: '3075.00',
    difference: '-14.90', status: 'closed', movements: [],
  },
]

const CASH_SESSION_DETAILS: Record<string, unknown> = {
  'cs-1': {
    ...CASH_SESSIONS_LIST[0],
    movements: [
      { id: 'cm-1', type: 'opening', type_label: 'Abertura', amount: '500.00', description: 'Fundo de caixa', created_at: '2026-07-22T08:00:00Z' },
      { id: 'cm-2', type: 'sale', type_label: 'Venda', amount: '150.00', description: 'Venda #sale-1', created_at: '2026-07-22T10:30:00Z' },
      { id: 'cm-3', type: 'withdrawal', type_label: 'Retirada', amount: '-100.00', description: 'Pagamento fornecedor', created_at: '2026-07-22T14:00:00Z' },
      { id: 'cm-4', type: 'closing', type_label: 'Fechamento', amount: '1960.00', description: 'Fechamento de caixa', created_at: '2026-07-22T18:00:00Z' },
    ],
  },
}

const TEMPLATES_DATA: RecurringTemplate[] = [
  {
    id: 'tmpl-1',
    name: 'Pedido Semanal Insumos',
    supplier_name: 'Fornecedor A',
    frequency: 'weekly',
    next_date: '2026-07-28',
    is_active: true,
  },
  {
    id: 'tmpl-2',
    name: 'Pedido Mensal Matéria-Prima',
    supplier_name: 'Fornecedor B',
    frequency: 'monthly',
    next_date: '2026-08-01',
    is_active: false,
  },
]

// Favorites handlers
const favoritesDb: Array<{
  id: string
  entity_type: string
  entity_id: string | null
  label: string
  route: string
  position: number
  icon: string
  created_at: string
}> = []

let favoriteCounter = 0

export const favoritesHandlers = [
  http.get(`${BASE}/favorites/`, () => {
    return HttpResponse.json(favoritesDb)
  }),

  http.post(`${BASE}/favorites/`, async ({ request }) => {
    const body = (await request.json()) as {
      entity_type?: string
      entity_id?: string | null
      label?: string
      route?: string
      position?: number
      icon?: string
    }
    favoriteCounter++
    const favorite = {
      id: `fav-${favoriteCounter}`,
      entity_type: body.entity_type ?? 'route',
      entity_id: body.entity_id ?? null,
      label: body.label ?? 'Untitled',
      route: body.route ?? '/',
      position: body.position ?? favoritesDb.length,
      icon: body.icon ?? '',
      created_at: new Date().toISOString(),
    }
    favoritesDb.push(favorite)
    return HttpResponse.json(favorite, { status: 201 })
  }),

  http.delete(`${BASE}/favorites/:id/`, ({ params }) => {
    const idx = favoritesDb.findIndex((f) => f.id === params.id)
    if (idx !== -1) favoritesDb.splice(idx, 1)
    return HttpResponse.json(null, { status: 204 })
  }),

  http.put(`${BASE}/favorites/reorder/`, async ({ request }) => {
    const body = (await request.json()) as { favorite_ids?: string[] }
    const ids = body.favorite_ids ?? []
    ids.forEach((id, idx) => {
      const fav = favoritesDb.find((f) => f.id === id)
      if (fav) fav.position = idx
    })
    return HttpResponse.json({ detail: 'Reorder successful.' })
  }),

  http.get(`${BASE}/search/`, ({ request }) => {
    const url = new URL(request.url)
    const q = url.searchParams.get('q') ?? ''
    if (q.length < 2) return HttpResponse.json({ results: [] })
    return HttpResponse.json({
      results: [
        {
          type: 'product',
          id: 'prod-1',
          label: `Produto ${q}`,
          subtitle: 'SKU: TEST-001',
          route: '/app/catalog/products/prod-1/edit',
          icon: 'catalog',
        },
      ],
    })
  }),

  http.get(`${BASE}/auth/shortcuts/`, () => {
    return HttpResponse.json({ shortcuts: {} })
  }),

  http.put(`${BASE}/auth/shortcuts/`, async ({ request }) => {
    const body = (await request.json()) as { shortcuts?: Record<string, string> }
    return HttpResponse.json({ shortcuts: body.shortcuts ?? {} })
  }),
]
