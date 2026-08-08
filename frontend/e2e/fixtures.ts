import path from 'node:path'

import {
  expect,
  test as base,
  type Page,
} from '@playwright/test'

const authStatePath = path.resolve('test-results/.auth/e2e-user.json')

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
  if (recoveryCode.length >= 8) {
    await page.locator('button[type="button"]').last().click()
  }
  await page.fill('#mfa-code', recoveryCode)
  await page.getByRole('button', { name: /Entrar|Verificar/ }).click()
  await page.waitForURL((url) => !['/login', '/mfa'].includes(url.pathname))

  const tenantSelector = page.getByTestId('tenant-selector')
  if (await tenantSelector.isVisible()) {
    const primaryTenant = tenantSelector.getByRole('button', { name: 'E2E Test', exact: true })
    await primaryTenant.click()
    await expect(primaryTenant).toHaveAttribute('aria-current', 'true')
  }
}

export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ browser, baseURL }, use) => {
    const context = await browser.newContext({ baseURL, storageState: authStatePath })
    const page = await context.newPage()
    await use(page)
    await context.close()
  },
})
