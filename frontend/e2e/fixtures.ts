import { expect, test as base, type BrowserContext, type Page } from '@playwright/test'

export { expect }

export async function authenticatePage(
  page: Page,
  email = process.env.E2E_USER_EMAIL,
): Promise<void> {
  const password = process.env.E2E_USER_PASSWORD
  const recoveryCode = process.env.E2E_RECOVERY_CODE
  if (!email || !password || !recoveryCode) {
    throw new Error('Defina E2E_USER_EMAIL, E2E_USER_PASSWORD e E2E_RECOVERY_CODE.')
  }
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.fill('[name="email"]', email)
  await page.fill('[name="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/mfa/)
  await page.fill('#mfa-code', recoveryCode)
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
  authenticatedPage: Page
  anonymousPage: Page
}>({
  authenticatedPage: async ({ page }, use) => {
    await page.goto('/dashboard')
    await use(page)
  },
  anonymousPage: async ({ browser, baseURL }, use) => {
    const context: BrowserContext = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    })
    const page = await context.newPage()
    try {
      await use(page)
    } finally {
      await context.close()
    }
  },
})
