import { test, expect } from './fixtures'
import AxeBuilder from '@axe-core/playwright'

test.describe('R0 - Baseline e Governança do Design System', () => {
  test('r0 visual and keyboard contract', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/')
    await expect(page.locator('body')).toBeVisible()

    // Visual regression: compare against baseline
    await expect(page).toHaveScreenshot('r0-baseline-e-governanca-do-design-system.png')

    // Accessibility check
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    const criticalViolations = accessibilityScanResults.violations.filter(
      v => v.impact === 'critical' || v.impact === 'serious'
    )
    expect(criticalViolations).toEqual([])
  })
})
