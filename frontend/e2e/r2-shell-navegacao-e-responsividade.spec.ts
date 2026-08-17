import { expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { openAuthenticatedShell, test } from './fixtures'

test.describe('R2 - Shell, navegacao e responsividade', () => {
  test('r2 visual and keyboard contract', async ({ page }) => {
    // Given an authenticated desktop user.
    await openAuthenticatedShell(page)

    // Visual regression baseline (desktop)
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

  test('r2 mobile viewport renders drawer', async ({ page }) => {
    // Given an authenticated user at a mobile viewport.
    await page.setViewportSize({ width: 390, height: 844 })
    await openAuthenticatedShell(page)

    // Mobile: the drawer trigger should be visible
    const trigger = page.getByRole('button', { name: /abrir menu/i })
    await expect(trigger).toBeVisible()

    // Click opens the drawer
    await trigger.click()
    const drawer = page.getByTestId('mobile-navigation-drawer')
    await expect(drawer).toBeVisible()
    await expect(drawer.getByRole('button', { name: 'Fechar menu' })).toBeFocused()
    await expect(page.locator('body')).toHaveScreenshot('r2-mobile-drawer.png')

    // Escape closes the drawer
    await page.keyboard.press('Escape')
    await expect(drawer).not.toBeVisible()

  })

  test('r2 flyout opens on click and closes on Escape', async ({ page }) => {
    await openAuthenticatedShell(page)

    // The Vendas rail item has children (flyout)
    const vendasTrigger = page.getByRole('button', { name: 'Vendas' })

    // Click opens the flyout menu
    await vendasTrigger.click()
    const flyout = page.locator('[role="menu"][aria-label="Vendas"]')
    await expect(flyout).toBeVisible()
    await expect(page.locator('body')).toHaveScreenshot('r2-sales-flyout.png')

    // Escape closes the flyout
    await page.keyboard.press('Escape')
    await expect(flyout).not.toBeVisible()

    // Focus returns to the trigger after close
    await expect(vendasTrigger).toBeFocused()
  })
})
