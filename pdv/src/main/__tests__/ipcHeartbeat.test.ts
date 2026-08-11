// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = new Map<string, (event: unknown, payload: unknown) => Promise<unknown>>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (event: unknown, payload: unknown) => Promise<unknown>) => {
      handlers.set(channel, handler);
    }),
  },
}));

vi.mock('../services/api', () => ({
  api: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

vi.mock('../services/connectivityMonitor', () => ({
  connectivityMonitor: {
    isOnline: vi.fn(() => true),
  },
}));

vi.mock('../services/contingencyPolicy', () => ({
  contingencyPolicy: {
    recordOnlineHeartbeat: vi.fn(),
  },
}));

vi.mock('../services/offlineSaleService', () => ({
  offlineSaleService: {
    queueSale: vi.fn(),
  },
}));

vi.mock('../services/auth', () => ({
  auth: {
    getDeviceId: vi.fn(() => 'device-1'),
  },
}));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { api } from '../services/api';
import { auth } from '../services/auth';
import { connectivityMonitor } from '../services/connectivityMonitor';
import { contingencyPolicy } from '../services/contingencyPolicy';
import { operationJournal } from '../services/operationJournal';
import { buildEligibilityHeartbeat } from '../ipc/contingencyHeartbeat';
import { setupCashSessionHandlers } from '../ipc/cash-session';
import { setupSaleHandlers } from '../ipc/sale';

describe('online heartbeat eligibility wiring', () => {
  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
    vi.spyOn(operationJournal, 'addOperation');
    vi.mocked(connectivityMonitor.isOnline).mockReturnValue(true);
  });

  it('Given venda online confirmada, When sale:create persiste heartbeat, Then envia operador e elegibilidade explícita do dispositivo', async () => {
    setupSaleHandlers();
    vi.mocked(api.post).mockResolvedValue({
      data: { id: 'sale-1', operator: 'operator-9' },
      headers: { date: 'Tue, 11 Aug 2026 12:00:00 GMT' },
    });

    const handler = handlers.get('sale:create');
    if (!handler) throw new Error('sale:create handler not registered');

    await handler({}, {
      branch: 'branch-1',
      stock_location: 'stock-1',
      cash_session_id: 'cash-1',
      operator_id: 'operator-9',
      items: [{ product: 'product-1', unit: 'unit-1', quantity: '1', factor: '1' }],
      payments: [{ method: 'cash', amount: '10.00' }],
    });

    expect(auth.getDeviceId).toHaveBeenCalled();
    expect(contingencyPolicy.recordOnlineHeartbeat).toHaveBeenCalledWith(
      'Tue, 11 Aug 2026 12:00:00 GMT',
      {
        device_id: 'device-1',
        operator_id: 'operator-9',
      },
    );
  });

  it('Given cash-session current online com operador autenticado no payload, When registra heartbeat, Then envia operador e elegibilidade explícita', async () => {
    setupCashSessionHandlers();
    vi.mocked(api.get).mockResolvedValue({
      data: { id: 'cash-1', operator: 'operator-3', status: 'open' },
      headers: { date: 'Tue, 11 Aug 2026 12:05:00 GMT' },
    });

    const handler = handlers.get('cash-session:current');
    if (!handler) throw new Error('cash-session:current handler not registered');

    await handler({}, 'branch-1');

    expect(contingencyPolicy.recordOnlineHeartbeat).toHaveBeenCalledWith(
      'Tue, 11 Aug 2026 12:05:00 GMT',
      {
        device_id: 'device-1',
        operator_id: 'operator-3',
      },
    );
  });

  it('Given resposta sem evidência de elegibilidade, When monta heartbeat, Then mantém flags ausentes', () => {
    expect(buildEligibilityHeartbeat({ operator: 'operator-9' })).toEqual({
      device_id: 'device-1',
      operator_id: 'operator-9',
    });
  });

  it('Given resposta com evidência explícita, When monta heartbeat, Then propaga somente os valores recebidos', () => {
    expect(buildEligibilityHeartbeat({
      device: { id: 'device-2', active: false, revoked: true },
      operator: { id: 'operator-9', active: false, revoked: true },
    })).toEqual({
      device_id: 'device-2',
      device_active: false,
      device_revoked: true,
      operator_id: 'operator-9',
      operator_active: false,
      operator_revoked: true,
    });
  });
  it('Given PDV offline, When solicita abertura de caixa, Then bloqueia fail-closed sem rede nem journal sincronizável', async () => {
    setupCashSessionHandlers();
    vi.mocked(connectivityMonitor.isOnline).mockReturnValue(false);

    const handler = handlers.get('cash-session:open');
    if (!handler) throw new Error('cash-session:open handler not registered');

    const result = await handler({}, { branch: 'branch-1', openingAmount: '100.00' });

    expect(result).toEqual({
      success: false,
      error: 'Cash session open is not allowed offline; reconnect first.',
      code: 'offline_cash_session_blocked',
    });
    expect(api.post).not.toHaveBeenCalled();
    expect(operationJournal.addOperation).not.toHaveBeenCalled();
  });

  it('Given PDV offline, When solicita fechamento de caixa, Then bloqueia fail-closed sem rede nem journal sincronizável', async () => {
    setupCashSessionHandlers();
    vi.mocked(connectivityMonitor.isOnline).mockReturnValue(false);

    const handler = handlers.get('cash-session:close');
    if (!handler) throw new Error('cash-session:close handler not registered');

    const result = await handler({}, { sessionId: 'cash-1', closingAmount: '120.00' });

    expect(result).toEqual({
      success: false,
      error: 'Cash session close is not allowed offline; reconnect first.',
      code: 'offline_cash_session_blocked',
    });
    expect(api.post).not.toHaveBeenCalled();
    expect(operationJournal.addOperation).not.toHaveBeenCalled();
  });
});
