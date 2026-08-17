import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../test/server'
import { apiRequest, getCsrfToken } from './client'
import { ApiProblemError, UnauthorizedError } from './problem'

const BASE = '/api/v1'

describe('getCsrfToken', () => {
  let originalCookie: PropertyDescriptor | undefined

  beforeEach(() => {
    originalCookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')
  })

  afterEach(() => {
    if (originalCookie) {
      Object.defineProperty(document, 'cookie', originalCookie)
    }
  })

  it('returns null when no csrf cookie', () => {
    Object.defineProperty(document, 'cookie', {
      value: '',
      configurable: true,
      writable: true,
    })
    expect(getCsrfToken()).toBeNull()
  })

  it('parses csrftoken from cookie string', () => {
    Object.defineProperty(document, 'cookie', {
      value: 'csrftoken=abc123; sessionid=xyz',
      configurable: true,
      writable: true,
    })
    expect(getCsrfToken()).toBe('abc123')
  })

  it('returns null for other cookies', () => {
    Object.defineProperty(document, 'cookie', {
      value: 'sessionid=xyz',
      configurable: true,
      writable: true,
    })
    expect(getCsrfToken()).toBeNull()
  })
})

describe('apiRequest', () => {
  let originalCookie: PropertyDescriptor | undefined

  beforeEach(() => {
    originalCookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')
    Object.defineProperty(document, 'cookie', {
      value: '',
      configurable: true,
      writable: true,
    })
  })

  afterEach(() => {
    if (originalCookie) {
      Object.defineProperty(document, 'cookie', originalCookie)
    }
  })

  it('performs a successful GET and returns parsed JSON', async () => {
    const result = await apiRequest<{ message: string; data: number[] }>(
      '/test/success',
    )
    expect(result).toEqual({ message: 'ok', data: [1, 2, 3] })
  })

  it('sends X-CSRFToken header on unsafe methods', async () => {
    const capturedHeaders: Record<string, string> = {}
    server.use(
      http.post(`${BASE}/test/echo`, async ({ request }) => {
        request.headers.forEach((value, key) => {
          capturedHeaders[key.toLowerCase()] = value
        })
        return HttpResponse.json(await request.json())
      }),
    )

    Object.defineProperty(document, 'cookie', {
      value: 'csrftoken=real-csrf-value',
      configurable: true,
      writable: true,
    })

    await apiRequest('/test/echo', { method: 'POST', body: { test: true } })

    expect(capturedHeaders['x-csrftoken']).toBe('real-csrf-value')
  })

  it('sends credentials: include', async () => {
    const originalFetch = globalThis.fetch
    let capturedCredentials: RequestCredentials | undefined
    globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
      capturedCredentials = init?.credentials
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
    }) as typeof fetch

    await apiRequest('/test/success')

    expect(capturedCredentials).toBe('include')

    globalThis.fetch = originalFetch
  })

  it('sends X-Tenant-ID header when tenantId is provided', async () => {
    let capturedTenantId: string | undefined
    server.use(
      http.get(`${BASE}/test/success`, async ({ request }) => {
        capturedTenantId = request.headers.get('X-Tenant-ID') ?? undefined
        return HttpResponse.json({})
      }),
    )

    await apiRequest('/test/success', { tenantId: 'tenant-abc' })

    expect(capturedTenantId).toBe('tenant-abc')
  })

  it('does not retry a GET rejected with AbortError', async () => {
    // Given an in-flight GET that the browser aborts, when it rejects, then the abort propagates once.
    const originalFetch = globalThis.fetch
    const abortError = new DOMException('Request aborted', 'AbortError')
    let attempts = 0
    globalThis.fetch = (() => {
      attempts += 1
      return Promise.reject(abortError)
    }) as typeof fetch

    try {
      await expect(apiRequest('/test/aborted')).rejects.toBe(abortError)
      expect(attempts).toBe(1)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('does not retry a GET when its signal is already aborted', async () => {
    // Given an aborted signal, when the GET fails, then its first error propagates without retrying.
    const originalFetch = globalThis.fetch
    const controller = new AbortController()
    const networkError = new Error('network failure')
    let attempts = 0
    controller.abort()
    globalThis.fetch = (() => {
      attempts += 1
      return Promise.reject(networkError)
    }) as typeof fetch

    try {
      await expect(
        apiRequest('/test/already-aborted', { signal: controller.signal }),
      ).rejects.toBe(networkError)
      expect(attempts).toBe(1)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('retries one transient GET failure', async () => {
    // Given a non-abort GET failure, when it is transient, then one existing retry may succeed.
    const originalFetch = globalThis.fetch
    const networkError = new Error('network failure')
    let attempts = 0
    globalThis.fetch = (() => {
      attempts += 1
      if (attempts === 1) {
        return Promise.reject(networkError)
      }
      return Promise.resolve(new Response(JSON.stringify({ retried: true }), { status: 200 }))
    }) as typeof fetch

    try {
      await expect(apiRequest('/test/transient')).resolves.toEqual({ retried: true })
      expect(attempts).toBe(2)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('throws UnauthorizedError on 401 response', async () => {
    server.use(
      http.get(`${BASE}/test/401`, () =>
        HttpResponse.json(
          {
            type: 'about:blank',
            title: 'Unauthorized',
            status: 401,
            detail: 'Authentication credentials were not provided.',
          },
          { status: 401 },
        ),
      ),
    )

    try {
      await apiRequest('/test/401')
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(UnauthorizedError)
      expect(err).toBeInstanceOf(ApiProblemError)
      const authErr = err as UnauthorizedError
      expect(authErr.problem.status).toBe(401)
      expect(authErr.problem.title).toBe('Unauthorized')
    }
  })

  it('normalizes problem details on 422', async () => {
    server.use(
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
    )

    try {
      await apiRequest('/test/422', { method: 'POST' })
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiProblemError)
      const apiErr = err as ApiProblemError
      expect(apiErr.problem.status).toBe(422)
      expect(apiErr.problem.title).toBe('Validation Error')
      expect(apiErr.problem.code).toBe('validation_error')
      expect(apiErr.problem.errors).toEqual({
        email: ['Enter a valid email address.'],
      })
    }
  })

  it('captures correlationId in problem details from response header', async () => {
    server.use(
      http.get(`${BASE}/test/401`, () =>
        HttpResponse.json(
          {
            type: 'about:blank',
            title: 'Unauthorized',
            status: 401,
            detail: 'Token expired',
          },
          { status: 401, headers: { 'X-Correlation-ID': 'corr-123' } },
        ),
      ),
    )

    try {
      await apiRequest('/test/401')
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(UnauthorizedError)
      expect((err as UnauthorizedError).problem.correlationId).toBe('corr-123')
    }
  })
})
