import { expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { openAuthenticatedShell, test } from './fixtures'

test.describe('R1 - Tokens e componentes fundamentais', () => {
  test('r1 visual and keyboard contract', async ({ page }) => {
    // Given an authenticated user, when the R1 tokenized shell renders.
    await openAuthenticatedShell(page)
    await expect(page.locator('body')).toHaveScreenshot('r1-tokens-e-componentes-fundamentais.png')
    await expect(page.locator(':focus-visible')).toHaveCount(0)

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    const criticalViolations = accessibilityScanResults.violations.filter(
      v => v.impact === 'critical' || v.impact === 'serious'
    )
    expect(criticalViolations).toEqual([])
  })
})
