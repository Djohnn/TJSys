// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../services/api', () => ({
  api: { post: vi.fn() },
}));

vi.mock('../services/operationJournal', () => ({
  operationJournal: {
    init: vi.fn(),
    getPending: vi.fn(),
    getPendingCount: vi.fn(),
    markSyncing: vi.fn(),
    markSynced: vi.fn(),
    markFailed: vi.fn(),
    markRetry: vi.fn(),
    markConflict: vi.fn(),
    cleanup: vi.fn(),
    setSyncMetadata: vi.fn(),
    getByUuid: vi.fn(),
  },
}));

vi.mock('../services/connectivityMonitor', () => ({
  connectivityMonitor: {
    init: vi.fn(),
    isOnline: vi.fn(),
    onConnectivityChange: vi.fn(),
    setLastSyncAt: vi.fn(),
    getState: vi.fn(),
  },
}));

vi.mock('../services/conflictResolver', () => ({
  resolveConflict: vi.fn(),
}));

vi.mock('../services/batchSyncClient', () => ({
  batchSyncClient: {
    syncBatch: vi.fn(),
  },
}));

vi.mock('../utils/backoff', () => ({
  getBackoffDelay: vi.fn(),
  shouldRetry: vi.fn(),
}));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { syncEngine } from '../services/syncEngine';
import { operationJournal } from '../services/operationJournal';
import { connectivityMonitor } from '../services/connectivityMonitor';
import { api } from '../services/api';
import { resolveConflict } from '../services/conflictResolver';
import { batchSyncClient } from '../services/batchSyncClient';
import { getBackoffDelay, shouldRetry } from '../utils/backoff';

const mockEntry = (overrides = {}) => ({
  uuid: 'uuid-1',
  type: 'sale:create',
  payload: JSON.stringify({ amount: 100 }),
  idempotency_key: 'idem-1',
  retry_count: 0,
  status: 'pending' as const,
  created_at: new Date().toISOString(),
  synced_at: null,
  last_error: null,
  conflict_resolution: null,
  id: 1,
  ...overrides,
});

function resetMocks() {
  vi.clearAllMocks();
  vi.mocked(operationJournal.getPendingCount).mockReturnValue(0);
  vi.mocked(operationJournal.getPending).mockReturnValue([]);
  vi.mocked(operationJournal.cleanup).mockReturnValue(0);
  vi.mocked(connectivityMonitor.isOnline).mockReturnValue(true);
  vi.mocked(connectivityMonitor.onConnectivityChange).mockReturnValue(vi.fn());
  vi.mocked(getBackoffDelay).mockReturnValue(100);
  vi.mocked(shouldRetry).mockReturnValue(true);
  vi.mocked(batchSyncClient.syncBatch).mockResolvedValue({
    success: false,
    eventsProcessed: 0,
    eventsAccepted: 0,
    eventsConflict: 0,
    eventsFailed: 0,
    error: 'unit test fallback',
  });
}

describe('syncEngine', () => {
  beforeEach(() => {
    resetMocks();
    syncEngine.destroy();
  });

  afterEach(() => {
    syncEngine.destroy();
  });

  it('init subscribes to connectivity changes and checks pending count', () => {
    syncEngine.init();
    expect(connectivityMonitor.onConnectivityChange).toHaveBeenCalled();
    expect(operationJournal.getPendingCount).toHaveBeenCalled();
  });

  it('getState returns initial state with pending count', () => {
    vi.mocked(operationJournal.getPendingCount).mockReturnValue(5);
    const state = syncEngine.getState();
    expect(state.status).toBe('idle');
    expect(state.pendingCount).toBe(5);
  });

  it('sync returns idle when no pending operations', async () => {
    vi.mocked(operationJournal.getPending).mockReturnValue([]);
    const result = await syncEngine.sync();
    expect(result.status).toBe('idle');
  });

  it('sync processes pending operations successfully', async () => {
    vi.mocked(operationJournal.getPending).mockReturnValue([mockEntry()]);
    vi.mocked(api.post).mockResolvedValue({ data: { id: 1 } });
    
    const result = await syncEngine.sync();
    
    expect(operationJournal.markSyncing).toHaveBeenCalledWith('uuid-1');
    expect(operationJournal.markSynced).toHaveBeenCalledWith('uuid-1');
    expect(result.status).toBe('idle');
  });

  it('sync handles 409 conflict via conflictResolver', async () => {
    vi.mocked(operationJournal.getPending).mockReturnValue([mockEntry()]);
    vi.mocked(api.post).mockRejectedValue({
      response: { status: 409, data: { server_version: 'v2' } },
    });
    vi.mocked(resolveConflict).mockReturnValue({
      strategy: 'last-write-wins',
      resolution: 'local',
      detail: 'local wins',
    });
    
    await syncEngine.sync();
    
    expect(resolveConflict).toHaveBeenCalled();
    expect(operationJournal.markConflict).toHaveBeenCalled();
  });

  it('sync handles 4xx errors by marking failed or retry', async () => {
    vi.mocked(operationJournal.getPending).mockReturnValue([mockEntry()]);
    vi.mocked(api.post).mockRejectedValue({
      response: { status: 422, data: { detail: 'Validation error' } },
    });
    
    await syncEngine.sync();
    
    expect(operationJournal.markFailed).toHaveBeenCalledWith('uuid-1', 'Validation error');
  });

  it('rejects cash-session operations from contingency sync routing', async () => {
    vi.mocked(operationJournal.getPending).mockReturnValue([mockEntry({ type: 'cash-session:open' })]);

    await syncEngine.sync();

    expect(operationJournal.markFailed).toHaveBeenCalledWith('uuid-1', 'Unknown operation type: cash-session:open');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('sync retries on network error with backoff', async () => {
    vi.mocked(operationJournal.getPending).mockReturnValue([mockEntry()]);
    vi.mocked(api.post)
      .mockRejectedValueOnce({ message: 'Network error', code: 'ECONNREFUSED' })
      .mockRejectedValueOnce({ message: 'Network error', code: 'ECONNREFUSED' })
      .mockResolvedValueOnce({ data: { id: 1 } });
    
    await syncEngine.sync();
    
    expect(getBackoffDelay).toHaveBeenCalled();
    expect(operationJournal.markSynced).toHaveBeenCalledWith('uuid-1');
  });

  it('sync stops if connectivity lost during sync', async () => {
    vi.mocked(operationJournal.getPending).mockReturnValue([mockEntry()]);
    vi.mocked(api.post).mockRejectedValue({ message: 'Network error' });
    vi.mocked(shouldRetry).mockReturnValue(true);
    vi.mocked(connectivityMonitor.isOnline)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    
    await syncEngine.sync();
    
    expect(operationJournal.markRetry).toHaveBeenCalledWith('uuid-1', 'Lost connectivity during retry');
  });

  it('sync marks failed when retry count exceeded', async () => {
    vi.mocked(operationJournal.getPending).mockReturnValue([mockEntry()]);
    vi.mocked(api.post).mockRejectedValue({ message: 'Persistent error' });
    vi.mocked(shouldRetry).mockReturnValue(false);
    
    await syncEngine.sync();
    
    expect(operationJournal.markFailed).toHaveBeenCalledWith('uuid-1', 'Persistent error');
  });

  it('notifies listeners on state changes', async () => {
    const listener = vi.fn();
    syncEngine.onSyncStateChange(listener);
    vi.mocked(operationJournal.getPending).mockReturnValue([]);
    await syncEngine.sync();
    expect(listener).toHaveBeenCalled();
  });

  it('syncAll delegates to sync', async () => {
    vi.mocked(operationJournal.getPending).mockReturnValue([]);
    const result = await syncEngine.syncAll();
    expect(result.status).toBe('idle');
  });

  it('rejects concurrent sync calls returning current state', async () => {
    vi.mocked(operationJournal.getPending).mockReturnValue([mockEntry()]);
    vi.mocked(api.post).mockImplementation(() => new Promise((r) => setTimeout(() => r({ data: {} }), 200)));
    
    const sync1 = syncEngine.sync();
    const sync2 = syncEngine.sync();
    const [r1, r2] = await Promise.all([sync1, sync2]);
    expect(r1.status).toBe('idle');
    expect(r2.status).toBe('syncing');
    expect(operationJournal.markSynced).toHaveBeenCalledTimes(1);
  });

  it('destroy cleans up and removes listeners', () => {
    syncEngine.init();
    syncEngine.destroy();
    expect(operationJournal.getPendingCount).toHaveBeenCalled();
  });
});
