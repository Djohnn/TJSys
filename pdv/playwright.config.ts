import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: Number(process.env.PLAYWRIGHT_RETRIES ?? (process.env.CI ? 2 : 0)),
  workers: process.env.CI ? 1 : '50%',
  reporter: process.env.CI
    ? [['github'], ['html'], ['junit', { outputFile: 'results.xml' }]]
    : 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'npx vite --config vite.renderer.config.ts',
    port: 5173,
    timeout: 30000,
    reuseExistingServer: true,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
