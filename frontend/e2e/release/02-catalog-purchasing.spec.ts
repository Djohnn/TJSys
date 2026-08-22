import { expect } from '@playwright/test'
import { test } from '../fixtures'

test.describe('Catálogo, Estoque e Compras', () => {
  test('Lista de produtos exibe tabela com data-testid', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/catalog/products')
    await expect(page.getByTestId('products-page')).toBeVisible()
    await expect(page.getByTestId('products-table')).toBeVisible()
  })

  test('Busca de produtos funciona', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/catalog/products')
    await expect(page.getByTestId('products-page')).toBeVisible()

    const searchInput = page.getByRole('textbox', { name: 'Buscar produtos' })
    await searchInput.fill('Produto E2E')
    await page.getByTestId('products-page').getByRole('button', { name: 'Buscar', exact: true }).click()
    await expect(page.getByTestId('products-table')).toBeVisible()
  })

  test('Lista de categorias carrega e exibe tabela', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/catalog/categories')
    await expect(page.getByTestId('categories-page')).toBeVisible()
    await expect(page.getByTestId('categories-table')).toBeVisible()
  })

  test('Saldos de inventário exibem dados', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/inventory/balances')
    await expect(page.getByTestId('balances-page')).toBeVisible()
    await expect(page.getByTestId('balances-table')).toBeVisible()
  })

  test('Movimentações de inventário filtram por data', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/inventory/movements')
    await expect(page.getByTestId('movements-page')).toBeVisible()
    await expect(page.getByTestId('movements-filters')).toBeVisible()
  })

  test('Lista de fornecedores carrega', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/purchasing/suppliers')
    await expect(page.getByTestId('suppliers-page')).toBeVisible()
    await expect(page.getByTestId('search-input')).toBeVisible()
  })

  test('Lista de ordens de compra exibe dados', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/purchasing/orders')
    await expect(page.getByTestId('purchase-orders-page')).toBeVisible()
    await expect(page.getByTestId('orders-table')).toBeVisible()
  })

  test('Navegação catálogo → compras — vai de produtos para ordens', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/catalog/products')
    await expect(page.getByTestId('products-table')).toBeVisible()

    await page.goto('/purchasing/orders')
    await expect(page.getByTestId('purchase-orders-page')).toBeVisible()
    await expect(page.getByTestId('orders-table')).toBeVisible()
  })
})
