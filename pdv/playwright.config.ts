import { defineConfig, devices } from '@playwright/test';

const livePdvEnabled = process.env.E2E_LIVE_PDV === '1';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: Number(process.env.PLAYWRIGHT_RETRIES ?? (process.env.CI ? 2 : 0)),
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html'], ['junit', { outputFile: 'results.xml' }]]
    : 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium-mock',
      grepInvert: /@live/,
      use: { ...devices['Desktop Chrome'] },
    },
    ...(livePdvEnabled ? [{
      name: 'chromium-live',
      grep: /@live/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.E2E_LIVE_BASE_URL ?? process.env.BASE_URL ?? 'http://localhost:5173',
      },
    }] : []),
  ],
});
