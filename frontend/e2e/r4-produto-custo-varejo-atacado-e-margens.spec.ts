import AxeBuilder from '@axe-core/playwright'

import { expect, test } from './fixtures'

const e2eCredentialsConfigured = Boolean(
  process.env.E2E_USER_EMAIL &&
    process.env.E2E_USER_PASSWORD &&
    process.env.E2E_RECOVERY_CODE,
)

test.describe('R4 - produto, custo, varejo, atacado e margens', () => {
  test.describe.configure({ retries: 0 })

  test('r4 vertical acceptance', async ({ authenticatedPage }) => {
    test.skip(
      !e2eCredentialsConfigured && !process.env.CI,
      'E2E não executado: defina E2E_USER_EMAIL, E2E_USER_PASSWORD e E2E_RECOVERY_CODE; em CI a ausência deve falhar o setup.',
    )

    const page = authenticatedPage
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

    await page.goto(`/catalog/products/${product!.id}/prices`)

    await expect(page).toHaveURL(new RegExp(`/catalog/products/${product!.id}/prices$`))
    await expect(page.getByRole('heading', { name: 'Venda varejo' })).toBeVisible()

    const pricingStep = page.getByTestId('product-prices-step')
    await expect(pricingStep).toBeVisible()
    const pricingSummary = page.getByTestId('r4-pricing-summary')
    await expect(pricingSummary).toBeVisible()
    await expect(pricingSummary.getByText('BRL 49.90')).toBeVisible()
    await expect(pricingSummary.getByText('Não informado')).toHaveCount(2)
    await expect(pricingSummary.getByText('Nenhuma faixa')).toBeVisible()
    await expect(page.getByTestId('price-tiers-empty')).toBeVisible()
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
