import AxeBuilder from '@axe-core/playwright'

import { expect, test } from './fixtures'

const e2eCredentialsConfigured = Boolean(
  process.env.E2E_USER_EMAIL &&
    process.env.E2E_USER_PASSWORD &&
    process.env.E2E_RECOVERY_CODE,
)

const r4CommandId = '0f7d2a2e-3a77-4ab5-9c2c-6f7763380a31'
const r4PricingPayload = {
  command_id: r4CommandId,
  amount: '120.00',
  valid_from: '2099-01-01T00:00:00Z',
  tiers: [
    { min_quantity: '10', amount: '100.00' },
    { min_quantity: '20', amount: '90.00' },
  ],
}

test.describe('R4 - produto, custo, varejo, atacado e margens', () => {
  test.describe.configure({ retries: 0 })

  test('r4 vertical acceptance', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    let productId = 'r4-local-product'

    if (e2eCredentialsConfigured) {
      const meResponse = await page.request.get('/api/v1/auth/me/')
      await expect(meResponse).toBeOK()
      const me = (await meResponse.json()) as { memberships: Array<{ tenant_id: string }> }
      const tenantId = me.memberships[0]?.tenant_id
      expect(tenantId, 'A sessão E2E deve possuir um tenant selecionado.').toBeTruthy()

      const productsResponse = await page.request.get(
        '/api/v1/catalog/products/?q=E2E-PROD-001',
        { headers: { 'X-Tenant-ID': tenantId! } },
      )
      await expect(productsResponse).toBeOK()
      const products = (await productsResponse.json()) as {
        results: Array<{ id: string; sku: string }>
      }
      const product = products.results.find(({ sku }) => sku === 'E2E-PROD-001')
      expect(product, 'O seed E2E deve fornecer o produto E2E-PROD-001.').toBeTruthy()
      productId = product!.id

      const csrfResponse = await page.request.get('/api/v1/auth/csrf/')
      await expect(csrfResponse).toBeOK()
      const csrfToken = (await page.context().cookies()).find(
        (cookie) => cookie.name === 'csrftoken',
      )?.value
      expect(csrfToken, 'A sessão E2E deve possuir cookie CSRF antes da escrita R4.').toBeTruthy()

      const setupResponse = await page.request.post(
        `/api/v1/catalog/products/${productId}/prices/`,
        {
          headers: { 'X-Tenant-ID': tenantId!, 'X-CSRFToken': csrfToken! },
          data: { ...r4PricingPayload, product_id: productId },
        },
      )
      const setupStatus = setupResponse.status()
      if (![200, 201].includes(setupStatus)) {
        throw new Error(
          `R4 setup POST falhou; o seed/ambiente não permite escrita. ` +
            `status=${setupStatus} body=${await setupResponse.text()}`,
        )
      }
      expect([200, 201], 'O setup R4 deve aceitar criação (201) ou replay idempotente (200).').toContain(setupStatus)
      const setupResult = (await setupResponse.json()) as {
        command_id: string
        status: string
        product_id: string
        price_id: string
      }
      expect(setupResult).toMatchObject({
        command_id: r4CommandId,
        status: 'applied',
        product_id: productId,
      })
      expect(setupResult.price_id).toBeTruthy()
    } else {
      await page.route(`**/api/v1/catalog/products/${productId}/prices/**`, (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          json: {
            id: 'r4-local-price',
            product: productId,
            amount: '100.00',
            cost: null,
            currency: 'BRL',
            retail_margin: null,
            tiers: [],
            valid_from: '2026-01-01T00:00:00Z',
            valid_to: null,
            version: 1,
          },
        }),
      )
    }

    await page.goto(`/app/catalog/products/${productId}/prices`)

    await expect(page).toHaveURL(new RegExp(`/app/catalog/products/${productId}/prices$`))
    await expect(page.getByRole('main', { name: 'Venda varejo' })).toBeVisible()

    const pricingStep = page.getByTestId('product-prices-step')
    await expect(pricingStep).toBeVisible()
    const pricingSummary = page.getByTestId('r4-pricing-summary')
    await expect(pricingSummary).toBeVisible()
    await expect(pricingSummary.getByText('Custo')).toBeVisible()
    await expect(pricingSummary.getByText('Venda varejo')).toBeVisible()
    await expect(pricingSummary.getByText('Atacado')).toBeVisible()
    await expect(pricingSummary.getByText('Margem varejo')).toBeVisible()
    // The deterministic write is future-effective; the card displays the current seeded price.
    await expect(page.getByTestId('price-tiers-section')).toBeVisible()
    // seed_e2e creates inventory stock, not a confirmed purchase receipt; cost-derived margins are explicit.
    await expect(pricingSummary.getByText('Não informado')).toHaveCount(2)
    await expect(page.getByRole('alert')).toHaveCount(0)

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(
      accessibilityScanResults.violations.filter(
        (violation) => violation.impact === 'critical' || violation.impact === 'serious',
      ),
    ).toEqual([])
  })
})
