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

  for (const path of [
    '/catalog',
    '/catalog/products',
    '/catalog/products/new',
    '/catalog/services',
    '/catalog/combos',
    '/catalog/categories',
    '/catalog/brands',
    '/catalog/units',
    '/catalog/labels',
  ]) {
    test(`Catálogo ${path} não possui violações críticas ou sérias`, async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(path)
      await authenticatedPage.waitForLoadState('networkidle')
      const results = await new AxeBuilder({ page: authenticatedPage })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      expect(
        results.violations.filter(
          (violation) => violation.impact === 'critical' || violation.impact === 'serious',
        ),
      ).toEqual([])
    })
  }

  test('Shell autenticado não possui violações críticas ou sérias', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/')
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
