import { test, expect, Page } from '@playwright/test';

const liveApiKey = process.env.E2E_LIVE_API_KEY;

test.describe('Sale flow @live (real backend)', () => {
  test.skip(process.env.E2E_LIVE_PDV !== '1', 'Fluxo live exige E2E_LIVE_PDV=1 e API key do ambiente dedicado.');
  test.beforeEach(() => {
    if (!liveApiKey) {
      throw new Error('Defina E2E_LIVE_API_KEY para executar o fluxo live do PDV.');
    }
  });
  test.setTimeout(90000);
  test.use({ baseURL: 'http://localhost:5173' });

  test('full sale flow: login, open cash, add stock, create sale', async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).electronAPI = {
        onSyncStateChange: () => () => {},
        getSyncState: () => Promise.resolve({ status: 'idle', pendingCount: 0, lastSyncAt: null, error: null }),
        syncNow: () => Promise.resolve(),
        getConnectivityState: () => Promise.resolve({ isOnline: true, lastOnlineAt: null, lastOfflineAt: null, lastSyncAt: null }),
        onConnectivityChange: () => () => {},
      };
    });

    // Login
    await page.goto('/login');
    await expect(page.getByLabel('Chave de API (API Key)')).toBeVisible({ timeout: 5000 });
    await page.getByLabel('Chave de API (API Key)').fill(liveApiKey!);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 10000 });

    // Fetch stock location and product IDs from real API
    const headers = (tok: string, tid: string) => ({ Authorization: `Bearer ${tok}`, 'X-Tenant-ID': tid });

    const token = await page.evaluate(() => localStorage.getItem('access_token')) as string;
    const tenantId = await page.evaluate(() => localStorage.getItem('tenant_id')) as string;

    const locResp = await page.request.get('http://localhost:8000/api/v1/stock-locations/', {
      headers: headers(token, tenantId),
    });
    const locData = await locResp.json();
    const stockLocationId = (locData[0]?.id || locData.results?.[0]?.id) as string;
    await page.evaluate((id: string) => localStorage.setItem('stock_location_id', id), stockLocationId);

    // Find product
    const prodResp = await page.request.get('http://localhost:8000/api/v1/products/?search=E2E', {
      headers: headers(token, tenantId),
    });
    const prodData = await prodResp.json();
    const prod = prodData.results?.[0] || prodData[0];
    const productId = prod?.id as string;
    const unitId = (typeof prod?.base_unit === 'object' ? prod?.base_unit?.id : prod?.base_unit) as string;

    // Add stock via receipt API
    const branchId = await page.evaluate(() => localStorage.getItem('branch_id'));
    const receiptPayload = {
      branch: branchId, location: stockLocationId, product: productId,
      unit: unitId, quantity: '100', factor: '1', unit_cost: '30.00',
    };
    await page.request.post('http://localhost:8000/api/v1/stock-operations/receipt/', {
      data: receiptPayload,
      headers: { ...headers(token, tenantId), 'Idempotency-Key': crypto.randomUUID() },
    });

    // Open cash session
    await page.goto('/cash-session');
    await page.waitForURL(/\/cash-session/, { timeout: 5000 });

    const openBtn = page.getByRole('button', { name: 'Abrir Caixa' });
    if (await openBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await page.locator('#openingAmount').fill('100');
      await openBtn.click();
      await page.waitForURL(/\/dashboard/, { timeout: 5000 });
      await page.goto('/sale');
    } else {
      await page.goto('/sale');
    }
    await page.waitForURL(/\/sale/, { timeout: 5000 });

    // Search product by name (backend only searches by name, not SKU)
    const searchInput = page.getByPlaceholder('Buscar produto (SKU ou nome)...');
    await searchInput.fill('Produto E2E');

    const productOption = page.getByText('Produto E2E').first();
    await productOption.waitFor({ state: 'visible', timeout: 10000 });
    await productOption.click();

    // Set payment amount to match exactly 1x R$ 49.90
    const paymentInput = page.locator('input[placeholder="0,00"]').first();
    await paymentInput.fill('49.90');
    await page.getByRole('button', { name: 'Adicionar Pagamento' }).click();

    // Confirm sale - intercept the API response
    const responsePromise = page.waitForResponse(
      resp => resp.url().includes('/api/v1/sales/counter/') && resp.request().method() === 'POST',
      { timeout: 25000 }
    );
    await page.getByRole('button', { name: 'Confirmar Venda' }).click();
    const apiResponse = await responsePromise;

    // Check API response
    const apiStatus = apiResponse.status();
    if (apiStatus >= 400) {
      const apiBody = await apiResponse.json();
      throw new Error(`Sale API returned ${apiStatus}: ${apiBody.detail || JSON.stringify(apiBody)}`);
    }

    // Wait for receipt modal to appear
    const receiptModal = page.getByText('Cupom Não Fiscal');
    await receiptModal.waitFor({ state: 'visible', timeout: 15000 });
    await expect(receiptModal).toBeVisible();
  });
});
