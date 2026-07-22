import AxeBuilder from '@axe-core/playwright'
import { expect } from '@playwright/test'
import { test } from './fixtures'

test.describe('Acessibilidade (axe-core)', () => {
  test('Página de login não possui violações críticas ou sérias', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    const seriousOrCritical = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    )
    expect(seriousOrCritical).toEqual([])
  })

  test('Shell autenticado não possui violações críticas ou sérias', async ({ page }) => {
    await page.goto('/login')
    await page.fill('[name="email"]', 'web-admin@zyrp.local')
    await page.fill('[name="password"]', 'e2e-test-pwd-2026')
    await page.click('button[type="submit"]')
    await page.waitForURL(/^\/(?!login)/)
    await page.waitForLoadState('networkidle')

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    const seriousOrCritical = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    )
    expect(seriousOrCritical).toEqual([])
  })
})
