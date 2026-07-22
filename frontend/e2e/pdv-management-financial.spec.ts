import { expect } from '@playwright/test'
import { test } from './fixtures'

test.describe('Gestão de PDV, Pessoas e Financeiro', () => {
  test('Vendas — lista de vendas carrega', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/sales')
    await expect(page.getByTestId('sales-page')).toBeVisible()
  })

  test('Vendas — detalhe de venda mostra itens', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/sales')
    await expect(page.getByTestId('sales-table')).toBeVisible()
    await page.locator('[data-testid="sales-table"] a').first().click()
    await expect(page.getByTestId('sale-detail-page')).toBeVisible()
    await expect(page.getByTestId('sale-items-table')).toBeVisible()
  })

  test('Vendas — nenhuma ação de nova venda', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/sales')
    await expect(page.getByRole('button', { name: /nova venda/i })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /nova venda/i })).toHaveCount(0)
  })

  test('Sessões de caixa — lista carrega', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/financial/cash-sessions')
    await expect(page.getByTestId('cash-sessions-page')).toBeVisible()
  })

  test('Pessoas — lista com busca', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/people')
    await expect(page.getByTestId('people-page')).toBeVisible()
    await expect(page.getByTestId('people-table')).toBeVisible()

    const searchInput = page.getByRole('textbox', { name: 'Buscar pessoas' })
    await searchInput.fill('João')
    await page.getByRole('button', { name: 'Buscar' }).click()
    await expect(page.getByTestId('people-table')).toBeVisible()
  })

  test('Pessoas — detalhe mostra seções', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/people')
    await expect(page.getByTestId('people-table')).toBeVisible()
    await page.locator('[data-testid="people-table"] a').first().click()
    await expect(page.getByTestId('person-detail-page')).toBeVisible()
    await expect(page.getByTestId('person-info')).toBeVisible()
  })

  test('Financeiro — contas a receber', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/financial/receivables')
    await expect(page.getByTestId('receivables-page')).toBeVisible()
  })

  test('Financeiro — fluxo de caixa', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/financial/cashflow')
    await expect(page.getByTestId('cashflow-page')).toBeVisible()
  })
})
