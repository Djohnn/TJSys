import { expect } from '@playwright/test'
import { test } from './fixtures'

test.describe('Gestão de PDV, Pessoas e Financeiro', () => {
  test('Vendas — lista de vendas carrega', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/sales')
    await expect(page.getByTestId('sales-page')).toBeVisible()
    await expect(page.getByTestId('sales-table')).toBeVisible()
  })

  test('Vendas — detalhe de venda mostra itens', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/sales')
    await expect(page.getByTestId('sales-table')).toBeVisible()
    // Click on the first sale row link (assuming there's a link in the row)
    const firstSaleLink = page.locator('[data-testid="sale-row"]').first().getByRole('link')
    await expect(firstSaleLink).toBeVisible()
    await firstSaleLink.click()
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
    await expect(page.getByTestId('cash-sessions-table')).toBeVisible()
  })

  test('Pessoas — lista com busca', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/people')
    await expect(page.getByTestId('people-page')).toBeVisible()
    await expect(page.getByTestId('people-table')).toBeVisible()
    
    const searchInput = page.getByRole('textbox', { name: 'Buscar pessoas' })
    await expect(searchInput).toBeVisible()
    await searchInput.fill('João')
    await page.getByRole('button', { name: 'Buscar' }).click()
  })

  test('Pessoas — detalhe mostra seções', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/people')
    await expect(page.getByTestId('people-table')).toBeVisible()
    // Click on the first person row link
    const firstPersonLink = page.locator('[data-testid="person-row"]').first().getByRole('link')
    await expect(firstPersonLink).toBeVisible()
    await firstPersonLink.click()
    await expect(page.getByTestId('person-detail-page')).toBeVisible()
    await expect(page.getByTestId('person-info')).toBeVisible()
  })

  test('Financeiro — contas a receber', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/financial/receivables')
    await expect(page.getByTestId('receivables-page')).toBeVisible()
    await expect(page.getByTestId('receivables-table')).toBeVisible()
  })

  test('Financeiro — fluxo de caixa', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/financial/cashflow')
    await expect(page.getByTestId('cashflow-page')).toBeVisible()
    await expect(page.getByTestId('cashflow-table')).toBeVisible()
  })
})