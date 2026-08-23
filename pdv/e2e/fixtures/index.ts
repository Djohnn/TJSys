import { test as base, expect, type Page } from '@playwright/test';
import { LoginPage } from '../pages/login.page';

export const MOCK_API_KEY = 'mock-pdv-api-key';
export const MOCK_TENANT_ID = 'mock-tenant-id';
export const MOCK_BRANCH_ID = 'mock-branch-id';
export const MOCK_STOCK_LOCATION_ID = 'mock-stock-location-id';
export const MOCK_SESSION_ID = 'mock-cash-session-id';

export const MOCK_PRODUCTS = {
  coffee: {
    id: 'product-coffee',
    name: 'Café em pó',
    sku: 'CAF-001',
    price: '19.90',
    base_unit: { id: 'unit-un', symbol: 'UN', precision: 0 },
  },
  kilo: {
    id: 'product-kilo',
    name: 'Café torrado (kg)',
    sku: 'CAF-KG',
    price: '39.90',
    base_unit: { id: 'unit-kg', symbol: 'KG', precision: 3 },
  },
  withoutPrice: {
    id: 'product-without-price',
    name: 'Produto sem preço',
    sku: 'SEM-PRECO',
    price: null,
    base_unit: { id: 'unit-un', symbol: 'UN', precision: 0 },
  },
};

const authResponse = {
  token: 'mock-access-token',
  refresh_token: 'mock-refresh-token',
  device_id: 'mock-device-id',
  tenant_id: MOCK_TENANT_ID,
  branch_id: MOCK_BRANCH_ID,
};

const openSessionResponse = {
  id: MOCK_SESSION_ID,
  branch: MOCK_BRANCH_ID,
  operator: 'Mock operador',
  status: 'open',
  opening_amount: '100.00',
  expected_amount: '100.00',
  sales_count: 0,
  total_sales: '0.00',
  opened_at: '2026-08-10T12:00:00Z',
  closed_at: null,
};

function json(route: Parameters<Parameters<Page['route']>[1]>[0], body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installMockElectron(page: Page) {
  await page.addInitScript(({ products }) => {
    const saleCalls: unknown[] = [];
    const api = {
      onSyncStateChange: () => () => {},
      onConnectivityChange: () => () => {},
      getConnectivityStatus: async () => ({ success: true, data: { isOnline: true, lastOnlineAt: null, lastOfflineAt: null, lastSyncAt: null } }),
      checkConnectivity: async () => ({ success: true, data: { isOnline: true } }),
      getSyncStatus: async () => ({ success: true, data: { status: 'idle', pendingCount: 0, lastSyncAt: null, error: null } }),
      startSync: async () => ({ success: true, data: { status: 'idle', pendingCount: 0, lastSyncAt: null, error: null } }),
      syncAuthTokens: async () => ({ success: true, data: undefined }),
      logout: async () => ({ success: true, data: undefined }),
      createSale: async (data: any) => {
        saleCalls.push(data);
        const total = data.items.reduce((sum: number, item: any) => {
          const product = products.find((candidate: any) => candidate.id === item.product);
          return sum + Number(product?.price ?? 0) * Number(item.quantity);
        }, 0);
        return {
          success: true,
          data: {
            id: 'mock-sale-id',
            branch: 'mock-branch-id',
            cash_session: 'mock-cash-session-id',
            status: 'confirmed',
            gross_total: total.toFixed(2),
            discount_total: '0.00',
            net_total: total.toFixed(2),
            created_at: '2026-08-10T12:01:00Z',
            items: data.items,
            payments: data.payments,
          },
        };
      },
      printBalcaoReceipt: async () => ({ success: true, data: undefined }),
      printFiscalReceipt: async () => ({ success: true, data: undefined }),
      printReceipt: async () => ({ success: true, data: undefined }),
    };
    (window as any).electronAPI = api;
    (window as any).__e2eSaleCalls = saleCalls;
  }, { products: Object.values(MOCK_PRODUCTS) });
}

export async function mockPdvApi(page: Page) {
  await installMockElectron(page);
  let cashOpen = false;

  await page.route('**/api/v1/devices/validate/**', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    if (body.api_key === 'invalid-key') {
      return json(route, { detail: 'API key inválida' }, 401);
    }
    return json(route, authResponse);
  });
  await page.route('**/api/v1/devices/refresh/**', (route) => json(route, authResponse));
  await page.route('**/api/v1/stock-locations/**', (route) => json(route, [{ id: MOCK_STOCK_LOCATION_ID, name: 'Estoque principal', is_primary: true }]));
  await page.route('**/api/v1/cash-sessions/current/**', (route) => cashOpen
    ? json(route, openSessionResponse)
    : json(route, { detail: 'Nenhum caixa aberto' }, 404));
  await page.route('**/api/v1/cash-sessions/open/**', async (route) => {
    cashOpen = true;
    return json(route, openSessionResponse, 201);
  });
  await page.route(`**/api/v1/cash-sessions/${MOCK_SESSION_ID}/close/**`, async (route) => {
    cashOpen = false;
    return json(route, { ...openSessionResponse, status: 'closed', closing_amount: '100.00', closed_at: '2026-08-10T12:02:00Z' });
  });
  await page.route('**/api/v1/products/**', async (route) => {
    const url = new URL(route.request().url());
    const query = (url.searchParams.get('search') || '').toLocaleLowerCase();
    const products = Object.values(MOCK_PRODUCTS).filter((product) =>
      !query || product.name.toLocaleLowerCase().includes(query) || product.sku.toLocaleLowerCase().includes(query));
    return json(route, { count: products.length, next: null, previous: null, results: products });
  });
  await page.route('**/api/v1/fiscal/config/**', (route) => json(route, { has_fiscal_config: false }));
  await page.route('**/api/v1/sales/**', (route) => json(route, { count: 0, next: null, previous: null, results: [] }));
}

type Fixtures = {
  loginPage: LoginPage;
  authedPage: Page;
};

export const test = base.extend<Fixtures>({
  loginPage: async ({ page }, use) => {
    await mockPdvApi(page);
    await use(new LoginPage(page));
  },
  authedPage: async ({ page }, use) => {
    await mockPdvApi(page);
    await page.goto('/login');
    await page.getByLabel('Chave de API (API Key)').fill(MOCK_API_KEY);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await use(page);
  },
});

export { expect };
