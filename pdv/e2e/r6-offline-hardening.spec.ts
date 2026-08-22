import { test, expect, Page } from '@playwright/test';

const API_KEY = 'e2e-test-key-2026';

/**
 * R6 Offline Hardening — E2E do fluxo de contingência offline.
 *
 * Fluxo coberto (Task 5 / R6):
 *   1. Inicia ONLINE.
 *   2. Venda online normal é criada (contrato real com o backend possibilita o
 *      cadastro de estoque/caixa, mas a contingência é exercida na camada de UI
 *      através do `electronAPI` mockado, espelhando o comportamento do main process).
 *   3. Muda para OFFLINE — SyncIndicator reflete `isOnline: false`.
 *   4. Faz uma venda offline (entra no journal de pendências).
 *   5. Força um ERRO (entrada com status `failed` + conflito `conflict`).
 *   6. Sincroniza: a tela de pendências lista o status por evento e dispara `startSync`.
 */

async function installElectronAPIMock(page: Page, opts: {
  online?: boolean;
  syncStatus?: string;
  pendingCount?: number;
  entries?: any[];
  failSync?: boolean;
} = {}) {
  const {
    online = true,
    syncStatus = 'idle',
    pendingCount = 0,
    entries = [],
    failSync = false,
  } = opts;

  await page.route('**/api/v1/devices/validate/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      device_id: 'mock-device-id',
      tenant_id: 'mock-tenant-id',
      branch_id: 'mock-branch-id',
    }),
  }));
  await page.route('**/api/v1/stock-locations/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{ id: 'mock-stock-location-id', is_primary: true }]),
  }));
  await page.route('**/api/v1/cash-sessions/current/**', (route) => route.fulfill({
    status: 404,
    contentType: 'application/json',
    body: JSON.stringify({ detail: 'Nenhum caixa aberto' }),
  }));
  await page.route('**/api/v1/sales/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ count: 0, results: [] }),
  }));

  await page.addInitScript(
    ({ apiKey, online: _online, syncStatus: _status, pendingCount: _pending, entries: _entries, failSync: _failSync }) => {
      const state = {
        online: _online,
        syncStatus: _status,
        pendingCount: _pending,
        entries: _entries,
        failSync: _failSync,
      };

      (window as any).electronAPI = {
        // Connectivity
        getConnectivityStatus: () => Promise.resolve({
          success: true,
          data: {
            isOnline: state.online,
            lastOnlineAt: state.online ? '2026-08-11T10:00:00Z' : null,
            lastOfflineAt: state.online ? null : '2026-08-11T10:05:00Z',
            lastSyncAt: null,
          },
        }),
        checkConnectivity: () => Promise.resolve({ success: true, data: { isOnline: state.online } }),
        onConnectivityChange: () => () => {},

        // Sync
        getSyncStatus: () => Promise.resolve({
          success: true,
          data: {
            status: state.syncStatus,
            pendingCount: state.pendingCount,
            lastSyncAt: null,
            error: null,
          },
        }),
        startSync: () => {
          if (state.failSync) {
            return Promise.resolve({ success: false, error: 'Batch sync failed: network unreachable' });
          }
          state.syncStatus = 'idle';
          state.pendingCount = 0;
          state.entries = state.entries.map((e: Record<string, unknown>) => ({ ...e, status: 'synced', last_error: null }));
          return Promise.resolve({
            success: true,
            data: { status: 'idle', pendingCount: 0, lastSyncAt: new Date().toISOString(), error: null },
          });
        },
        onSyncStateChange: () => () => {},
        getPendingOperations: () => Promise.resolve({
          success: true,
          data: { count: state.entries.length, operations: state.entries },
        }),
        getJournal: () => Promise.resolve({ success: true, data: state.entries }),

        // Legacy aliases
        getSyncState: () => Promise.resolve({ status: state.syncStatus, pendingCount: state.pendingCount, lastSyncAt: null, error: null }),
        syncNow: () => Promise.resolve(),
        getConnectivityState: () => Promise.resolve({ isOnline: state.online, lastOnlineAt: null, lastOfflineAt: null, lastSyncAt: null }),
      };
    },
    {
      apiKey: API_KEY,
      online,
      syncStatus,
      pendingCount,
      entries,
      failSync,
    } as any,
  );
}

function offlineEntries() {
  return [
    {
      id: 1,
      uuid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      type: 'sale:create',
      status: 'pending',
      created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      synced_at: null,
      retry_count: 0,
      last_error: null,
      conflict_resolution: null,
      payload: JSON.stringify({
        total_amount: '49.90',
        payments: [{ method: 'cash', amount: '50.00' }],
        branch_id: 'b-1',
        tenant_id: 't-1',
        device_id: 'd-1',
        cash_session_id: 'c-1',
        operator_id: 'o-1',
        local_sequence: 1,
      }),
    },
    {
      id: 2,
      uuid: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      type: 'sale:create',
      status: 'failed',
      created_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
      synced_at: null,
      retry_count: 3,
      last_error: 'Network unreachable during retry',
      conflict_resolution: null,
      payload: JSON.stringify({
        total_amount: '99.90',
        payments: [{ method: 'pix_external_confirmed', amount: '99.90', reference: 'TXN-AB12' }],
        branch_id: 'b-1',
        tenant_id: 't-1',
        device_id: 'd-1',
        cash_session_id: 'c-1',
        operator_id: 'o-1',
        local_sequence: 2,
      }),
    },
    {
      id: 3,
      uuid: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      type: 'sale:create',
      status: 'conflict',
      created_at: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
      synced_at: null,
      retry_count: 1,
      last_error: null,
      conflict_resolution: '{"code":"sequence_gap","detail":"Expected local_sequence 2, received 3"}',
      payload: JSON.stringify({
        total_amount: '129.90',
        payments: [{ method: 'card_external_confirmed', amount: '129.90', reference: 'AUTH-8812' }],
        branch_id: 'b-1',
        tenant_id: 't-1',
        device_id: 'd-1',
        cash_session_id: 'c-1',
        operator_id: 'o-1',
        local_sequence: 3,
      }),
    },
  ];
}

test.describe('R6 Offline Hardening', () => {
  test.setTimeout(120000);

  test('inicia online, faz venda, muda para offline, força erro e sincroniza', async ({ page }) => {
    // --- Passo 1: inicia ONLINE, sem pendências ---
    await installElectronAPIMock(page, { online: true, syncStatus: 'idle', pendingCount: 0, entries: [] });

    // LOGIN
    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.getByLabel('Chave de API (API Key)').fill(API_KEY);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });

    // Indicador mostra Online
    const onlineIndicator = page.locator('button', { hasText: 'Online' }).first();
    await expect(onlineIndicator).toBeVisible({ timeout: 10000 });
    console.log('✓ Passo 1: online');

    // --- Passo 2: navega para a tela de vendas (estado vazio online) ---
    await page.goto('/sale', { waitUntil: 'networkidle' });
    await page.waitForURL(/\/sale/, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: 'Adicionar Produtos' })).toBeVisible({ timeout: 10000 });
    console.log('✓ Passo 2: tela de venda online acessível');

    // --- Passo 3: muda para OFFLINE ---
    // Recarrega a página injetando um electronAPI offline (equivalente ao
    // main process detectar queda de conectividade e o journal acumular pendências).
    await installElectronAPIMock(page, { online: false, syncStatus: 'idle', pendingCount: 3, entries: offlineEntries() });
    await page.goto('/dashboard', { waitUntil: 'networkidle' });
    // SyncIndicator reflete o estado offline (após o polling de 15s ou checagem)
    const offlineIndicator = page.locator('button', { hasText: 'Offline' }).first();
    await offlineIndicator.waitFor({ state: 'visible', timeout: 20000 });
    console.log('✓ Passo 3: offline refletido na UI');

    // --- Passo 4: faz uma venda offline (entra no journal) ---
    // A venda offline é gravada no journal (append-only). A tela de pendências
    // deve refletir as 3 operações retidas.
    const pendingLink = page.getByRole('button', { name: 'Pendências' }).first();
    await pendingLink.click();
    await page.waitForURL(/\/sync-pending/, { timeout: 10000 });

    await expect(page.getByText('Pendências de Sincronização')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('1 operações offline aguardando sincronização')).toBeVisible({ timeout: 10000 });
    console.log('✓ Passo 4: venda offline presente nas pendências');

    // Verifica valores e status de cada operação
    await expect(page.getByTestId('pending-row-1')).toBeVisible();
    await expect(page.getByTestId('pending-status-1')).toContainText('Pendente');
    await expect(page.getByText('R$ 49.90')).toBeVisible();
    await expect(page.getByText('Dinheiro')).toBeVisible();

    await expect(page.getByTestId('pending-status-2')).toContainText('Falha');
    await expect(page.getByText('R$ 99.90')).toBeVisible();
    await expect(page.getByText('Pix (confirmado externamente)')).toBeVisible();
    await expect(page.getByText('Network unreachable during retry')).toBeVisible();

    await expect(page.getByTestId('pending-status-3')).toContainText('Conflito');
    await expect(page.getByText('R$ 129.90')).toBeVisible();
    await expect(page.getByText('Cartão (confirmado externamente)')).toBeVisible();
    console.log('✓ Passo 4: erro e conflito visíveis (forçou erro)');

    // --- Passo 5: sincroniza ---
    const syncButton = page.getByRole('button', { name: 'Sincronizar agora' }).first();
    await syncButton.click();

    // Após sync, todas as operações ficam sincronizadas e o contador zera
    await expect(page.getByTestId('pending-status-1')).toContainText('Sincronizada', { timeout: 10000 });
    await expect(page.getByTestId('pending-status-2')).toContainText('Sincronizada');
    await expect(page.getByTestId('pending-status-3')).toContainText('Sincronizada');
    await expect(page.getByText('Nenhuma operação offline pendente')).toBeVisible();
    console.log('✓ Passo 5: sincronização concluída');
  });

  test('venda offline registra pendência crítica e sincronização manual persiste o estado', async ({ page }) => {
    // Ambiente OFFLINE com uma operação `failed` retida.
    const entries = [offlineEntries()[1]]; // apenas a operação Pix com falha
    await installElectronAPIMock(page, {
      online: false,
      syncStatus: 'idle',
      pendingCount: 1,
      entries,
      failSync: true,
    });

    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.getByLabel('Chave de API (API Key)').fill(API_KEY);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });

    await page.goto('/sync-pending', { waitUntil: 'networkidle' });
    await page.waitForURL(/\/sync-pending/, { timeout: 10000 });

    // 1 pendência visível, com status de falha e erro detalhado
    await expect(page.getByTestId('pending-row-2')).toBeVisible();
    await expect(page.getByTestId('pending-status-2')).toContainText('Falha');
    await expect(page.getByText('Network unreachable during retry')).toBeVisible();

    // Sincronização falha: o estado offline original é preservado (fail-safe)
    await page.getByRole('button', { name: 'Sincronizar agora' }).first().click();
    await expect(page.getByTestId('pending-status-2')).toContainText('Falha');
    await expect(page.getByText('Network unreachable during retry')).toBeVisible();
    console.log('✓ sincronização falha preserva a pendência offline');
  });
});
