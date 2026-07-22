import { ApiProblemError, UnauthorizedError } from './problem'
import type { ApiProblem } from './problem'

export interface RequestOptions {
  method?: string
  body?: unknown
  tenantId?: string
  headers?: Record<string, string>
  signal?: AbortSignal
}

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function getBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL ?? '/api/v1'
}

export function getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]*)/)
  return match ? match[1] : null
}

function normalizeProblem(
  status: number,
  statusText: string,
  body: unknown,
  correlationId?: string,
): ApiProblem {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const obj = body as Record<string, unknown>
    if (
      typeof obj.type === 'string' &&
      typeof obj.title === 'string' &&
      typeof obj.status === 'number'
    ) {
      return {
        type: obj.type as string,
        title: obj.title as string,
        status: obj.status as number,
        detail: (obj.detail as string) ?? statusText,
        code: obj.code as string | undefined,
        errors: obj.errors as Record<string, string[]> | undefined,
        correlationId,
      }
    }
  }

  return {
    type: 'about:blank',
    title: statusText,
    status,
    detail: typeof body === 'string' ? body : statusText,
    correlationId,
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const baseUrl = getBaseUrl()
  const method = (options.method ?? 'GET').toUpperCase()
  const url = `${baseUrl}${path}`

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...options.headers,
  }

  if (options.body !== undefined && method !== 'GET') {
    headers['Content-Type'] = 'application/json'
  }

  if (UNSAFE_METHODS.has(method)) {
    const csrfToken = getCsrfToken()
    if (csrfToken) {
      headers['X-CSRFToken'] = csrfToken
    }
  }

  if (options.tenantId) {
    headers['X-Tenant-ID'] = options.tenantId
  }

  const doFetch = (): Promise<Response> =>
    fetch(url, {
      method,
      headers,
      credentials: 'include',
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    })

  let response: Response

  try {
    response = await doFetch()
  } catch (err) {
    if (method === 'GET') {
      try {
        response = await doFetch()
      } catch {
        throw err
      }
    } else {
      throw err
    }
  }

  const correlationId = response.headers.get('X-Correlation-ID') ?? undefined

  if (!response.ok) {
    let body: unknown
    try {
      body = await response.json()
    } catch {
      body = response.statusText
    }

    const problem = normalizeProblem(
      response.status,
      response.statusText,
      body,
      correlationId,
    )

    if (response.status === 401) {
      throw new UnauthorizedError(problem)
    }

    throw new ApiProblemError(problem)
  }

  if (response.status === 204) {
    return undefined as T
  }

  const json: unknown = await response.json()
  return json as T
}
