import { expect } from '@playwright/test'
import { test } from '../fixtures'

test.describe('Catálogo, Estoque e Compras', () => {
  test('Lista de produtos exibe tabela com data-testid', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/app/catalog/products')
    await expect(page.getByTestId('products-page')).toBeVisible()
    await expect(page.getByTestId('products-table')).toBeVisible()
  })

  test('Busca de produtos funciona', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/app/catalog/products')
    await expect(page.getByTestId('products-page')).toBeVisible()

    const searchInput = page.getByRole('textbox', { name: 'Buscar produtos' })
    await searchInput.fill('Produto E2E')
    await page.getByTestId('products-page').getByRole('button', { name: 'Buscar', exact: true }).click()
    await expect(page.getByTestId('products-table')).toBeVisible()
  })

  test('Lista de categorias carrega e exibe tabela', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/app/catalog/categories')
    await expect(page.getByTestId('categories-page')).toBeVisible()
    await expect(page.getByTestId('categories-table')).toBeVisible()
  })

  test('Saldos de inventário exibem dados', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/app/inventory/balances')
    await expect(page.getByTestId('balances-page')).toBeVisible()
    await expect(page.getByTestId('balances-table')).toBeVisible()
  })

  test('Movimentações de inventário filtram por data', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/app/inventory/movements')
    await expect(page.getByTestId('movements-page')).toBeVisible()
    await expect(page.getByTestId('movements-filters')).toBeVisible()
  })

  test('Lista de fornecedores carrega', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/app/purchasing/suppliers')
    await expect(page.getByTestId('suppliers-page')).toBeVisible()
    await expect(page.getByTestId('search-input')).toBeVisible()
  })

  test('Lista de ordens de compra exibe dados', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/app/purchasing/orders')
    await expect(page.getByTestId('purchase-orders-page')).toBeVisible()
    await expect(page.getByTestId('orders-table')).toBeVisible()
  })

  test('Navegação catálogo → compras — vai de produtos para ordens', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/app/catalog/products')
    await expect(page.getByTestId('products-table')).toBeVisible()

    await page.goto('/app/purchasing/orders')
    await expect(page.getByTestId('purchase-orders-page')).toBeVisible()
    await expect(page.getByTestId('orders-table')).toBeVisible()
  })
  test('URL administrativa antiga exibe página 404 em vez de tela branca', async ({ anonymousPage }) => {
    // Given: a pessoa acessa diretamente uma URL administrativa legada sem o namespace
    await anonymousPage.goto('/catalog/products', { waitUntil: 'domcontentloaded' })

    // Then: a aplicação exibe seu erro 404 sem renderização vazia
    await expect(anonymousPage.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible()
    await expect(anonymousPage.getByTestId('error-state')).toBeVisible()
  })
})
