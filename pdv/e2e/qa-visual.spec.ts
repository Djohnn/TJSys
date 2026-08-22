import { test, expect } from '@playwright/test';
import { apiUrl } from './config';

const liveApiKey = process.env.E2E_LIVE_API_KEY;

test.describe('QA Visual @live - Sprint 7', () => {
  test.skip(process.env.E2E_LIVE_PDV !== '1', 'Fluxo live exige E2E_LIVE_PDV=1 e backend dedicado.');
  test.beforeEach(() => {
    if (!liveApiKey) {
      throw new Error('Defina E2E_LIVE_API_KEY para executar o fluxo live do PDV.');
    }
  });
  test.setTimeout(180000);

  test('cadastro de 3 produtos + venda no PDV + status fiscal', async ({ page }) => {
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
        // Legacy aliases kept for safety
        getSyncState: () => Promise.resolve({ status: 'idle', pendingCount: 0, lastSyncAt: null, error: null }),
        syncNow: () => Promise.resolve(),
        getConnectivityState: () => Promise.resolve({ isOnline: true, lastOnlineAt: null, lastOfflineAt: null, lastSyncAt: null }),
      };
    });

    // LOGIN
    await page.goto('/login', { waitUntil: 'networkidle' });
    await expect(page.getByLabel('Chave de API (API Key)')).toBeVisible({ timeout: 5000 });
    await page.getByLabel('Chave de API (API Key)').fill(liveApiKey!);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });

    const token = await page.evaluate(() => localStorage.getItem('access_token')) as string;
    const tenantId = await page.evaluate(() => localStorage.getItem('tenant_id')) as string;
    const branchId = await page.evaluate(() => localStorage.getItem('branch_id')) as string;
    const auth = () => ({
      Authorization: `Bearer ${token}`,
      'X-Tenant-ID': tenantId,
      'Accept': 'application/json',
    });

    // GET REFS
    const locResp = await page.request.get(apiUrl('/stock-locations/'), { headers: auth() });
    const locData = await locResp.json();
    const stockLocationId = (locData[0]?.id || locData.results?.[0]?.id) as string;

    const refsResp = await page.request.get(apiUrl('/units/'), { headers: auth() });
    const refs = await refsResp.json();
    const unitId = (refs.results?.[0] || refs[0])?.id as string;
    const catResp = await page.request.get(apiUrl('/categories/'), { headers: auth() });
    const cats = await catResp.json();
    const catId = (cats.results?.[0] || cats[0])?.id as string;

    // CREATE 3 NEW PRODUCTS (avoid seed product to prevent conflicts)
    const products = [
      { sku: 'VISUAL-A', name: 'Visual Produto A', price: 15.00, ncm: '84713000' },
      { sku: 'VISUAL-B', name: 'Visual Produto B', price: 25.00, ncm: '84713000' },
      { sku: 'VISUAL-C', name: 'Visual Produto C', price: 35.00, ncm: '84714900' },
    ];

    // Store stock_location_id in localStorage (required by sale endpoint)
    await page.evaluate((id: string) => localStorage.setItem('stock_location_id', id), stockLocationId);

    const created: Array<{ name: string; id: string; price: number }> = [];
    for (const p of products) {
      // Buscar ou criar produto
      const searchResp = await page.request.get(apiUrl(`/products/?search=${encodeURIComponent(p.name)}`), { headers: auth() });
      const searchData = await searchResp.json();
      let prod = (searchData.results || searchData)[0];

      if (!prod) {
        const prodResp = await page.request.post(apiUrl('/products/'), {
          data: {
            sku: p.sku, name: p.name, base_unit: unitId, category: catId,
            ncm: p.ncm, subcategory: '', is_active: true,
          },
          headers: { ...auth(), 'Content-Type': 'application/json' },
        });
        if (prodResp.status() >= 400) {
          const errText = await prodResp.text();
          console.log(`Product create error (${prodResp.status()}): ${errText.substring(0, 300)}`);
          expect(prodResp.status()).toBe(201);
        }
        prod = await prodResp.json();
      }

      // Existing QA fixtures may predate the NCM field; normalize them too.
      const ncmResponse = await page.request.patch(apiUrl(`/products/${prod.id}/`), {
        data: { ncm: p.ncm },
        headers: { ...auth(), 'Content-Type': 'application/json' },
      });
      expect(ncmResponse.status()).toBe(200);

      // Ensure price exists
      const priceResp = await page.request.post(apiUrl(`/products/${prod.id}/prices/`), {
        data: { product: prod.id, amount: String(p.price), valid_from: '2026-01-01T00:00:00Z', is_active: true },
        headers: { ...auth(), 'Content-Type': 'application/json' },
      });
      if (priceResp.status() >= 400) {
        const body = await priceResp.json();
        // 400 is ok if already exists (unique constraint)
        if (!body?.non_field_errors?.some?.((e: string) => e.includes('já existe'))) {
          console.log(`Price error: ${JSON.stringify(body)}`);
        }
      }

      created.push({ name: p.name, id: prod.id, price: p.price });

      // Add stock (idempotent key ensures no duplicates)
      await page.request.post(apiUrl('/stock-operations/receipt/'), {
        data: { branch: branchId, location: stockLocationId, product: prod.id, unit: unitId, quantity: '100', factor: '1', unit_cost: '10.00' },
        headers: { ...auth(), 'Idempotency-Key': `qa-visual-${prod.id}` },
      });
    }

    console.log(`✓ 3 produtos criados: ${created.map(c => c.name).join(', ')}`);

    // OPEN CASH SESSION
    await page.goto('/cash-session', { waitUntil: 'networkidle' });
    await page.waitForURL(/\/cash-session/, { timeout: 10000 });
    const openBtn = page.getByRole('button', { name: 'Abrir Caixa' });
    if (await openBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await page.locator('#openingAmount').fill('100');
      await openBtn.click();
      await page.waitForURL(/\/dashboard/, { timeout: 10000 });
    }

    // SALE
    await page.goto('/sale', { waitUntil: 'networkidle' });
    await page.waitForURL(/\/sale/, { timeout: 10000 });
    const searchInput = page.getByPlaceholder('Buscar produto (SKU ou nome)...');

    for (const c of created) {
      const productSearchResponse = page.waitForResponse(
        response => response.url().includes('/api/v1/products/')
          && response.url().includes(`search=${encodeURIComponent(c.name)}`)
          && response.request().method() === 'GET',
        { timeout: 10000 },
      );
      await searchInput.fill(c.name);
      await productSearchResponse;
      const option = page.getByText(c.name).first();
      await expect(option).toBeVisible({ timeout: 10000 });
      await option.click();
    }

    // PAYMENT — number input, use dot decimal
    const total = created.reduce((s, c) => s + c.price, 0);
    const paymentInput = page.locator('input[placeholder="0,00"]').first();
    await paymentInput.fill(total.toFixed(2));
    const addPaymentButton = page.getByRole('button', { name: 'Adicionar Pagamento' });
    await expect(addPaymentButton).toBeEnabled();
    await addPaymentButton.click();
    await expect(page.getByText(`R$ ${total.toFixed(2)}`).first()).toBeVisible();

    // CONFIRM
    const responsePromise = page.waitForResponse(
      resp => resp.url().includes('/api/v1/sales/counter/') && resp.request().method() === 'POST',
      { timeout: 25000 },
    );
    await page.getByRole('button', { name: 'Confirmar Venda' }).click();
    const apiResp = await responsePromise;

    if (apiResp.status() >= 400) {
      const body = await apiResp.json();
      console.log(`Sale API error: ${JSON.stringify(body)}`);
    }
    expect(apiResp.status()).toBe(201);
    const saleData = await apiResp.json();
    console.log(`✓ Venda criada: ${saleData.id} - R$ ${total.toFixed(2)}`);

    // RECEIPT visible (SaleConfirmationToast replaces old "Cupom Não Fiscal" modal)
    const receiptToast = page.getByText(/realizada com sucesso/);
    await receiptToast.waitFor({ state: 'visible', timeout: 20000 });
    await page.screenshot({ path: 'qa-receipt.png', fullPage: true });
    console.log('✓ Cupom visível');

    // Solicitar explicitamente a NFC-e antes de fechar o recibo.
    const fiscalRequestPromise = page.waitForResponse(
      resp => resp.url().includes('/request-fiscal/') && resp.request().method() === 'POST',
      { timeout: 25000 },
    );
    await expect(page.getByRole('button', { name: 'Imprimir Cupom Fiscal' })).toBeEnabled();
    await page.getByRole('button', { name: 'Imprimir Cupom Fiscal' }).click();
    const fiscalRequest = await fiscalRequestPromise;
    expect(fiscalRequest.status()).toBe(201);

    // Fechar recibo não cancela a solicitação fiscal já feita.
    const fechar = page.getByRole('button', { name: 'Fechar' }).first();
    if (await fechar.isVisible({ timeout: 3000 }).catch(() => false)) {
      await fechar.click();
    }

    // FISCAL STATUS — poll until the explicitly requested NFC-e is concluded.
    const fiscalUrl = apiUrl(`/sales/${saleData.id}/fiscal-status/`);
    console.log(`Fiscal URL: ${fiscalUrl}`);
    await expect.poll(async () => {
      const response = await page.request.get(fiscalUrl, { headers: auth() });
      if (response.status() !== 200) return `HTTP_${response.status()}`;
      const data = await response.json();
      console.log(`Fiscal status response: ${data.fiscal_status}`);
      return data.fiscal_status;
    }, { timeout: 120000, intervals: [1000, 2000, 5000] }).toBe('CONCLUDED');

    const fiscalResp = await page.request.get(fiscalUrl, { headers: auth() });
    expect(fiscalResp.status()).toBe(200);
    const fiscalData = await fiscalResp.json();
    console.log(`Fiscal: ${JSON.stringify(fiscalData, null, 2)}`);
    expect(fiscalData.fiscal_status).toBe('CONCLUDED');

    // Final screenshot
    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 5000 });
    await expect(page.getByRole('heading').first()).toBeVisible();
    await page.screenshot({ path: 'qa-dashboard-final.png', fullPage: true });
    console.log('✓ QA Visual test completo!');
  });
});
