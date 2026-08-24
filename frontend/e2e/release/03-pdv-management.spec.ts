import { expect } from '@playwright/test'
import { test } from '../fixtures'

test.describe('PDV, Pessoas e Sessões de Caixa', () => {
  test('Lista de vendas carrega', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/app/sales')
    await expect(page.getByTestId('sales-page')).toBeVisible()
    await expect(page.getByTestId('sales-table')).toBeVisible()
  })

  test('Detalhe da venda exibe itens e pagamentos', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/app/sales')
    await expect(page.getByTestId('sales-table')).toBeVisible()

    const firstSaleLink = page.locator('[data-testid="sale-row"]').first().getByRole('link')
    await expect(firstSaleLink).toBeVisible()
    await firstSaleLink.click()
    await expect(page.getByTestId('sale-detail-page')).toBeVisible()
    await expect(page.getByTestId('sale-items-table')).toBeVisible()
    await expect(page.getByTestId('sale-payments-table')).toBeVisible()
  })

  test('Diálogo de estorno (ReturnDialog) não está disponível no detalhe E2E', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/app/sales')
    const firstSaleLink = page.locator('[data-testid="sale-row"]').first().getByRole('link')
    await firstSaleLink.click()
    await expect(page.getByTestId('sale-detail-page')).toBeVisible()
    await expect(page.getByTestId('return-dialog')).toHaveCount(0)
  })

  test('Lista de sessões de caixa carrega', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/app/financial/cash-sessions')
    await expect(page.getByTestId('cash-sessions-page')).toBeVisible()
    await expect(page.getByTestId('cash-sessions-table')).toBeVisible()
  })

  test('Lista de pessoas carrega com busca', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/app/people')
    await expect(page.getByTestId('people-page')).toBeVisible()
    await expect(page.getByTestId('people-table')).toBeVisible()

    const searchInput = page.getByRole('textbox', { name: 'Buscar pessoas' })
    await expect(searchInput).toBeVisible()
    await searchInput.fill('João')
    await page.getByTestId('people-page').getByRole('button', { name: 'Buscar', exact: true }).click()
  })

  test('Detalhe da pessoa exibe seções de informação', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/app/people')
    await expect(page.getByTestId('people-table')).toBeVisible()

    const firstPersonLink = page.locator('[data-testid="person-row"]').first().getByRole('link')
    await expect(firstPersonLink).toBeVisible()
    await firstPersonLink.click()
    await expect(page.getByTestId('person-detail-page')).toBeVisible()
    await expect(page.getByTestId('person-info')).toBeVisible()
  })
})
