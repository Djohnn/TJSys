import { expect, test } from './fixtures'

test.describe('Catálogo — aceite Sprints 23–30', () => {
  test('hub expõe todas as entradas solicitadas', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/catalog')
    for (const id of [
      'produtos', 'serviços', 'combo', 'categorias', 'marcas', 'unidades', 'etiquetas',
    ]) {
      await expect(page.getByTestId(`hub-card-${id}`)).toBeVisible()
    }
    await expect(page.getByTestId('hub-card-unidades')).toContainText('Unidades de Medida')
    await expect(page.getByTestId('hub-card-etiquetas')).toContainText('Impressão de Etiquetas')
  })

  test('cadastro de produto mantém mídia à esquerda e seis etapas', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/catalog/products/new')
    await expect(page.getByTestId('product-media-panel')).toBeVisible()
    await expect(page.getByTestId('product-identity-step')).toBeVisible()
    for (const step of ['Identificação', 'Preços', 'Estoque', 'Fiscal', 'Composição', 'Canais']) {
      await expect(page.getByRole('tab', { name: step })).toBeVisible()
    }
  })

  test('classificadores administrativos carregam', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    for (const [path, action] of [
      ['/catalog/categories', 'Nova Categoria'],
      ['/catalog/brands', 'Criar Marca'],
      ['/catalog/units', 'Nova Unidade'],
    ] as const) {
      await page.goto(path)
      await expect(page.locator('main')).toBeVisible()
      await expect(page.getByRole('button', { name: action })).toBeVisible()
    }
  })

  test('serviços, combos e etiquetas carregam suas jornadas', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/catalog/services')
    await expect(page.getByTestId('services-page')).toBeVisible()
    await page.goto('/catalog/combos')
    await expect(page.getByTestId('combos-page')).toBeVisible()
    await page.goto('/catalog/labels')
    await expect(page.getByTestId('labels-page')).toBeVisible()
  })
})
