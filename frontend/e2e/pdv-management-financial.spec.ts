import { expect, type Page } from '@playwright/test'
import { test } from './fixtures'

type TenantMembership = { tenant_id: string; tenant_name: string }
type Product = { id: string; sku: string }
type SaleItem = { id: string; product: string; quantity: string }
type Sale = { id: string; status: string; created_at: string; items: SaleItem[] }
type SaleReturn = {
  id: string
  sale: string
  reason: string
  status: string
  items: Array<{ sale_item: string; quantity: string }>
}
type PaginatedResponse<T> = { next: string | null; results: T[] }

function resolveNextPageUrl(currentUrl: URL, next: string): URL {
  const resolved = new URL(next, currentUrl)
  return new URL(`${resolved.pathname}${resolved.search}`, currentUrl.origin)
}

async function fetchAllPages<T>(
  page: Page,
  firstUrl: string,
  headers: Record<string, string>,
): Promise<T[]> {
  const results: T[] = []
  const visited = new Set<string>()
  let nextUrl: URL | null = new URL(firstUrl, new URL(page.url()).origin)

  while (nextUrl) {
    const requestUrl = nextUrl.toString()
    if (visited.has(requestUrl)) {
      throw new Error(`Paginação repetiu a URL: ${requestUrl}`)
    }
    visited.add(requestUrl)

    const response = await page.request.get(requestUrl, { headers })
    expect(response.ok()).toBeTruthy()
    const pageData = (await response.json()) as PaginatedResponse<T>
    results.push(...pageData.results)

    if (!pageData.next) {
      nextUrl = null
      continue
    }
    nextUrl = resolveNextPageUrl(nextUrl, pageData.next)
  }

  return results
}

async function findR9ReturnSale(page: Page) {
  const meResponse = await page.request.get('/api/v1/auth/me/')
  expect(meResponse.ok()).toBeTruthy()
  const me = (await meResponse.json()) as { memberships: TenantMembership[] }
  const tenant = me.memberships.find((membership) => membership.tenant_name === 'E2E Test')
  expect(tenant).toBeDefined()

  const tenantHeaders = { 'X-Tenant-ID': tenant!.tenant_id }
  const products = await fetchAllPages<Product>(
    page,
    '/api/v1/catalog/products/?q=E2E-R9-RETURN-001',
    tenantHeaders,
  )
  const product = products.find((candidate) => candidate.sku === 'E2E-R9-RETURN-001')
  expect(product).toBeDefined()

  const sales = await fetchAllPages<Sale>(
    page,
    '/api/v1/sales/?status=confirmed',
    tenantHeaders,
  )
  const candidates = sales
    .filter((candidate) => candidate.items.some((item) => item.product === product!.id))
    .sort(
      (left, right) =>
        right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id),
    )

  const candidatesWithBalance = await Promise.all(
    candidates.map(async (candidate) => {
      const returnsResponse = await page.request.get(
        `/api/v1/sales/${candidate.id}/returns/`,
        { headers: tenantHeaders },
      )
      expect(returnsResponse.ok()).toBeTruthy()
      const saleReturns = (await returnsResponse.json()) as SaleReturn[]
      const returnedBySaleItem = new Map<string, number>()
      for (const saleReturn of saleReturns) {
        if (!['draft', 'completed'].includes(saleReturn.status)) continue
        for (const item of saleReturn.items) {
          returnedBySaleItem.set(
            item.sale_item,
            (returnedBySaleItem.get(item.sale_item) ?? 0) + Number(item.quantity),
          )
        }
      }

      const saleItem = candidate.items.find((item) => {
        if (item.product !== product!.id) return false
        const returned = returnedBySaleItem.get(item.id) ?? 0
        return Number(item.quantity) - returned > 0
      })
      return saleItem ? { sale: candidate, saleItem } : null
    }),
  )
  const returnableCandidate = candidatesWithBalance.find((candidate) => candidate !== null)
  const sale = returnableCandidate?.sale
  const saleItem = returnableCandidate?.saleItem
  expect(sale).toBeDefined()
  expect(saleItem).toBeDefined()

  return {
    sale: sale!,
    saleItem: saleItem!,
    product: product!,
    tenantId: tenant!.tenant_id,
  }
}

test.describe('Gestão de PDV, Pessoas e Financeiro', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Aceite R9 e autenticação por recovery code executam somente em Chromium.',
  )

  test('Vendas — lista de vendas carrega', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/sales')
    await expect(page.getByTestId('sales-page')).toBeVisible()
    await expect(page.getByTestId('sales-table')).toBeVisible()
  })

  test('Vendas — detalhe de venda mostra itens', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/sales')
    await expect(page.getByTestId('sales-table')).toBeVisible()
    // Click on the first sale row link (assuming there's a link in the row)
    const firstSaleLink = page.locator('[data-testid="sale-row"]').first().getByRole('link')
    await expect(firstSaleLink).toBeVisible()
    await firstSaleLink.click()
    await expect(page.getByTestId('sale-detail-page')).toBeVisible()
    await expect(page.getByTestId('sale-items-table')).toBeVisible()
  })

  test('Vendas — nenhuma ação de nova venda', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/sales')
    await expect(page.getByRole('button', { name: /nova venda/i })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /nova venda/i })).toHaveCount(0)
  })

  test('[R9] devolve item de venda confirmada pela jornada real', async ({ authenticatedPage }) => {
    // Given usuário E2E autenticado, tenant ativo e venda R9 confirmada seedada.
    const page = authenticatedPage
    const { sale, saleItem, product, tenantId } = await findR9ReturnSale(page)

    // When abre o detalhe, aciona Devolver itens e informa quantidade/motivo.
    await page.goto(`/sales/${sale.id}`)
    await expect(page.getByTestId('sale-detail-page')).toBeVisible()
    await page.getByRole('button', { name: 'Devolver itens' }).click()

    const dialog = page.getByTestId('return-dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByTestId(`return-qty-${product.id}`).fill('1')
    await dialog.getByLabel('Motivo').fill('Devolução E2E R9 por teste automatizado')

    // Then POST real retorna 201 com sale_item_id, idempotência e o diálogo fecha.
    const returnResponsePromise = page.waitForResponse((response) => {
      const request = response.request()
      return (
        request.method() === 'POST' &&
        /\/api\/v1\/sales\/[^/]+\/returns\/$/.test(new URL(response.url()).pathname)
      )
    })
    await dialog.getByRole('button', { name: 'Confirmar' }).click()
    const returnResponse = await returnResponsePromise
    expect(returnResponse.status()).toBe(201)

    const request = returnResponse.request()
    const payload = request.postDataJSON() as {
      items: Array<{ sale_item_id?: string; product?: string; quantity: string }>
      reason: string
    }
    expect(payload.items).toEqual([
      { sale_item_id: saleItem.id, quantity: '1' },
    ])
    const reason = 'Devolução E2E R9 por teste automatizado'
    expect(payload.reason).toBe(reason)
    expect(payload.items[0]).not.toHaveProperty('product')
    expect(request.headers()['idempotency-key']).toBeTruthy()

    const responseBody = (await returnResponse.json()) as SaleReturn
    expect(responseBody).toMatchObject({
      id: expect.any(String),
      sale: sale.id,
      status: 'completed',
      reason,
    })
    expect(responseBody.items).toHaveLength(1)
    expect(responseBody.items[0]).toMatchObject({ sale_item: saleItem.id })
    expect(Number(responseBody.items[0].quantity)).toBe(1)

    const persistedResponse = await page.request.get(
      `/api/v1/sales/${sale.id}/returns/`,
      { headers: { 'X-Tenant-ID': tenantId } },
    )
    expect(persistedResponse.ok()).toBeTruthy()
    const persistedReturns = (await persistedResponse.json()) as SaleReturn[]
    const persistedReturn = persistedReturns.find((candidate) => candidate.id === responseBody.id)
    expect(persistedReturn).toBeDefined()
    expect(persistedReturn).toMatchObject({
      id: responseBody.id,
      sale: sale.id,
      status: 'completed',
      reason,
    })
    expect(persistedReturn!.items).toHaveLength(1)
    expect(persistedReturn!.items[0]).toMatchObject({ sale_item: saleItem.id })
    expect(Number(persistedReturn!.items[0].quantity)).toBe(1)
    await expect(dialog).not.toBeVisible()
  })

  test('Sessões de caixa — lista carrega', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/financial/cash-sessions')
    await expect(page.getByTestId('cash-sessions-page')).toBeVisible()
    await expect(page.getByTestId('cash-sessions-table')).toBeVisible()
  })

  test('Pessoas — lista com busca', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/people')
    await expect(page.getByTestId('people-page')).toBeVisible()
    await expect(page.getByTestId('people-table')).toBeVisible()
    
    const searchInput = page.getByRole('textbox', { name: 'Buscar pessoas' })
    await expect(searchInput).toBeVisible()
    await searchInput.fill('João')
    await page.getByRole('button', { name: 'Buscar' }).click()
  })

  test('Pessoas — detalhe mostra seções', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/people')
    await expect(page.getByTestId('people-table')).toBeVisible()
    // Click on the first person row link
    const firstPersonLink = page.locator('[data-testid="person-row"]').first().getByRole('link')
    await expect(firstPersonLink).toBeVisible()
    await firstPersonLink.click()
    await expect(page.getByTestId('person-detail-page')).toBeVisible()
    await expect(page.getByTestId('person-info')).toBeVisible()
  })

  test('Financeiro — contas a receber', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/financial/receivables')
    await expect(page.getByTestId('receivables-page')).toBeVisible()
    await expect(page.getByTestId('receivables-table')).toBeVisible()
  })

  test('Financeiro — fluxo de caixa', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/financial/cashflow')
    await expect(page.getByTestId('cashflow-page')).toBeVisible()
    await expect(page.getByTestId('cashflow-table')).toBeVisible()
  })
})
