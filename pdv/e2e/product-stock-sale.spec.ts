import fs from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const artifactPath = process.env.E2E_ARTIFACT_PATH ?? path.resolve('..', 'test-results', 'product-pdv-flow.json')
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

const apiKey = process.env.E2E_PDV_API_KEY

async function readArtifact() {
  try {
    return JSON.parse(await fs.readFile(artifactPath, 'utf8')) as FlowArtifact
  } catch (error) {
    throw new Error(`Artefato do fluxo admin não encontrado em ${artifactPath}; execute o E2E frontend antes do PDV. ${String(error)}`)
  }
}

async function stubElectron(page: Page) {
  await page.addInitScript(() => {
    ;(window as any).electronAPI = {
      onSyncStateChange: () => () => {}, getSyncState: () => Promise.resolve({ status: 'idle', pendingCount: 0, lastSyncAt: null, error: null }),
      syncNow: () => Promise.resolve(), getConnectivityState: () => Promise.resolve({ isOnline: true, lastOnlineAt: null, lastOfflineAt: null, lastSyncAt: null }),
      onConnectivityChange: () => () => {},
    }
  })
}

async function login(page: Page) {
  if (!apiKey) throw new Error('Defina E2E_PDV_API_KEY para autenticar o PDV.')
  await page.goto('/login')
  await page.getByLabel('Chave de API (API Key)').fill(apiKey)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(/\/dashboard/)
}

async function ensureCashOpen(page: Page) {
  await page.goto('/cash-session')
  await page.waitForLoadState('networkidle')
  const openButton = page.getByRole('button', { name: 'Abrir Caixa' })
  const canOpen = await expect(openButton).toBeVisible({ timeout: 5000 }).then(() => true).catch(() => false)
  if (canOpen) {
    await page.locator('#openingAmount').fill('100')
    await openButton.click()
    await expect(page).toHaveURL(/\/dashboard/)
  }
}

async function selectProduct(page: Page, name: string) {
  const search = page.getByPlaceholder('Buscar produto (SKU ou nome)...')
  await search.fill(name)
  const option = page.getByText(name, { exact: true }).first()
  await expect(option).toBeVisible({ timeout: 10000 })
  await option.click()
}

test.describe('PDV @live — venda baixa estoque e protege preço ausente', () => {
  test.skip(process.env.E2E_LIVE_PDV !== '1', 'Fluxo live exige E2E_LIVE_PDV=1 e dados/credenciais do ambiente dedicado.');
  test('vende 3 unidades, mostra KG 0.500 e bloqueia produto sem preço', async ({ page, browser }) => {
    const artifact = await readArtifact()
    await stubElectron(page)
    await login(page)
    await ensureCashOpen(page)
    await page.goto('/sale')

    await selectProduct(page, artifact.products.withoutPrice.name)
    await expect(page.getByText(/não pode ser adicionado sem preço válido/i)).toBeVisible()
    await expect(page.getByText('Carrinho vazio')).toBeVisible()

    await selectProduct(page, artifact.products.unit.name)
    const quantityInput = page.locator('input[type="number"]').first()
    await quantityInput.fill('3')
    await expect(page.getByText('Qtd: 3', { exact: true })).toBeVisible()
    const payment = page.locator('input[placeholder="0,00"]').first()
    await payment.fill('59.70')
    await page.getByRole('button', { name: 'Adicionar Pagamento' }).click()
    const saleResponse = page.waitForResponse((response) => response.url().includes('/api/v1/sales/counter/') && response.request().method() === 'POST')
    await page.getByRole('button', { name: 'Confirmar Venda' }).click()
    expect((await saleResponse).status()).toBe(201)
    await expect(page.getByRole('status')).toContainText(/Venda .* realizada com sucesso/, { timeout: 15000 })
    const closeReceipt = page.getByRole('button', { name: 'Fechar' }).first()
    if (await closeReceipt.isVisible().catch(() => false)) await closeReceipt.click()

    await page.goto('/sale')
    await selectProduct(page, artifact.products.kilogram.name)
    await expect(page.getByText(/Qtd: 1(?:\.0+)?kg/)).toBeVisible()
    await page.locator('input[placeholder="0,00"]').first().fill('12.00')
    await page.getByRole('button', { name: 'Adicionar Pagamento' }).click()
    const kilogramSale = page.waitForResponse((response) => response.url().includes('/api/v1/sales/counter/') && response.request().method() === 'POST')
    await page.getByRole('button', { name: 'Confirmar Venda' }).click()
    expect((await kilogramSale).status()).toBe(201)
    await expect(page.getByRole('status')).toContainText(/Venda .* realizada com sucesso/, { timeout: 15000 })

    const adminContext = await browser.newContext({ baseURL: artifact.adminBaseUrl })
    const admin = await adminContext.newPage()
    const email = process.env.E2E_USER_EMAIL
    const password = process.env.E2E_USER_PASSWORD
    const recoveryCode = process.env.E2E_ADMIN_RECOVERY_CODE
    if (!email || !password || !recoveryCode) throw new Error('Defina E2E_USER_EMAIL, E2E_USER_PASSWORD e E2E_ADMIN_RECOVERY_CODE para validar o saldo administrativo.')
    await admin.goto('/login')
    await admin.fill('[name="email"]', email)
    await admin.fill('[name="password"]', password)
    await admin.click('button[type="submit"]')
    await admin.waitForURL(/\/mfa/)
    const recoveryToggle = admin.locator('button[type="button"]')
    if (recoveryCode.length >= 8 && await recoveryToggle.count()) await recoveryToggle.last().click()
    await admin.fill('#mfa-code', recoveryCode)
    await admin.getByRole('button', { name: /Entrar|Verificar/ }).click()
    await admin.waitForURL((url) => !['/login', '/mfa'].includes(url.pathname))
    const tenantSelector = admin.getByTestId('tenant-selector')
    if (await tenantSelector.isVisible().catch(() => false)) {
      const primaryTenant = tenantSelector.getByRole('button', { name: 'E2E Test', exact: true })
      await primaryTenant.click()
      await expect(primaryTenant).toHaveAttribute('aria-current', 'true')
    }
    await admin.goto(`/inventory/balances?q=${encodeURIComponent(artifact.products.unit.name)}`)
    await expect(admin.getByTestId('balance-row').filter({ hasText: artifact.products.unit.name })).toContainText('7.000000')
    await admin.goto(`/inventory/balances?q=${encodeURIComponent(artifact.products.kilogram.name)}`)
    const kilogramBalance = admin.getByTestId('balance-row').filter({ hasText: artifact.products.kilogram.name })
    await expect(kilogramBalance).toContainText('0.500000')
    await expect(kilogramBalance).toContainText(/kg/i)
    await adminContext.close()
  })
})
