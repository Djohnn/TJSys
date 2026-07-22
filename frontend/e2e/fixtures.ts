import { test as base } from '@playwright/test'

export const test = base.extend<{
  authenticatedPage: any
}>({
  authenticatedPage: async ({ page }, use) => {
    await page.goto('/login')
    await page.fill('[name="email"]', 'web-admin@zyrp.local')
    await page.fill('[name="password"]', 'e2e-test-pwd-2026')
    await page.click('button[type="submit"]')
    await page.waitForURL(/^\/(?!login)/)
    await use(page)
  },
})
