import { mkdir, rm } from 'node:fs/promises'
import { chromium, type FullConfig } from '@playwright/test'
import { authStorageDirectory, authStorageState } from './auth-state'
import { authenticatePage } from './fixtures'

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL
  if (typeof baseURL !== 'string') {
    throw new Error('Playwright requer baseURL para persistir a sessão E2E autenticada.')
  }

  await mkdir(authStorageDirectory, { recursive: true })
  await rm(authStorageState, { force: true })

  const browser = await chromium.launch()
  const context = await browser.newContext({ baseURL })
  const page = await context.newPage()
  try {
    await authenticatePage(page)
    await context.storageState({ path: authStorageState })
  } finally {
    await context.close()
    await browser.close()
  }
}
