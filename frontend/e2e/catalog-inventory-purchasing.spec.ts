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
    await searchInput.fill('Ração')
    await page.getByRole('button', { name: 'Buscar' }).click()
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
    await page.getByRole('button', { name: 'Novo Fornecedor' }).click()
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

    const moduleLinks = ['Catálogo', 'Estoque', 'Compras']
    for (const label of moduleLinks) {
      await expect(page.getByRole('link', { name: label })).toBeVisible()
    }
  })
})

Now let me check the catalog routes in App.tsx - I see there's no `/catalog/products` or `/catalog/categories` route yet. Let me check what routes exist:

Looking at App.tsx, I see:
- `/catalog` → `<p>Catálogo</p>` (placeholder)
- No `/catalog/products` or `/catalog/categories` routes
- `/inventory` → `<p>Estoque</p>` (placeholder)
- No `/inventory/balances` or `/inventory/movements` routes

I need to add these routes. Let me also check the existing catalog and inventory pages to see if they have test IDs:

Now let me also check the existing test files to understand the test count:

<｜DSML｜tool_calls>
<｜DSML｜invoke name="bash">
<｜DSML｜parameter name="command" string="true">cd "C:\ERP\.worktrees\feat-sprint-18-operations-web\frontend" && npx vitest run 2>&1 | Select-String -Pattern "Tests|Test Files|Duration"