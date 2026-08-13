import { expect, test } from './fixtures'
import type { Page } from '@playwright/test'

async function mockLogout(page: Page): Promise<void> {
  await page.route('**/api/v1/auth/logout/', (route) =>
    route.fulfill({ status: 204 }),
  )
}

async function mockUnauthenticatedSession(page: Page): Promise<void> {
  await page.route('**/api/v1/auth/me/', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Authentication credentials were not provided.' }),
    }),
  )
}

test.describe('Autenticação e troca de tenant', () => {
  test('Login MFA do global setup persiste a sessão no dashboard', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard')
    await expect(page.getByTestId('app-shell')).toBeVisible()
  })

  test('Login com credenciais inválidas mostra erro', async ({ anonymousPage: page }) => {
    await page.goto('/login')
    await page.fill('[name="email"]', 'wrong@zyrp.local')
    await page.fill('[name="password"]', 'wrong-password')
    await page.click('button[type="submit"]')
    await expect(page.getByRole('alert')).toBeVisible()
  })

  test('Seletor de tenant aparece quando há múltiplos tenants', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard')
    await expect(page.getByTestId('tenant-selector')).toBeVisible()
  })

  test('Troca de tenant exibe novo tenant no seletor', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard')

    await expect(page.getByTestId('tenant-selector')).toBeVisible()
    const tenantButtons = page.getByTestId('tenant-selector').getByRole('button')
    const count = await tenantButtons.count()
    expect(count).toBeGreaterThanOrEqual(2)

    const firstTenant = await tenantButtons.nth(0).textContent()
    await tenantButtons.nth(1).click()
    await expect(tenantButtons.nth(1)).toHaveAttribute('aria-current', 'true')
  })

  test('Logout redireciona para página de login', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard')
    await mockLogout(page)

    await page.getByRole('button', { name: 'Sair' }).click()
    await expect(page).toHaveURL(/\/login/)
  })

  test('Após logout, navegação ao dashboard retorna ao login', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard')
    await mockLogout(page)

    await page.getByRole('button', { name: 'Sair' }).click()
    await page.waitForURL(/\/login/)
    await mockUnauthenticatedSession(page)

    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
  })

  test('Usuário não autenticado é redirecionado ao login', async ({ anonymousPage: page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
  })

  test('Página MFA sem pré-sessão retorna ao login', async ({ anonymousPage: page }) => {
    await page.goto('/mfa')
    await expect(page).toHaveURL(/\/login/)
  })
})
