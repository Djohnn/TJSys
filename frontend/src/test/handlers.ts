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
]
