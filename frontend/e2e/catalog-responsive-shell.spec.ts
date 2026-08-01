import { expect, test } from './fixtures'

test.describe('Catálogo — shell responsivo', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('abre o catálogo pelo drawer e não causa rolagem horizontal', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/catalog/products')

    await expect(page.getByTestId('main-navigation')).toBeHidden()
    await page.getByRole('button', { name: 'Abrir menu' }).click()
    const drawer = page.getByTestId('mobile-navigation-drawer')
    await expect(drawer).toBeVisible()
    await expect(drawer.getByRole('link', { name: 'Produtos' })).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()
    await expect(page.getByRole('button', { name: 'Abrir menu' })).toBeFocused()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  })
})
