import { expect, test as base, type Page } from '@playwright/test'

export async function authenticatePage(
  page: Page,
  email = 'web-admin@zyrp.local',
): Promise<void> {
  await page.goto('/login')
  await page.fill('[name="email"]', email)
  await page.fill('[name="password"]', 'e2e-test-pwd-2026')
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/mfa/)
  await page.fill('#mfa-code', 'e2e0000001')
  await page.getByRole('button', { name: 'Verificar' }).click()
  await page.waitForURL((url) => !['/login', '/mfa'].includes(url.pathname))

  const tenantSelector = page.getByTestId('tenant-selector')
  if (await tenantSelector.isVisible()) {
    const primaryTenant = tenantSelector.getByRole('button', { name: 'E2E Test', exact: true })
    await primaryTenant.click()
    await expect(primaryTenant).toHaveAttribute('aria-current', 'true')
  }
}

export const test = base.extend<{
  authenticatedPage: any
}>({
  authenticatedPage: async ({ page }, use) => {
    await authenticatePage(page)
    await use(page)
  },
})
