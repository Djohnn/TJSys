import { api } from './api';
import { operationJournal } from './operationJournal';
import { connectivityMonitor } from './connectivityMonitor';
import { resolveConflict } from './conflictResolver';
import { getBackoffDelay, shouldRetry } from '../utils/backoff';
import { logger } from '../utils/logger';

export type SyncStatus = 'idle' | 'syncing' | 'completed' | 'error';

export interface SyncState {
  status: SyncStatus;
  pendingCount: number;
  lastSyncAt: Date | null;
  error: string | null;
}

export type SyncListener = (state: SyncState) => void;

class SyncEngine {
  private state: SyncState = {
    status: 'idle',
    pendingCount: 0,
    lastSyncAt: null,
    error: null,
  };

  private listeners: SyncListener[] = [];
  private syncInProgress = false;
  private initialized = false;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    connectivityMonitor.onConnectivityChange((online) => {
      if (online) {
        logger.info('Back online, starting sync');
        this.sync().catch((err) => {
          logger.error('Auto-sync failed after reconnect:', err);
        });
      }
    });

    this.state.pendingCount = operationJournal.getPendingCount();
    this.notifyListeners();

    this.cleanupTimer = setInterval(() => {
      const removed = operationJournal.cleanup(7);
      if (removed > 0) {
        logger.info('Cleaned up old journal entries', { removed });
      }
    }, 3600000);

    logger.info('Sync engine initialized');
  }

  onSyncStateChange(listener: SyncListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  getState(): SyncState {
    return { ...this.state, pendingCount: operationJournal.getPendingCount() };
  }

  async sync(): Promise<SyncState> {
    if (this.syncInProgress) return this.getState();
    this.syncInProgress = true;

    try {
      this.state.status = 'syncing';
      this.state.error = null;
      this.notifyListeners();

      const pending = operationJournal.getPending();
      if (pending.length === 0) {
        this.state.status = 'idle';
        this.notifyListeners();
        return this.getState();
      }

      for (const entry of pending) {
        if (!connectivityMonitor.isOnline()) {
          logger.warn('Lost connectivity during sync, stopping');
          break;
        }

        await this.processEntry(entry);
      }

      if (connectivityMonitor.isOnline()) {
        operationJournal.setSyncMetadata(
          'last_operations_sync',
          new Date().toISOString()
        );
      }

      this.state.pendingCount = operationJournal.getPendingCount();
      this.state.lastSyncAt = new Date();
      connectivityMonitor.setLastSyncAt(this.state.lastSyncAt);
      this.state.status = this.state.pendingCount > 0 ? 'error' : 'idle';
      this.notifyListeners();
    } catch (err) {
      this.state.status = 'error';
      this.state.error = err instanceof Error ? err.message : 'Unknown sync error';
      logger.error('Sync engine error:', err);
      this.notifyListeners();
    } finally {
      this.syncInProgress = false;
    }

    return this.getState();
  }

  private async processEntry(entry: {
    uuid: string;
    type: string;
    payload: string;
    idempotency_key: string;
    retry_count: number;
  }): Promise<void> {
    const endpoint = this.getEndpoint(entry.type);
    if (!endpoint) {
      operationJournal.markFailed(entry.uuid, `Unknown operation type: ${entry.type}`);
      return;
    }

    operationJournal.markSyncing(entry.uuid);

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(entry.payload);
    } catch {
      operationJournal.markFailed(entry.uuid, 'Invalid JSON payload');
      return;
    }

    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const response = await api.post(endpoint, payload, {
          headers: { 'Idempotency-Key': entry.idempotency_key },
        });

        operationJournal.markSynced(entry.uuid);
        logger.info('Operation synced', { uuid: entry.uuid, type: entry.type });
        return;
      } catch (err) {
        const axiosErr = err as {
          response?: { status: number; data?: Record<string, unknown> };
          message?: string;
          code?: string;
        };

        if (axiosErr.response?.status === 409) {
          const resolution = resolveConflict(
            entry.type,
            payload,
            axiosErr.response.data || {}
          );
          operationJournal.markConflict(entry.uuid, resolution);
          logger.warn('Conflict resolved', { uuid: entry.uuid, resolution });
          return;
        }

        if (axiosErr.response && axiosErr.response.status >= 400 && axiosErr.response.status < 500) {
          const msg = axiosErr.response.data?.detail || axiosErr.message || 'Client error';
          if (axiosErr.response.status === 422 || axiosErr.response.status === 400) {
            operationJournal.markFailed(entry.uuid, msg);
            logger.error('Operation failed permanently', { uuid: entry.uuid, error: msg });
          } else {
            operationJournal.markRetry(entry.uuid, msg);
          }
          return;
        }

        const delay = getBackoffDelay(attempt);
        logger.warn('Sync retry', { uuid: entry.uuid, attempt, delay });

        if (!shouldRetry(attempt)) {
          operationJournal.markFailed(entry.uuid, axiosErr.message || 'Max retries exceeded');
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, delay));

        if (!connectivityMonitor.isOnline()) {
          operationJournal.markRetry(entry.uuid, 'Lost connectivity during retry');
          return;
        }
      }
    }
  }

  private getEndpoint(type: string): string | null {
    switch (type) {
      case 'sale:create':
        return '/sales/counter/';
      default:
        return null;
    }
  }

  async syncAll(): Promise<SyncState> {
    return this.sync();
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.getState());
      } catch (err) {
        logger.error('Sync listener error:', err);
      }
    }
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.listeners = [];
    this.initialized = false;
    logger.info('Sync engine destroyed');
  }
}

export const syncEngine = new SyncEngine();
