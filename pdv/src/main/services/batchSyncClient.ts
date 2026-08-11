import { api } from './api';
import { operationJournal } from './operationJournal';
import { logger } from '../utils/logger';
import { createHash } from 'node:crypto';

export interface BatchSyncResult {
  success: boolean;
  batchId?: string;
  eventsProcessed: number;
  eventsAccepted: number;
  eventsConflict: number;
  eventsFailed: number;
  error?: string;
}

export interface SyncBatchEvent {
  event_id: string;
  local_sequence: number;
  event_type: string;
  event_version: number;
  idempotency_key: string;
  occurred_at: string;
  payload: Record<string, unknown>;
  payload_hash: string;
  tenant_id: string;
  device_id: string;
}

const MAX_BATCH_SIZE = 50;
const BATCH_ENDPOINT = '/api/v1/pdv/sync-batches/';

export class BatchSyncClient {
  private syncInProgress = false;

  async syncBatch(): Promise<BatchSyncResult> {
    if (this.syncInProgress) {
      return {
        success: false,
        eventsProcessed: 0,
        eventsAccepted: 0,
        eventsConflict: 0,
        eventsFailed: 0,
        error: 'Sync already in progress',
      };
    }

    this.syncInProgress = true;

    try {
      const pending = operationJournal.getPending();
      if (pending.length === 0) {
        return {
          success: true,
          eventsProcessed: 0,
          eventsAccepted: 0,
          eventsConflict: 0,
          eventsFailed: 0,
        };
      }

      const batchEvents = pending.slice(0, MAX_BATCH_SIZE).map((entry) => {
        const payload = JSON.parse(entry.payload) as Record<string, unknown>;
        operationJournal.markSyncing(entry.uuid);
        return {
          event_id: entry.uuid,
          local_sequence: entry.id,
          event_type: entry.type === 'sale:create' ? 'offline.sale.completed' : entry.type,
          event_version: 1,
          idempotency_key: entry.idempotency_key,
          occurred_at: entry.created_at,
          payload,
          payload_hash: this.computePayloadHash(JSON.stringify(payload)),
          tenant_id: payload.tenant_id as string,
          device_id: payload.device_id as string,
        } as SyncBatchEvent;
      });

      const batchHash = this.computeBatchHash(batchEvents);

      const response = await api.post(BATCH_ENDPOINT, {
        events: batchEvents,
        batch_hash: batchHash,
      });

      const events = response.data.events || [];
      let accepted = 0;
      let conflict = 0;
      let failed = 0;

      for (const [index, event] of events.entries()) {
        const localEntry = batchEvents[index];
        if (!localEntry) continue;

        if (event.status === 'accepted') {
          operationJournal.markSynced(localEntry.event_id);
          accepted++;
        } else if (event.status === 'conflict_requires_review') {
          operationJournal.markConflict(localEntry.event_id, event.error_detail ? { code: event.error_code, detail: event.error_detail } : {});
          conflict++;
        } else if (event.status === 'failed') {
          operationJournal.markFailed(localEntry.event_id, event.error_detail || 'Sync failed');
          failed++;
        }
      }

      logger.info('Batch sync completed', { batchId: response.data.batch_id, accepted, conflict, failed });

      return {
        success: true,
        batchId: response.data.batch_id,
        eventsProcessed: batchEvents.length,
        eventsAccepted: accepted,
        eventsConflict: conflict,
        eventsFailed: failed,
      };
    } catch (error) {
      const err = error as { response?: { data?: { detail?: string } }; message?: string };
      const errorMessage = err.response?.data?.detail || err.message || 'Batch sync failed';
      logger.error('Batch sync error:', error);
      return {
        success: false,
        eventsProcessed: 0,
        eventsAccepted: 0,
        eventsConflict: 0,
        eventsFailed: 0,
        error: errorMessage,
      };
    } finally {
      this.syncInProgress = false;
    }
  }

  private computePayloadHash(payload: string): string {
    const canonical = this.canonicalizePayload(payload);
    return createHash('sha256').update(canonical, 'utf8').digest('hex');
  }

  private computeBatchHash(events: SyncBatchEvent[]): string {
    const canonical = this.canonicalizePayload(JSON.stringify(events));
    return createHash('sha256').update(canonical, 'utf8').digest('hex');
  }

  private canonicalizePayload(payload: string): string {
    try {
      return JSON.stringify(this.sortValue(JSON.parse(payload)));
    } catch {
      return payload;
    }
  }

  private sortValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((v) => this.sortValue(v));
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, entry]) => [key, this.sortValue(entry)])
      );
    }
    return value;
  }
}

export const batchSyncClient = new BatchSyncClient();
