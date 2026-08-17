import { expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { openAuthenticatedShell, test } from './fixtures'

test.describe('R0 - Baseline e Governança do Design System', () => {
  test('r0 visual and accessibility contract', async ({ page }) => {
    // Given an authenticated user on the approved R0-R2 shell.
    await openAuthenticatedShell(page)

    // Then the canonical visual baseline and WCAG gate remain stable.
    await expect(page.locator('body')).toHaveScreenshot('r0-baseline-e-governanca-do-design-system.png')

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
