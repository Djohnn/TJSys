import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

for (const width of [390, 320]) {
  test(`landing pública permanece operável em ${width}px`, async ({ page }) => {
    // Given: a landing pública é aberta em um viewport mobile
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.landing-animate-in').last()).toHaveCSS(
      'opacity',
      '1',
    )

    // Then: hero, CTA e login permanecem visíveis sem overflow horizontal
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      /Venda mais/i,
    )
    await expect(
      page.getByRole('link', { name: 'Entrar', exact: true }).first(),
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: /Solicite uma demonstração/i }).first(),
    ).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)

    const targets = await page
      .locator('a:visible, button:visible')
      .evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect()
          return { width: rect.width, height: rect.height }
        }),
      )
    expect(
      targets.every(
        ({ width: targetWidth, height }) => targetWidth >= 48 && height >= 48,
      ),
    ).toBe(true)
  })
}

test('landing pública não inicializa chamadas de autenticação', async ({
  page,
}) => {
  // Given: a landing pública é aberta sem autenticação
  const authRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/auth/')) {
      authRequests.push(request.url())
    }
  })

  // When: a pessoa acessa a raiz pública
  await page.goto('/', { waitUntil: 'domcontentloaded' })

  // Then: nenhum endpoint de autenticação é inicializado
  expect(authRequests).toEqual([])
})
test('landing pública valida formulário e não apresenta violações graves de acessibilidade', async ({
  page,
}) => {
  // Given: a pessoa visita a landing pública sem autenticação
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.landing-animate-in').last()).toHaveCSS(
    'opacity',
    '1',
  )

  // When: envia o formulário vazio
  await page
    .getByRole('button', { name: /Conversar sobre uma demonstração/i })
    .click()

  // Then: erros humanos são exibidos e a página estabilizada passa o gate axe grave
  await expect(page.getByText('Informe seu nome')).toBeVisible()
  await expect(page.getByText('Selecione o tamanho da operação')).toBeVisible()
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze()
  const blockingViolations = results.violations.filter(
    ({ impact }) => impact === 'critical' || impact === 'serious',
  )
  expect(blockingViolations).toEqual([])
})
