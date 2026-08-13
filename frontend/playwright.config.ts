import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173'
const devPort = new URL(baseURL).port || '5173'
const authStorageState = 'test-results/.auth/e2e-user.json'
const webCommand = process.env.PLAYWRIGHT_USE_PREVIEW
  ? `npm run preview -- --host 127.0.0.1 --port ${devPort}`
  : `npm run dev -- --host 127.0.0.1 --port ${devPort}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['html', { outputFolder: 'playwright-report' }]],
  globalSetup: './e2e/global-setup',
  use: {
    baseURL,
    storageState: authStorageState,
    trace: 'retain-on-failure',
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
  webServer: {
    command: webCommand,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
})
