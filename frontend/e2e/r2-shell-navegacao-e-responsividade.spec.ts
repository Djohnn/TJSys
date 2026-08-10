import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.describe('R2 - Shell, navegacao e responsividade', () => {
  test('r2 visual and keyboard contract', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('body')).toBeVisible()

    // Visual regression baseline
    await expect(page.locator('body')).toHaveScreenshot('r2-shell-navegacao-e-responsividade.png')

    // No element should have visible focus ring on initial load
    await expect(page.locator(':focus-visible')).toHaveCount(0)

    // Accessibility scan: zero critical or serious violations
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    const criticalViolations = accessibilityScanResults.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    )
    expect(criticalViolations).toEqual([])
  })

  test('r2 flyout opens on click and closes on Escape', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('body')).toBeVisible()

    // The Vendas rail item has children (flyout)
    const vendasTrigger = page.getByRole('button', { name: 'Vendas' })

    // Click opens the flyout menu
    await vendasTrigger.click()
    const flyout = page.locator('[role="menu"][aria-label="Vendas"]')
    await expect(flyout).toBeVisible()

    // Escape closes the flyout
    await page.keyboard.press('Escape')
    await expect(flyout).not.toBeVisible()

    // Focus returns to the trigger after close
    await expect(vendasTrigger).toBeFocused()
  })
})
