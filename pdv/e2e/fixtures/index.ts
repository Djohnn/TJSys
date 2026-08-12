import { test as base, expect, Page } from '@playwright/test';
import { LoginPage } from '../pages/login.page';

const AUTH_SUCCESS = {
  token: 'mock-token',
  refresh_token: 'mock-refresh',
  device_id: 'mock-device-id',
  branch_id: 'mock-branch-id',
  tenant_id: 'mock-tenant-id',
};

async function mockAuthApi(page: Page) {
  await page.route('**/api/v1/devices/validate/**', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    if (body.api_key === 'fail-key') {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ detail: 'API key inv\u00E1lida' }) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(AUTH_SUCCESS) });
    }
  });
  await page.route('**/api/v1/devices/refresh/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'refreshed-token', refresh_token: 'refreshed-refresh' }) });
  });
  await page.route('**/api/v1/cash-sessions/**', async (route) => {
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: 'No active session' }) });
  });
}

type Fixtures = {
  loginPage: LoginPage;
  authedPage: Page;
};

export const test = base.extend<Fixtures>({
  loginPage: async ({ page }, use) => {
    await mockAuthApi(page);
    await use(new LoginPage(page));
  },

  authedPage: async ({ page }, use) => {
    await page.addInitScript(() => {
      (window as any).electronAPI = {
        // Connectivity — SyncIndicator expects these exact names + {success,data} wrapper
        getConnectivityStatus: () => Promise.resolve({ success: true, data: { isOnline: true, lastOnlineAt: null, lastOfflineAt: null, lastSyncAt: null } }),
        checkConnectivity: () => Promise.resolve({ success: true, data: { isOnline: true } }),
        onConnectivityChange: () => () => {},
        // Sync
        getSyncStatus: () => Promise.resolve({ success: true, data: { status: 'idle', pendingCount: 0, lastSyncAt: null, error: null } }),
        startSync: () => Promise.resolve({ success: true, data: { status: 'idle', pendingCount: 0, lastSyncAt: null, error: null } }),
        onSyncStateChange: () => () => {},
      };
    });
    await mockAuthApi(page);
    await page.goto('/login');
    await page.getByLabel('Chave de API (API Key)').fill('valid-key');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
    await use(page);
  },
});

export { expect };
