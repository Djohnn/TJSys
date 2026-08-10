import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5174'
const devPort = new URL(baseURL).port || '5173'
const webCommand = process.env.PLAYWRIGHT_USE_PREVIEW
  ? `npm run preview -- --port ${devPort}`
  : `npm run dev -- --port ${devPort}`
const useExternalServer = process.env.PLAYWRIGHT_EXTERNAL_SERVER === '1'

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: Number(process.env.PLAYWRIGHT_RETRIES ?? (process.env.CI ? 2 : 0)),
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { outputFolder: 'playwright-report' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: useExternalServer
    ? undefined
    : {
        command: webCommand,
        url: baseURL,
        reuseExistingServer: true,
      },
})
