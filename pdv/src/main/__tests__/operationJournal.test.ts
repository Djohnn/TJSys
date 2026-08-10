// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(),
    isPackaged: false,
    getAppPath: vi.fn(),
  },
  net: {
    request: vi.fn(),
  },
}));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { app } from 'electron';
import { operationJournal } from '../services/operationJournal';

describe('operationJournal', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oj-'));
    vi.mocked(app.getPath).mockReturnValue(tempDir);
    operationJournal.init();
  });

  afterEach(() => {
    operationJournal.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('adds and retrieves an operation', () => {
    const entry = operationJournal.addOperation({
      uuid: 'uuid-1',
      type: 'sale:create',
      payload: { amount: 100 },
      idempotencyKey: 'idem-1',
    });
    expect(entry.uuid).toBe('uuid-1');
    expect(entry.status).toBe('pending');
    expect(entry.type).toBe('sale:create');

    const retrieved = operationJournal.getByUuid('uuid-1');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.payload).toBe(JSON.stringify({ amount: 100 }));
  });

  it('getPending returns operations ordered by creation', () => {
    operationJournal.addOperation({
      uuid: 'u1', type: 'sale:create', payload: { a: 1 }, idempotencyKey: 'k1',
    });
    operationJournal.addOperation({
      uuid: 'u2', type: 'cash-session:open', payload: { b: 2 }, idempotencyKey: 'k2',
    });
    const pending = operationJournal.getPending();
    expect(pending).toHaveLength(2);
    expect(pending[0].uuid).toBe('u1');
  });

  it('getPendingCount returns correct count', () => {
    expect(operationJournal.getPendingCount()).toBe(0);
    operationJournal.addOperation({
      uuid: 'u1', type: 'sale:create', payload: {}, idempotencyKey: 'k1',
    });
    expect(operationJournal.getPendingCount()).toBe(1);
  });

  it('markSynced updates status and timestamp', () => {
    operationJournal.addOperation({
      uuid: 'u1', type: 'sale:create', payload: {}, idempotencyKey: 'k1',
    });
    operationJournal.markSynced('u1');
    const entry = operationJournal.getByUuid('u1')!;
    expect(entry.status).toBe('synced');
    expect(entry.synced_at).not.toBeNull();
  });

  it('markConflict updates status and resolution', () => {
    operationJournal.addOperation({
      uuid: 'u1', type: 'sale:create', payload: {}, idempotencyKey: 'k1',
    });
    operationJournal.markConflict('u1', { strategy: 'local' });
    const entry = operationJournal.getByUuid('u1')!;
    expect(entry.status).toBe('conflict');
    expect(JSON.parse(entry.conflict_resolution!)).toEqual({ strategy: 'local' });
  });

  it('markFailed updates status and increments retry', () => {
    operationJournal.addOperation({
      uuid: 'u1', type: 'sale:create', payload: {}, idempotencyKey: 'k1',
    });
    operationJournal.markFailed('u1', 'server error');
    const entry = operationJournal.getByUuid('u1')!;
    expect(entry.status).toBe('failed');
    expect(entry.last_error).toBe('server error');
    expect(entry.retry_count).toBe(1);
  });

  it('markRetry resets to pending and increments retry', () => {
    operationJournal.addOperation({
      uuid: 'u1', type: 'sale:create', payload: {}, idempotencyKey: 'k1',
    });
    operationJournal.markRetry('u1', 'timeout');
    const entry = operationJournal.getByUuid('u1')!;
    expect(entry.status).toBe('pending');
    expect(entry.last_error).toBe('timeout');
    expect(entry.retry_count).toBe(1);
  });

  it('cleanup removes synced entries older than specified days', () => {
    operationJournal.addOperation({
      uuid: 'old-one', type: 'sale:create', payload: {}, idempotencyKey: 'k-old',
    });
    operationJournal.markSynced('old-one');
    const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    operationJournal.getByUuid('old-one')!.synced_at; 
    const db = (operationJournal as unknown as { db: { prepare: (s: string) => { run: (...args: unknown[]) => { changes: number } } } });
    const removed = operationJournal.cleanup(7);
    expect(removed).toBe(0);
  });

  it('sync metadata round-trips correctly', () => {
    operationJournal.setSyncMetadata('last_sync', '2026-07-17T00:00:00Z');
    expect(operationJournal.getSyncMetadata('last_sync')).toBe('2026-07-17T00:00:00Z');
    expect(operationJournal.getSyncMetadata('nonexistent')).toBeNull();
  });

  it('handles duplicate uuid gracefully', () => {
    operationJournal.addOperation({
      uuid: 'dup', type: 'sale:create', payload: {}, idempotencyKey: 'k1',
    });
    expect(() => {
      operationJournal.addOperation({
        uuid: 'dup', type: 'sale:create', payload: {}, idempotencyKey: 'k2',
      });
    }).toThrow();
  });

  it('getAll returns all entries sorted by creation desc', () => {
    operationJournal.addOperation({
      uuid: 'first', type: 'sale:create', payload: {}, idempotencyKey: 'k1',
    });
    operationJournal.addOperation({
      uuid: 'second', type: 'cash-session:open', payload: {}, idempotencyKey: 'k2',
    });
    const all = operationJournal.getAll();
    expect(all).toHaveLength(2);
  });
});
