import fs from 'node:fs/promises'
import path from 'node:path'
import { expect } from '@playwright/test'
import { authenticatePage, productPdvArtifactPath, test } from './fixtures'

type ProductArtifact = {
  id: string
  name: string
  sku: string
  price: string
  unitSymbol: string
  initialQuantity: string
  stockLocationId: string
  branchId: string
}

type FlowArtifact = {
  createdAt: string
  adminBaseUrl: string
  products: { unit: ProductArtifact; kilogram: ProductArtifact; withoutPrice: ProductArtifact }
}

async function firstOptionValue(page: import('@playwright/test').Page, selector: string) {
  const option = page.locator(`${selector} option`).nth(1)
  await expect(option).toBeAttached()
  return (await option.getAttribute('value')) as string
}

async function createProduct(
  page: import('@playwright/test').Page,
  input: { name: string; sku: string; unitId: string; initialQuantity?: string; tracksInventory: boolean },
) {
  await page.goto('/catalog/products/new')
  await expect(page.getByTestId('product-identity-step')).toBeVisible()
  await page.getByLabel('Nome').fill(input.name)
  await page.getByLabel('SKU').fill(input.sku)
  await page.locator('#pi-category').selectOption(await firstOptionValue(page, '#pi-category'))
  await page.locator('#pi-unit').selectOption(input.unitId)
  await page.locator('#pi-product-kind').selectOption('revenda')
  const inventory = page.getByTestId('product-tracks-inventory-checkbox')
  if (input.tracksInventory) {
    await inventory.check()
    await expect(page.getByTestId('product-stock-fields')).toBeVisible()
    await page.locator('#product-stock-branch').selectOption(await firstOptionValue(page, '#product-stock-branch'))
    await expect(page.locator('#product-stock-location option')).toHaveCount(2, { timeout: 10000 })
    await page.locator('#product-stock-location').selectOption(await firstOptionValue(page, '#product-stock-location'))
    await page.locator('#product-stock-initial-quantity').fill(input.initialQuantity ?? '0')
  }
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page).toHaveURL(/\/catalog\/products\/[^/]+\/edit/)
  const id = page.url().match(/products\/([^/]+)\/edit/)?.[1]
  if (!id) throw new Error(`Não foi possível obter o ID do produto criado: ${page.url()}`)
  return id
}

test.describe('Aceite vertical admin → estoque → PDV', () => {
  test('cria produtos pela interface, confirma estoque 10 e publica artefato para o PDV', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    const timestamp = Date.now()
    const tenantId = await page.evaluate(() => localStorage.getItem('tjsys:selected-tenant'))
    if (!tenantId) throw new Error('Sessão E2E autenticada sem tenant selecionado no armazenamento local.')
    const apiHeaders = { 'X-Tenant-ID': tenantId }
    const refs = await page.request.get('/api/v1/catalog/units/?page=1', { headers: apiHeaders })
    expect(refs.ok()).toBe(true)
    const units = ((await refs.json()) as { results?: Array<{ id: string; symbol: string; precision: number }> }).results ?? []
    const unit = units.find((item) => item.symbol.toUpperCase() === 'UN') ?? units.find((item) => item.precision === 0)
    const kilogram = units.find((item) => item.symbol.toUpperCase() === 'KG')
    if (!unit || !kilogram) throw new Error('Seed E2E precisa fornecer unidades UN e KG para o fluxo vertical.')

    const unitName = `E2E Flow Unit ${timestamp}`
    const kilogramName = `E2E Flow Kg ${timestamp}`
    const noPriceName = `E2E Flow Sem Preço ${timestamp}`
    const unitId = await createProduct(page, { name: unitName, sku: `E2E-FLOW-${timestamp}`, unitId: unit.id, initialQuantity: '10', tracksInventory: true })
    await page.getByRole('tab', { name: 'Preços' }).click()
    await page.getByTestId('base-price-amount').fill('19.90')
    await page.getByTestId('save-base-price').click()
    await expect(page.getByTestId('price-feedback')).toContainText('Preço base salvo')

    const kilogramId = await createProduct(page, { name: kilogramName, sku: `E2E-KG-${timestamp}`, unitId: kilogram.id, initialQuantity: '1.500', tracksInventory: true })
    await page.getByRole('tab', { name: 'Preços' }).click()
    await page.getByTestId('base-price-amount').fill('12.00')
    await page.getByTestId('save-base-price').click()
    await expect(page.getByTestId('price-feedback')).toContainText('Preço base salvo')

    const noPriceId = await createProduct(page, { name: noPriceName, sku: `E2E-NOPRICE-${timestamp}`, unitId: unit.id, tracksInventory: false })

    await page.goto(`/inventory/balances?q=${encodeURIComponent(unitName)}`)
    const balanceRow = page.getByTestId('balance-row').filter({ hasText: unitName })
    await expect(balanceRow).toBeVisible()
    await expect(balanceRow).toContainText(/\b10\b/)

    const stock = await page.request.get(`/api/v1/inventory/product-summary/${unitId}/`, { headers: apiHeaders })
    expect(stock.ok()).toBe(true)
    const stockData = await stock.json() as Array<{ quantity: string; location: string; branch: string }>
    const stockSummary = stockData[0]
    if (!stockSummary) throw new Error('Produto unitário criado sem saldo inicial retornado pela API.')
    const kilogramStock = await page.request.get(`/api/v1/inventory/product-summary/${kilogramId}/`, { headers: apiHeaders })
    expect(kilogramStock.ok()).toBe(true)
    const kilogramSummary = (await kilogramStock.json() as Array<{ location: string; branch: string }>)[0]
    if (!kilogramSummary) throw new Error('Produto KG criado sem política de estoque retornada pela API.')

    const artifact: FlowArtifact = {
      createdAt: new Date().toISOString(),
      adminBaseUrl: process.env.FRONTEND_BASE_URL ?? 'http://localhost:5174',
      products: {
        unit: { id: unitId, name: unitName, sku: `E2E-FLOW-${timestamp}`, price: '19.90', unitSymbol: 'UN', initialQuantity: '10', stockLocationId: stockSummary.location, branchId: stockSummary.branch },
        kilogram: { id: kilogramId, name: kilogramName, sku: `E2E-KG-${timestamp}`, price: '12.00', unitSymbol: 'KG', initialQuantity: '1.500', stockLocationId: kilogramSummary.location, branchId: kilogramSummary.branch },
        withoutPrice: { id: noPriceId, name: noPriceName, sku: `E2E-NOPRICE-${timestamp}`, price: '', unitSymbol: 'UN', initialQuantity: '0', stockLocationId: stockSummary.location, branchId: stockSummary.branch },
      },
    }
    await fs.mkdir(path.dirname(productPdvArtifactPath), { recursive: true })
    await fs.writeFile(productPdvArtifactPath, JSON.stringify(artifact, null, 2), 'utf8')
    await expect(page.getByTestId('balances-table')).toContainText(unitName)
  })
})
