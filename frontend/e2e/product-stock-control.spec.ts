import { randomUUID } from 'node:crypto'

import { expect, test } from './fixtures'

const CHANNELS = ['mercadolivre', 'shopee', 'amazon', 'magalu', 'shein', 'nuvemshop'] as const

test('cadastra produto com classificadores, saldo inicial e extensões persistidas', async ({ authenticatedPage }) => {
  const page = authenticatedPage
  const suffix = randomUUID()
  const categoryName = `Categoria Estoque E2E ${suffix}`
  const brandName = `Marca Estoque E2E ${suffix}`

  await page.goto('/catalog/products/new')
  await page.getByLabel('Nome').fill('Produto Estoque E2E')
  await page.getByLabel('SKU').fill(`STOCK-${suffix}`)

  await page.getByTestId('quick-create-category-btn').click()
  await page.getByPlaceholder('Nome da categoria').fill(categoryName)
  await page.getByTestId('quick-cat-submit').click()
  await expect(page.getByTestId('category-quick-create-modal')).toHaveCount(0)
  await page.getByLabel('Categoria').selectOption({ label: categoryName })

  await page.getByTestId('quick-create-brand-btn').click()
  await page.getByPlaceholder('Nome da marca').fill(brandName)
  await page.getByTestId('quick-brand-submit').click()
  await expect(page.getByTestId('brand-quick-create-modal')).toHaveCount(0)
  await page.getByLabel('Marca').selectOption({ label: brandName })

  await page.getByLabel('Unidade').selectOption({ label: 'Unidade' })

  await page.getByLabel('Controlar estoque').check()
  await page.getByLabel('Filial').selectOption({ label: 'E2E Branch' })
  await expect(page.getByLabel('Local de estoque').getByRole('option', { name: 'Local E2E (E2E-LOCAL)' })).toBeAttached()
  await page.getByLabel('Local de estoque').selectOption({ label: 'Local E2E (E2E-LOCAL)' })
  await page.getByLabel('Quantidade inicial').fill('25')
  await page.getByLabel('Quantidade mínima').fill('5')
  await page.getByLabel('Ponto de reposição').fill('10')

  const applyPromise = page.waitForResponse(
    (r) => r.url().includes('/catalog/products/apply/') && r.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Continuar' }).click()
  const applyResp = await applyPromise
  const body = (await applyResp.json()) as { product: { id: string } }
  const productId = body.product.id

  await expect(page.getByTestId('editor-feedback')).toContainText('Produto criado com sucesso.')
  await expect(page.getByRole('tab', { name: 'Estoque' })).toBeEnabled()

  await page.getByRole('tab', { name: 'Estoque' }).click()
  await expect(page.getByTestId('stock-available-value')).toHaveText('25')
  await expect(page.getByTestId('stock-current-value')).toHaveText('25')
  await expect(page.getByTestId('stock-reserved-value')).toHaveText('0')
  await expect(page.getByText('Normal', { exact: true })).toBeVisible()

  const editUrl = `/catalog/products/${productId}/edit`

  await page.getByRole('tab', { name: 'Preços' }).click()
  await page.getByTestId('base-price-amount').fill('49.90')
  const refreshedPrices = page.waitForResponse(
    (response) => response.url().includes(`/catalog/products/${productId}/prices/`) && response.request().method() === 'GET',
  )
  await page.getByTestId('save-base-price').click()
  await expect(page.getByTestId('price-feedback')).toContainText('Preço de venda varejo salvo.')
  await refreshedPrices
  await expect(page.getByTestId('r4-pricing-summary')).toContainText('BRL 49.90')
  await expect(page.getByTestId('tier-min-quantity-input')).toBeVisible()
  await page.getByTestId('tier-min-quantity-input').fill('1')
  await page.getByTestId('tier-amount-input').fill('10.00')
  const tierResponse = page.waitForResponse(
    (response) => response.url().includes(`/catalog/products/${productId}/prices/`) && response.request().method() === 'POST',
  )
  await page.getByTestId('add-tier-button').click()
  expect((await tierResponse).ok()).toBeTruthy()
  await expect(page.getByTestId('price-tier-row')).toContainText('1')
  await expect(page.getByTestId('price-tier-row')).toContainText('10.00')
  await page.goto(editUrl)
  await page.getByRole('tab', { name: 'Preços' }).click()
  await expect(page.getByTestId('r4-pricing-summary')).toContainText('BRL 49.90')
  await expect(page.getByTestId('price-tier-row')).toContainText('1')
  await expect(page.getByTestId('price-tier-row')).toContainText('10.00')

  await page.getByRole('tab', { name: 'Fiscal' }).click()
  await expect(page.getByTestId('fiscal-data-section')).toBeVisible()
  await page.getByTestId('fiscal-ncm-input').fill('84713000')
  await page.getByTestId('fiscal-save-button').click()
  await expect(page.getByTestId('fiscal-feedback')).toContainText('Dados fiscais salvos.')
  await page.goto(editUrl)
  await page.getByRole('tab', { name: 'Fiscal' }).click()
  await expect(page.getByTestId('fiscal-data-section')).toBeVisible()
  await expect(page.getByTestId('fiscal-ncm-input')).toHaveValue('84713000')

  await page.getByRole('tab', { name: 'Canais' }).click()
  await page.getByTestId(`add-channel-${CHANNELS[0]}`).click()
  await expect(page.getByTestId(`channel-row-${CHANNELS[0]}`)).toBeVisible()
  await page.goto(editUrl)
  await page.getByRole('tab', { name: 'Canais' }).click()
  await expect(page.getByTestId(`channel-row-${CHANNELS[0]}`)).toHaveCount(1)
})
