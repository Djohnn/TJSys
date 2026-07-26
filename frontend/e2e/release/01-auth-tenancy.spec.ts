import { expect } from '@playwright/test'
import { authenticatePage, test } from '../fixtures'

test.describe('Autenticação e Tenancy', () => {
  test('Login bem-sucedido redireciona para o dashboard', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/dashboard')
    await expect(page.getByTestId('dashboard-page')).toBeVisible()
    await expect(page.getByTestId('app-shell')).toBeVisible()
  })

  test('Desafio MFA é apresentado quando conta requer MFA', async ({ page }) => {
    await page.goto('/login')
    await page.fill('[name="email"]', 'mfa@zyrp.local')
    await page.fill('[name="password"]', 'e2e-test-pwd-2026')
    await page.click('button[type="submit"]')
    await expect(page.getByTestId('mfa-page')).toBeVisible()
  })

  test('Seletor de tenant está visível no dashboard', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/dashboard')
    await expect(page.getByTestId('tenant-selector')).toBeVisible()
  })

  test('Navegação exibe todos os links de módulos principais', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/dashboard')
    await expect(page.getByTestId('main-navigation')).toBeVisible()

    const moduleLinks = [
      'Dashboard',
      'Catálogo',
      'Estoque',
      'Vendas',
      'Financeiro',
      'Fiscal',
      'Pagamentos',
      'Monitoramento',
    ]
    for (const label of moduleLinks) {
      await expect(
        page.getByTestId('main-navigation').getByRole('link', { name: label }),
      ).toBeVisible()
    }
  })

  test('Recuperação de sessão expirada — rota protegida sem auth → login → retorno', async ({ page }) => {
    await page.goto('/financial/receivables')
    await expect(page).toHaveURL(/\/login/)

    await authenticatePage(page)

    await page.goto('/financial/receivables')
    await expect(page.getByTestId('receivables-page')).toBeVisible()
  })

  test('Negação de papel — operador não pode acessar páginas somente-admin', async ({ page }) => {
    await authenticatePage(page, 'operator@zyrp.local')

    await page.goto('/fiscal/emitters')
    await expect(page.getByTestId('forbidden-page').or(page.getByRole('alert'))).toBeVisible()
  })
})
