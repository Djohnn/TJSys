import { expect } from '@playwright/test'
import { test } from './fixtures'

test.describe('Catálogo, Estoque e Compras', () => {
  test('Catálogo — lista de produtos carrega', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/catalog/products')
    await expect(page.getByTestId('products-page')).toBeVisible()
    await expect(page.getByTestId('products-table')).toBeVisible()
  })

  test('Catálogo — busca por nome filtra produtos', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/catalog/products')
    await expect(page.getByTestId('products-page')).toBeVisible()

    const searchInput = page.getByRole('textbox', { name: 'Buscar produtos' })
    await searchInput.fill('Produto E2E')
    await page.getByTestId('products-page').getByRole('button', { name: 'Buscar', exact: true }).click()
    await expect(page.getByTestId('products-table')).toBeVisible()
  })

  test('Catálogo — categorias podem ser criadas', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/catalog/categories')
    await expect(page.getByTestId('categories-page')).toBeVisible()

    await page.getByRole('button', { name: 'Nova Categoria' }).click()
    await expect(page.getByTestId('category-form')).toBeVisible()
  })

  test('Estoque — saldos carregam com filtros', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/inventory/balances')
    await expect(page.getByTestId('balances-page')).toBeVisible()
    await expect(page.getByTestId('balances-filters')).toBeVisible()
  })

  test('Estoque — movimentações têm filtro de data', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/inventory/movements')
    await expect(page.getByTestId('movements-page')).toBeVisible()
    await expect(page.getByTestId('movements-filters')).toBeVisible()
  })

  test('Compras — fornecedores podem ser criados', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/purchasing/suppliers')
    await expect(page.getByTestId('suppliers-page')).toBeVisible()
    await page.getByRole('button', { name: /fornecedor/i }).click()
    await expect(page.getByTestId('supplier-form')).toBeVisible()
  })

  test('Compras — ordens de compra listam', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/purchasing/orders')
    await expect(page.getByTestId('purchase-orders-page')).toBeVisible()
  })

  test('Navegação contém links do módulo', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/dashboard')
    await expect(page.getByTestId('main-navigation')).toBeVisible()

    for (const label of ['Catálogo', 'Estoque', 'Compras']) {
      await expect(
        page.getByTestId('main-navigation').getByRole('link', { name: label }),
      ).toBeVisible()
    }
  })
})
