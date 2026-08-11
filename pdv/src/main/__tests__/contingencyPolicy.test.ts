// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(),
  },
}));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { app } from 'electron';
import { clear, setItem } from '../utils/storage';
import { ContingencyPolicy, type ContingencySaleInput } from '../services/contingencyPolicy';

function saleInput(overrides: Partial<ContingencySaleInput> = {}): ContingencySaleInput {
  return {
    branch: 'branch-1',
    stock_location: 'stock-1',
    cash_session_id: 'cash-1',
    operator_id: 'operator-1',
    items: [
      { product: 'product-1', unit: 'unit-1', quantity: '1', factor: '1', discount_amount: '0.00' },
    ],
    payments: [
      { method: 'cash', amount: '12.00' },
    ],
    ...overrides,
  };
}

describe('ContingencyPolicy', () => {
  let tempDir: string;
  let nowMs: number;
  let monotonicMs: number;
  let policy: ContingencyPolicy;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'contingency-policy-'));
    vi.mocked(app.getPath).mockReturnValue(tempDir);
    clear();
    setItem('tenant_id', 'tenant-1');

    nowMs = Date.parse('2026-08-11T12:00:00.000Z');
    monotonicMs = 9_000;

    policy = new ContingencyPolicy({
      sessionId: 'session-a',
      now: () => new Date(nowMs),
      monotonicNow: () => monotonicMs,
      auth: {
        isAuthenticated: () => true,
        getDeviceId: () => 'device-1',
        getBranchId: () => 'branch-1',
        getRefreshToken: () => 'refresh-1',
      },
      catalogCache: {
        getProductById: (id: string) => id === 'product-1'
          ? {
              id,
              sku: 'SKU-1',
              name: 'Produto 1',
              base_unit_id: 'unit-1',
              requires_lot: false,
              requires_expiry: false,
              is_active: true,
              updated_at: '2026-08-11T10:00:00.000Z',
            }
          : null,
        getPrice: (productId: string) => productId === 'product-1'
          ? {
              id: 'price-1',
              product_id: productId,
              amount: '10.00',
              valid_from: '2026-08-10T00:00:00.000Z',
              valid_to: null,
              updated_at: '2026-08-11T11:30:00.000Z',
            }
          : null,
      },
    });
  });

  afterEach(() => {
    clear();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('Given anchor valida e caixa previamente aberto, When conclui venda offline em dinheiro, Then permite contingencia com troco', () => {
    policy.recordOnlineHeartbeat('2026-08-11T11:50:00.000Z', {
      operator_id: 'operator-1',
    });
    nowMs = Date.parse('2026-08-11T12:10:00.000Z');
    monotonicMs = 10_200;

    const result = policy.evaluateOfflineSale(saleInput());

    expect(result.allowed).toBe(true);
    if (!result.allowed) throw new Error('expected sale to be allowed');
    expect(result.changeAmount).toBe('2.00');
    expect(result.totalAmount).toBe('10.00');
    expect(result.anchor.server_time).toBe('2026-08-11T11:50:00.000Z');
  });

  it('Given anchor ausente, When tenta concluir offline, Then bloqueia fail-closed', () => {
    const result = policy.evaluateOfflineSale(saleInput());

    expect(result).toMatchObject({
      allowed: false,
      code: 'missing_anchor',
    });
  });

  it('Given mais de duas horas sem ancora valida, When tenta concluir offline, Then bloqueia contingencia', () => {
    policy.recordOnlineHeartbeat('2026-08-11T09:30:00.000Z', {
      operator_id: 'operator-1',
    });
    nowMs = Date.parse('2026-08-11T12:01:00.000Z');
    monotonicMs = 9_000 + (2 * 60 * 60 * 1000) + 1;

    const result = policy.evaluateOfflineSale(saleInput());

    expect(result).toMatchObject({
      allowed: false,
      code: 'offline_window_exceeded',
    });
  });

  it('Given relogio local retrocedido, When tenta concluir offline, Then bloqueia por rollback', () => {
    policy.recordOnlineHeartbeat('2026-08-11T11:50:00.000Z', {
      operator_id: 'operator-1',
    });
    nowMs = Date.parse('2026-08-11T11:40:00.000Z');

    const result = policy.evaluateOfflineSale(saleInput());

    expect(result).toMatchObject({
      allowed: false,
      code: 'clock_rollback_detected',
    });
  });

  it('Given app reiniciou apos ultima ancora, When tenta concluir offline, Then bloqueia ate nova validacao online', () => {
    policy.recordOnlineHeartbeat('2026-08-11T11:50:00.000Z', {
      operator_id: 'operator-1',
    });
    const restartedPolicy = new ContingencyPolicy({
      sessionId: 'session-b',
      now: () => new Date(Date.parse('2026-08-11T12:00:00.000Z')),
      monotonicNow: () => 500,
      auth: {
        isAuthenticated: () => true,
        getDeviceId: () => 'device-1',
        getBranchId: () => 'branch-1',
        getRefreshToken: () => 'refresh-1',
      },
      catalogCache: {
        getProductById: () => ({
          id: 'product-1',
          sku: 'SKU-1',
          name: 'Produto 1',
          base_unit_id: 'unit-1',
          requires_lot: false,
          requires_expiry: false,
          is_active: true,
          updated_at: '2026-08-11T10:00:00.000Z',
        }),
        getPrice: () => ({
          id: 'price-1',
          product_id: 'product-1',
          amount: '10.00',
          valid_from: '2026-08-10T00:00:00.000Z',
          valid_to: null,
          updated_at: '2026-08-11T11:30:00.000Z',
        }),
      },
    });

    const result = restartedPolicy.evaluateOfflineSale(saleInput());

    expect(result).toMatchObject({
      allowed: false,
      code: 'restart_requires_new_anchor',
    });
  });

  it('Given relogio monotonic retrocedido na mesma sessao, When tenta concluir offline, Then bloqueia por regressao monotonic fail-closed', () => {
    policy.recordOnlineHeartbeat('2026-08-11T11:50:00.000Z', {
      operator_id: 'operator-1',
    });
    nowMs = Date.parse('2026-08-11T12:00:00.000Z');
    monotonicMs = 8_500;

    const result = policy.evaluateOfflineSale(saleInput());

    expect(result).toMatchObject({
      allowed: false,
      code: 'clock_rollback_detected',
    });
  });

  it('Given ancora persistida sem elegibilidade de operador, When o app reinicia e tenta vender offline, Then bloqueia por ancora invalida apos restart', () => {
    policy.recordOnlineHeartbeat('2026-08-11T11:50:00.000Z');
    const restartedPolicy = new ContingencyPolicy({
      sessionId: 'session-b',
      now: () => new Date(Date.parse('2026-08-11T12:00:00.000Z')),
      monotonicNow: () => 500,
      auth: {
        isAuthenticated: () => true,
        getDeviceId: () => 'device-1',
        getBranchId: () => 'branch-1',
        getRefreshToken: () => 'refresh-1',
      },
      catalogCache: {
        getProductById: () => ({
          id: 'product-1',
          sku: 'SKU-1',
          name: 'Produto 1',
          base_unit_id: 'unit-1',
          requires_lot: false,
          requires_expiry: false,
          is_active: true,
          updated_at: '2026-08-11T10:00:00.000Z',
        }),
        getPrice: () => ({
          id: 'price-1',
          product_id: 'product-1',
          amount: '10.00',
          valid_from: '2026-08-10T00:00:00.000Z',
          valid_to: null,
          updated_at: '2026-08-11T11:30:00.000Z',
        }),
      },
    });

    const result = restartedPolicy.evaluateOfflineSale(saleInput());

    expect(result).toMatchObject({
      allowed: false,
      code: 'restart_requires_new_anchor',
    });
  });

  it('Given device elegivel foi revogado na ancora, When tenta concluir offline, Then bloqueia a contingencia', () => {
    policy.recordOnlineHeartbeat('2026-08-11T11:50:00.000Z', {
      operator_id: 'operator-1',
      device_revoked: true,
    });

    const result = policy.evaluateOfflineSale(saleInput());

    expect(result).toMatchObject({
      allowed: false,
      code: 'device_not_eligible',
    });
  });

  it('Given operador elegivel foi revogado na ancora, When tenta concluir offline, Then bloqueia a contingencia', () => {
    policy.recordOnlineHeartbeat('2026-08-11T11:50:00.000Z', {
      operator_id: 'operator-1',
      operator_revoked: true,
    });

    const result = policy.evaluateOfflineSale(saleInput());

    expect(result).toMatchObject({
      allowed: false,
      code: 'operator_not_eligible',
    });
  });

  it('Given preco em cache com mais de vinte e quatro horas, When tenta concluir offline, Then bloqueia venda', () => {
    policy = new ContingencyPolicy({
      sessionId: 'session-a',
      now: () => new Date(Date.parse('2026-08-11T12:00:00.000Z')),
      monotonicNow: () => 10_000,
      auth: {
        isAuthenticated: () => true,
        getDeviceId: () => 'device-1',
        getBranchId: () => 'branch-1',
        getRefreshToken: () => 'refresh-1',
      },
      catalogCache: {
        getProductById: () => ({
          id: 'product-1',
          sku: 'SKU-1',
          name: 'Produto 1',
          base_unit_id: 'unit-1',
          requires_lot: false,
          requires_expiry: false,
          is_active: true,
          updated_at: '2026-08-10T10:00:00.000Z',
        }),
        getPrice: () => ({
          id: 'price-1',
          product_id: 'product-1',
          amount: '10.00',
          valid_from: '2026-08-09T00:00:00.000Z',
          valid_to: null,
          updated_at: '2026-08-10T10:30:00.000Z',
        }),
      },
    });
    policy.recordOnlineHeartbeat('2026-08-11T11:00:00.000Z', {
      operator_id: 'operator-1',
    });

    const result = policy.evaluateOfflineSale(saleInput());

    expect(result).toMatchObject({
      allowed: false,
      code: 'stale_price_cache',
    });
  });

  it('Given pagamento externo sem referencia auditavel, When tenta concluir offline, Then bloqueia contingencia', () => {
    policy.recordOnlineHeartbeat('2026-08-11T11:50:00.000Z', {
      operator_id: 'operator-1',
    });

    const result = policy.evaluateOfflineSale(saleInput({
      payments: [{ method: 'pix_external_confirmed', amount: '10.00' }],
    }));

    expect(result).toMatchObject({
      allowed: false,
      code: 'external_reference_required',
    });
  });
});
