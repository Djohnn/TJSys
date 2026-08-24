import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './fixtures'

test.describe('Acessibilidade (axe-core)', () => {
  test('Página de login não possui violações críticas ou sérias', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('[name="email"]')).toBeVisible()

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    const seriousOrCritical = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    )
    expect(seriousOrCritical).toEqual([])
  })

  for (const [path, marker] of [
    ['/app/catalog', 'catalog-home-page'],
    ['/app/catalog/products', 'products-page'],
    ['/app/catalog/products/new', 'product-editor-page'],
    ['/app/catalog/services', 'services-page'],
    ['/app/catalog/combos', 'combos-page'],
    ['/app/catalog/categories', 'categories-page'],
    ['/app/catalog/brands', 'brands-page'],
    ['/app/catalog/units', 'units-page'],
    ['/app/catalog/labels', 'labels-page'],
  ]) {
    test(`Catálogo ${path} não possui violações críticas ou sérias`, async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(path)
      await expect(authenticatedPage.getByTestId(marker)).toBeVisible()
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
    await authenticatedPage.goto('/app')
    await expect(authenticatedPage.getByTestId('dashboard-page')).toBeVisible()

    const results = await new AxeBuilder({ page: authenticatedPage })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    const seriousOrCritical = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    )
    expect(seriousOrCritical).toEqual([])
  })
})
