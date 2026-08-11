// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('../services/operationJournal', () => ({
  operationJournal: {
    getAll: vi.fn(() => []),
    addOperation: vi.fn(),
  },
}));

import { OfflineSaleService } from '../services/offlineSaleService';

describe('OfflineSaleService', () => {
  it('Given contingencia valida, When enfileira venda offline, Then anexa identidade tenant-safe e proxima sequencia local', () => {
    const addOperation = vi.fn().mockReturnValue({
      id: 3,
      uuid: 'offline-sale-1',
      type: 'sale:create',
      payload: '{"local_sequence":3}',
      idempotency_key: 'idem-1',
      status: 'pending',
      created_at: '2026-08-11T12:00:00.000Z',
      synced_at: null,
      retry_count: 0,
      last_error: null,
      conflict_resolution: null,
    });

    const service = new OfflineSaleService({
      contingencyPolicy: {
        evaluateOfflineSale: () => ({
          allowed: true,
          anchor: {
            server_time: '2026-08-11T11:50:00.000Z',
            client_wall_time: '2026-08-11T11:50:02.000Z',
            last_online_at: '2026-08-11T11:50:00.000Z',
            monotonic_ms: 9_000,
            session_id: 'session-a',
          },
          totalAmount: '10.00',
          changeAmount: '2.00',
        }),
      },
      auth: {
        getDeviceId: () => 'device-1',
        getBranchId: () => 'branch-1',
      },
      getTenantId: () => 'tenant-1',
      operationJournal: {
        getAll: () => [{ id: 1 }, { id: 2 }],
        addOperation,
      },
      randomUUID: () => 'offline-sale-1',
      nowIso: () => '2026-08-11T12:00:00.000Z',
    });

    const result = service.queueSale({
      branch: 'branch-1',
      stock_location: 'stock-1',
      cash_session_id: 'cash-1',
      operator_id: 'operator-1',
      items: [{ product: 'product-1', unit: 'unit-1', quantity: '1', factor: '1', discount_amount: '0.00' }],
      payments: [{ method: 'cash', amount: '12.00' }],
    });

    expect(addOperation).toHaveBeenCalledWith(expect.objectContaining({
      uuid: 'offline-sale-1',
      type: 'sale:create',
      idempotencyKey: 'offline-sale-1',
      payload: expect.objectContaining({
        device_id: 'device-1',
        tenant_id: 'tenant-1',
        branch_id: 'branch-1',
        cash_session_id: 'cash-1',
        operator_id: 'operator-1',
        local_sequence: 3,
        total_amount: '10.00',
        change_amount: '2.00',
      }),
    }));
    expect(result.entry.uuid).toBe('offline-sale-1');
    expect(result.payload.local_sequence).toBe(3);
  });

  it('Given politica bloqueia contingencia, When tenta enfileirar venda offline, Then lanca erro explicito', () => {
    const service = new OfflineSaleService({
      contingencyPolicy: {
        evaluateOfflineSale: () => ({
          allowed: false,
          code: 'missing_anchor',
          reason: 'Missing backend anchor',
        }),
      },
      auth: {
        getDeviceId: () => 'device-1',
        getBranchId: () => 'branch-1',
      },
      getTenantId: () => 'tenant-1',
      operationJournal: {
        getAll: () => [],
        addOperation: vi.fn(),
      },
      randomUUID: () => 'offline-sale-1',
      nowIso: () => '2026-08-11T12:00:00.000Z',
    });

    expect(() => service.queueSale({
      branch: 'branch-1',
      stock_location: 'stock-1',
      cash_session_id: 'cash-1',
      operator_id: 'operator-1',
      items: [{ product: 'product-1', unit: 'unit-1', quantity: '1', factor: '1', discount_amount: '0.00' }],
      payments: [{ method: 'cash', amount: '12.00' }],
    })).toThrow('Missing backend anchor');
  });
});
