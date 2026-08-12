import { expect, test } from '@playwright/test';

const API_KEY = 'e2e-test-key-2026';

test.describe('R7 Fiscal emission contract', () => {
  test('solicita NFC-e e acompanha QUEUED até CONCLUDED', async ({ page }) => {
    let statusPolls = 0;

    await page.route('**/api/v1/devices/validate/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: 'r7-token',
          refresh_token: 'r7-refresh',
          tenant_id: 'r7-tenant',
          branch_id: 'r7-branch',
          device_id: 'r7-device',
        }),
      });
    });

    await page.route('**/api/v1/sales/r7-sale/request-fiscal/', async (route) => {
      expect(route.request().method()).toBe('POST');
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          fiscal_status: 'QUEUED',
          attempt: 1,
          document_id: 'r7-document',
        }),
      });
    });

    await page.route('**/api/v1/sales/r7-sale/fiscal-status/', async (route) => {
      expect(route.request().method()).toBe('GET');
      statusPolls += 1;
      const concluded = statusPolls >= 2;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          fiscal_status: concluded ? 'CONCLUDED' : 'PROCESSING',
          provider_document_id: 'plugnotas-r7-001',
          protocol: concluded ? 'r7-protocol-001' : null,
        }),
      });
    });

    await page.goto('/login');
    await page.getByLabel('Chave de API (API Key)').fill(API_KEY);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.waitForURL(/\/dashboard/);

    const result = await page.evaluate(async () => {
      const auth = {
        Authorization: `Bearer ${localStorage.getItem('access_token')}`,
        'X-Tenant-ID': localStorage.getItem('tenant_id') || '',
      };
      const request = await fetch('/api/v1/sales/r7-sale/request-fiscal/', {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
      });
      const queued = await request.json();
      const processingResponse = await fetch('/api/v1/sales/r7-sale/fiscal-status/', { headers: auth });
      const processing = await processingResponse.json();
      const concludedResponse = await fetch('/api/v1/sales/r7-sale/fiscal-status/', { headers: auth });
      const concluded = await concludedResponse.json();
      return { queued, processing, concluded };
    });

    expect(result.queued.fiscal_status).toBe('QUEUED');
    expect(result.processing.fiscal_status).toBe('PROCESSING');
    expect(result.concluded.fiscal_status).toBe('CONCLUDED');
    expect(result.concluded.provider_document_id).toBe('plugnotas-r7-001');
    expect(result.concluded.protocol).toBe('r7-protocol-001');
    expect(statusPolls).toBe(2);
  });
});
