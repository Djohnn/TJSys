import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.describe('R1 - Tokens e componentes fundamentais', () => {
  test('r1 visual and keyboard contract', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('body')).toBeVisible()
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