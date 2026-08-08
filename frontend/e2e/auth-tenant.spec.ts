import { expect } from '@playwright/test'
import { authenticatePage, test } from './fixtures'

test.describe('Autenticação e troca de tenant', () => {
  test('Login com credenciais válidas redireciona para o dashboard', async ({ page }) => {
    await authenticatePage(page)
    await expect(page.getByTestId('app-shell')).toBeVisible()
  })

  test('Login com credenciais inválidas mostra erro', async ({ page }) => {
    await page.goto('/login')
    await page.fill('[name="email"]', 'wrong@tjsys.local')
    await page.fill('[name="password"]', 'wrong-password')
    await page.click('button[type="submit"]')
    await expect(page.getByRole('alert')).toBeVisible()
  })

  test('Seletor de tenant aparece quando há múltiplos tenants', async ({ page }) => {
    await authenticatePage(page)
    await expect(page.getByTestId('tenant-selector')).toBeVisible()
  })

  test('Troca de tenant exibe novo tenant no seletor', async ({ page }) => {
    await authenticatePage(page)

    await expect(page.getByTestId('tenant-selector')).toBeVisible()
    const tenantButtons = page.getByTestId('tenant-selector').getByRole('button')
    const count = await tenantButtons.count()
    expect(count).toBeGreaterThanOrEqual(2)

    const firstTenant = await tenantButtons.nth(0).textContent()
    await tenantButtons.nth(1).click()
    await expect(tenantButtons.nth(1)).toHaveAttribute('aria-current', 'true')
  })

  test('Logout redireciona para página de login', async ({ page }) => {
    await authenticatePage(page)

    await page.getByRole('button', { name: 'Sair' }).click()
    await expect(page).toHaveURL(/\/login/)
  })

  test('Após logout, navegação ao dashboard retorna ao login', async ({ page }) => {
    await authenticatePage(page)

    await page.getByRole('button', { name: 'Sair' }).click()
    await page.waitForURL(/\/login/)

    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
  })

  test('Usuário não autenticado é redirecionado ao login', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
  })

  test('Página MFA sem pré-sessão retorna ao login', async ({ page }) => {
    await page.goto('/mfa')
    await expect(page).toHaveURL(/\/login/)
  })
})
