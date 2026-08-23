import AxeBuilder from '@axe-core/playwright'
import { expect } from '@playwright/test'
import { authenticatePage, test } from '../fixtures'

test.describe('Segurança e Resiliência', () => {
  test('Isolamento cross-tenant — admin em um tenant não vê dados de outro tenant', async ({ anonymousPage: page }) => {
    // Given an anonymous browser context, the explicit login owns this test's auth state.
    await authenticatePage(page)

    await page.goto('/financial/receivables')
    await expect(page.getByTestId('receivables-table')).toBeVisible()

    const firstRowBefore = await page
      .locator('[data-testid="receivable-row"]')
      .first()
      .textContent()

    const tenantButtons = page.getByTestId('tenant-selector').getByRole('button')
    const count = await tenantButtons.count()
    if (count >= 2) {
      await tenantButtons.nth(1).click()
      await expect(tenantButtons.nth(1)).toHaveAttribute('aria-current', 'true')

      await page.goto('/financial/receivables')
      await expect(page.getByTestId('receivables-page')).toBeVisible()
      if (firstRowBefore) {
        await expect(page.locator('main')).not.toContainText(firstRowBefore.trim())
      }
    }
  })

  test('Expiração de sessão — cookies limpos → redireciona ao login', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/dashboard')
    await expect(page.getByTestId('dashboard-page')).toBeVisible()

    await page.context().clearCookies()

    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })

  test('Recuperação de erro de rede — intercept falha e depois sucesso', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    let failCount = 0

    await page.route('**/api/v1/receivables?*', (route) => {
      if (failCount < 1) {
        failCount++
        route.fulfill({ status: 500, body: '{}' })
      } else {
        route.continue()
      }
    })

    await page.goto('/financial/receivables')
    await expect(page.getByTestId('error-recovery-message').or(page.getByTestId('receivables-table'))).toBeVisible()
  })

  test('Navegação browser voltar/avançar preserva estado', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/dashboard')
    await expect(page.getByTestId('dashboard-page')).toBeVisible()

    await page.goto('/sales')
    await expect(page.getByTestId('sales-page')).toBeVisible()

    await page.goBack()
    await expect(page.getByTestId('dashboard-page')).toBeVisible()

    await page.goForward()
    await expect(page.getByTestId('sales-page')).toBeVisible()
  })

  test('Auditoria de acessibilidade no dashboard sem violações críticas ou sérias', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/dashboard')

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    const seriousOrCritical = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    )
    expect(seriousOrCritical).toEqual([])
  })
})
