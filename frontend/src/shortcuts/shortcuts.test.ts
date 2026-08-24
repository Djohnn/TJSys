import { describe, expect, it } from 'vitest'

import { SHORTCUT_ROUTES } from './shortcuts'
import { normalizeAdminRoute } from '@/app/adminRoutes'

describe('rotas dos atalhos administrativos', () => {
  it('mantém todas as navegações administrativas sob /app', () => {
    for (const [action, route] of Object.entries(SHORTCUT_ROUTES)) {
      expect(route, action).toMatch(/^\/app(?:\/|$)/)
    }
  })
})


describe('rotas legadas persistidas', () => {
  it('normaliza favoritos e resultados de busca para /app', () => {
    expect(normalizeAdminRoute('/catalog/products/p1/edit')).toBe('/app/catalog/products/p1/edit')
    expect(normalizeAdminRoute('/app/catalog/products/p1/edit')).toBe('/app/catalog/products/p1/edit')
  })
})
