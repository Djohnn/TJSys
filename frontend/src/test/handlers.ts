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

  http.get(`${BASE}/memberships/mfa-policy/`, () =>
    HttpResponse.json({ allow_totp: true, allow_email: true }),
  ),

  http.patch(`${BASE}/memberships/mfa-policy/`, async ({ request }) => {
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
]
