import { expect, test as base, type Page } from '@playwright/test'

export { expect }

const SHELL_ME_RESPONSE = {
  user: {
    id: 1,
    email: 'shell-test@example.invalid',
    name: 'Usuário de Teste',
    is_active: true,
    is_mfa_enabled: true,
  },
  memberships: [
    {
      id: 1,
      tenant_id: 'tenant-shell-test',
      tenant_name: 'Empresa de Teste',
      role: 'admin',
    },
  ],
}

const EMPTY_PAGE = {
  count: 0,
  next: null,
  previous: null,
  results: [],
}

export async function openAuthenticatedShell(page: Page): Promise<void> {
  await page.route('**/api/v1/auth/csrf/', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', json: {} }),
  )
  await page.route('**/api/v1/auth/me/', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', json: SHELL_ME_RESPONSE }),
  )
  await page.route('**/api/v1/companies/', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', json: EMPTY_PAGE }),
  )
  await page.route('**/api/v1/branches/', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', json: EMPTY_PAGE }),
  )

  await page.goto('/settings', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('app-shell')).toBeVisible()
}

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
}>({
  authenticatedPage: async ({ page }, use) => {
    await authenticatePage(page)
    await use(page)
  },
})
