import fs from 'node:fs/promises'
import path from 'node:path'
import type { FullConfig } from '@playwright/test'
import { authenticatePage } from './fixtures'

export default async function globalSetup(config: FullConfig): Promise<void> {
  const project = config.projects[0]
  const baseURL = project.use.baseURL as string | undefined
  const authStatePath = path.resolve('test-results/.auth/e2e-user.json')
  await fs.mkdir(path.dirname(authStatePath), { recursive: true })
  const browser = await (await import('@playwright/test')).chromium.launch()
  const context = await browser.newContext({ baseURL })
  const page = await context.newPage()
  await authenticatePage(page)
  await context.storageState({ path: authStatePath })
  await context.close()
  await browser.close()
}
