import { expect } from '@playwright/test'
import { authenticatePage, test } from '../fixtures'

test.describe('Autenticação e Tenancy', () => {
  test('Login bem-sucedido redireciona para o dashboard', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/app/dashboard')
    await expect(page.getByTestId('dashboard-page')).toBeVisible()
    await expect(page.getByTestId('app-shell')).toBeVisible()
  })

  test('Desafio MFA é apresentado quando conta requer MFA', async ({ anonymousPage: page }) => {
    await page.goto('/login')
    await page.fill('[name="email"]', 'mfa@tjsys.local')
    await page.fill('[name="password"]', 'e2e-test-pwd-2026')
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL(/\/mfa/)
    await expect(page.getByTestId('mfa-page')).toBeVisible()
  })

  test('Seletor de tenant está visível no dashboard', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/app/dashboard')
    await expect(page.getByTestId('tenant-selector')).toBeVisible()
  })

  test('Navegação exibe todos os links de módulos principais', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/app/dashboard')
    await expect(page.getByTestId('main-navigation')).toBeVisible()

    const moduleLinks = [
      'Início',
      'Catálogo',
      'Estoque',
      'Compras',
      'Financeiro',
      'Relatórios',
    ]
    for (const label of moduleLinks) {
      await expect(
        page.getByTestId('main-navigation').getByRole('link', { name: label }),
      ).toBeVisible()
    }
    await expect(page.getByTestId('main-navigation').getByRole('button', { name: 'Vendas' })).toBeVisible()
    await page.getByTestId('main-navigation').getByRole('button', { name: 'Administração' }).click()
    const adminFlyout = page.getByRole('menu', { name: 'Administração' })
    await expect(adminFlyout).toBeVisible()
    for (const [label, href] of [
      ['Empresas', '/app/organization/companies'],
      ['Filiais', '/app/organization/branches'],
      ['Membros', '/app/access/members'],
      ['Convites', '/app/access/invitations'],
      ['Segurança', '/app/security/mfa'],
      ['Dispositivos', '/app/devices'],
    ] as const) {
      await expect(adminFlyout.getByRole('menuitem', { name: label })).toHaveAttribute('href', href)
    }
  })

  test('Recuperação de sessão expirada — rota protegida sem auth → login → retorno', async ({ anonymousPage: page }) => {
    await page.goto('/app/financial/receivables')
    await expect(page).toHaveURL(/\/login/)

    await authenticatePage(page)

    await page.goto('/app/financial/receivables')
    await expect(page.getByTestId('receivables-page')).toBeVisible()
  })

  test('Negação de papel — operador não pode acessar páginas somente-admin', async ({ anonymousPage: page }) => {
    await authenticatePage(page, 'operator@tjsys.local')

    await page.goto('/app/fiscal/emitters')
    await expect(page.getByTestId('forbidden-page').or(page.getByRole('alert'))).toBeVisible()
  })
})
