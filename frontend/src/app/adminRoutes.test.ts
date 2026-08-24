import { describe, expect, it } from 'vitest'

import { normalizeAdminRoute } from './adminRoutes'

describe('normalizeAdminRoute', () => {
  it.each([
    ['/', '/'],
    ['/login', '/login'],
    ['/mfa', '/mfa'],
    ['/app', '/app'],
    ['/app/catalog/products', '/app/catalog/products'],
    ['/catalog/products', '/app/catalog/products'],
  ])('maps %s to %s', (route, expected) => {
    expect(normalizeAdminRoute(route)).toBe(expected)
  })

  it('preserves query strings and hashes while namespacing an admin route', () => {
    expect(normalizeAdminRoute('/catalog/products?tab=active#top')).toBe(
      '/app/catalog/products?tab=active#top',
    )
  })

  it('does not duplicate the namespace when /app has query or hash state', () => {
    expect(normalizeAdminRoute('/app?tenant=main#overview')).toBe(
      '/app?tenant=main#overview',
    )
  })

  it('leaves external URLs unchanged', () => {
    expect(normalizeAdminRoute('https://example.com/catalog/products')).toBe(
      'https://example.com/catalog/products',
    )
  })
})
