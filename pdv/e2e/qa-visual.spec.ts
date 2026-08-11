import { test, expect } from '@playwright/test';

const API_KEY = 'e2e-test-key-2026';

test.describe('QA Visual @live - Sprint 7', () => {
  test.skip(process.env.E2E_LIVE_PDV !== '1', 'Fluxo live exige E2E_LIVE_PDV=1 e backend dedicado.');
  test.setTimeout(180000);
  test.use({ baseURL: 'http://localhost:5173' });

  test('cadastro de 3 produtos + venda no PDV + status fiscal', async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).electronAPI = {
        onSyncStateChange: () => () => {},
        getSyncState: () => Promise.resolve({ status: 'idle', pendingCount: 0, lastSyncAt: null, error: null }),
        syncNow: () => Promise.resolve(),
        getConnectivityState: () => Promise.resolve({ isOnline: true, lastOnlineAt: null, lastOfflineAt: null, lastSyncAt: null }),
        onConnectivityChange: () => () => {},
      };
    });

    // LOGIN
    await page.goto('/login');
    await expect(page.getByLabel('Chave de API (API Key)')).toBeVisible({ timeout: 5000 });
    await page.getByLabel('Chave de API (API Key)').fill(API_KEY);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 10000 });

    const token = await page.evaluate(() => localStorage.getItem('access_token')) as string;
    const tenantId = await page.evaluate(() => localStorage.getItem('tenant_id')) as string;
    const branchId = await page.evaluate(() => localStorage.getItem('branch_id')) as string;
    const auth = () => ({ Authorization: `Bearer ${token}`, 'X-Tenant-ID': tenantId });

    // GET REFS
    const locResp = await page.request.get('http://localhost:8000/api/v1/stock-locations/', { headers: auth() });
    const locData = await locResp.json();
    const stockLocationId = (locData[0]?.id || locData.results?.[0]?.id) as string;

    const refsResp = await page.request.get('http://localhost:8000/api/v1/units/', { headers: auth() });
    const refs = await refsResp.json();
    const unitId = (refs.results?.[0] || refs[0])?.id as string;
    const catResp = await page.request.get('http://localhost:8000/api/v1/categories/', { headers: auth() });
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
      const searchResp = await page.request.get(`http://localhost:8000/api/v1/products/?search=${encodeURIComponent(p.name)}`, { headers: auth() });
      const searchData = await searchResp.json();
      let prod = (searchData.results || searchData)[0];

      if (!prod) {
        const prodResp = await page.request.post('http://localhost:8000/api/v1/products/', {
          data: { sku: p.sku, name: p.name, base_unit: unitId, category: catId, ncm: p.ncm, is_active: true },
          headers: { ...auth(), 'Content-Type': 'application/json' },
        });
        if (prodResp.status() >= 400) {
          console.log(`Product create error: ${JSON.stringify(await prodResp.json())}`);
          expect(prodResp.status()).toBe(201);
        }
        prod = await prodResp.json();
      }

      // Ensure price exists
      const priceResp = await page.request.post(`http://localhost:8000/api/v1/products/${prod.id}/prices/`, {
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
      await page.request.post('http://localhost:8000/api/v1/stock-operations/receipt/', {
        data: { branch: branchId, location: stockLocationId, product: prod.id, unit: unitId, quantity: '100', factor: '1', unit_cost: '10.00' },
        headers: { ...auth(), 'Idempotency-Key': `qa-visual-${prod.id}` },
      });
    }

    console.log(`✓ 3 produtos criados: ${created.map(c => c.name).join(', ')}`);

    // OPEN CASH SESSION
    await page.goto('/cash-session');
    await page.waitForURL(/\/cash-session/, { timeout: 5000 });
    const openBtn = page.getByRole('button', { name: 'Abrir Caixa' });
    if (await openBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await page.locator('#openingAmount').fill('100');
      await openBtn.click();
      await page.waitForURL(/\/dashboard/, { timeout: 5000 });
    }

    // SALE
    await page.goto('/sale');
    await page.waitForURL(/\/sale/, { timeout: 5000 });
    const searchInput = page.getByPlaceholder('Buscar produto (SKU ou nome)...');

    for (const c of created) {
      await searchInput.fill(c.name);
      await page.waitForTimeout(1200);
      const option = page.getByText(c.name).first();
      await option.waitFor({ state: 'visible', timeout: 10000 });
      await option.click();
      await page.waitForTimeout(500);
    }

    // PAYMENT — number input, use dot decimal
    const total = created.reduce((s, c) => s + c.price, 0);
    const paymentInput = page.locator('input[placeholder="0,00"]').first();
    await paymentInput.fill(total.toFixed(2));
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Adicionar Pagamento' }).click();
    await page.waitForTimeout(500);

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

    // RECEIPT visible
    const receiptModal = page.getByText('Cupom Não Fiscal');
    await receiptModal.waitFor({ state: 'visible', timeout: 15000 });
    await expect(receiptModal).toBeVisible();
    await page.screenshot({ path: 'qa-receipt.png', fullPage: true });
    console.log('✓ Cupom visível');

    // Fechar recibo
    const fechar = page.getByRole('button', { name: 'Fechar' }).first();
    if (await fechar.isVisible({ timeout: 2000 }).catch(() => false)) {
      await fechar.click();
    }

    // FISCAL STATUS
    await page.waitForTimeout(2000);
    const fiscalUrl = `http://localhost:8000/api/v1/sales/${saleData.id}/fiscal-status/`;
    console.log(`Fiscal URL: ${fiscalUrl}`);
    const fiscalResp = await page.request.get(fiscalUrl, { headers: auth() });
    console.log(`Fiscal status response: ${fiscalResp.status()}`);
    const fiscalText = await fiscalResp.text();
    console.log(`Fiscal body (first 200): ${fiscalText.substring(0, 200)}`);
    expect(fiscalResp.status()).toBe(200);
    const fiscalData = JSON.parse(fiscalText);
    console.log(`Fiscal: ${JSON.stringify(fiscalData, null, 2)}`);
    expect(fiscalData).toHaveProperty('fiscal_status');

    // Final screenshot
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/, { timeout: 5000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'qa-dashboard-final.png', fullPage: true });
    console.log('✓ QA Visual test completo!');
  });
});
