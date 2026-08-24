import { expect, test } from './fixtures'

test.describe('Catálogo — aceite Sprints 23–30', () => {
  test('shell expõe todas as entradas solicitadas', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/app/catalog')
    const contextual = page.getByTestId('catalog-context-navigation')
    for (const label of [
      'Produtos', 'Serviços', 'Combo', 'Categorias', 'Marcas', 'Unidades de Medida', 'Impressão de Etiquetas',
    ]) {
      await expect(contextual.getByRole('link', { name: label })).toBeVisible()
    }
    await expect(page.getByTestId('catalog-overview')).toBeVisible()
  })

  test('cadastro de produto mantém mídia à esquerda e seis etapas', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/app/catalog/products/new')
    await expect(page.getByTestId('product-media-panel')).toBeVisible()
    await expect(page.getByTestId('product-identity-step')).toBeVisible()
    await expect(page.getByTestId('product-editor-layout')).toHaveAttribute('data-layout', 'media-left-identity-right')
    for (const step of ['Identificação', 'Preços', 'Estoque', 'Fiscal', 'Composição', 'Canais']) {
      await expect(page.getByRole('tab', { name: step })).toBeVisible()
    }
  })

  test('classificadores administrativos carregam', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    for (const [path, action] of [
      ['/app/catalog/categories', /^(Nova Categoria|Criar Categoria)$/],
      ['/app/catalog/brands', /^(Nova|Criar) Marca$/],
      ['/app/catalog/units', /^(Nova Unidade|Criar Unidade)$/],
    ] as const) {
      await page.goto(path)
      await expect(page.locator('main')).toBeVisible()
      await expect(page.getByRole('button', { name: action })).toBeVisible()
    }
  })

  test('serviços, combos e etiquetas carregam suas jornadas', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/app/catalog/services')
    await expect(page.getByTestId('services-page')).toBeVisible()
    await page.goto('/app/catalog/combos')
    await expect(page.getByTestId('combos-page')).toBeVisible()
    await page.goto('/app/catalog/labels')
    await expect(page.getByTestId('labels-page')).toBeVisible()
  })
})
