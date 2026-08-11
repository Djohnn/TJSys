import { app } from 'electron';
import { join } from 'node:path';
import { logger } from '../utils/logger';
import { createJournalV3, type JournalV3 } from './journalV3';
import { migrateLegacyJournal } from './journalMigration';

export interface JournalEntry {
  id: number;
  uuid: string;
  type: 'sale:create' | 'cash-session:open' | 'cash-session:close';
  payload: string;
  idempotency_key: string;
  status: 'pending' | 'syncing' | 'synced' | 'conflict' | 'failed';
  created_at: string;
  synced_at: string | null;
  retry_count: number;
  last_error: string | null;
  conflict_resolution: string | null;
}

class OperationJournal {
  private journal: JournalV3 | null = null;

  init(): void {
    const legacyPath = join(app.getPath('userData'), 'operation-journal.db');
    const targetPath = join(app.getPath('userData'), 'operation-journal-v3.db');
    const result = migrateLegacyJournal({ legacyPath, targetPath });
    this.journal = createJournalV3(result.targetPath);
    logger.info('Operation journal v3 initialized');
  }

  addOperation(op: { uuid: string; type: JournalEntry['type']; payload: Record<string, unknown>; idempotencyKey: string }): JournalEntry {
    if (!this.journal) throw new Error('Journal not initialized');
    const payload = JSON.stringify(op.payload);
    const identity = {
      event_id: op.uuid, device_id: String(op.payload.device_id ?? 'legacy-device'), tenant_id: String(op.payload.tenant_id ?? 'legacy-tenant'),
      branch_id: String(op.payload.branch_id ?? 'legacy-branch'), cash_session_id: String(op.payload.cash_session_id ?? 'legacy-cash-session'), operator_id: String(op.payload.operator_id ?? 'legacy-operator'),
      local_sequence: Number(op.payload.local_sequence ?? this.journal.getEvents().length + 1), event_type: op.type === 'sale:create' ? 'offline.sale.completed' as const : 'legacy.incompatible' as const,
      event_version: 1, idempotency_key: op.idempotencyKey, occurred_at: new Date().toISOString(), payload,
    };
    this.journal.append(identity);
    return this.toEntry(identity.event_id, op.type);
  }

  getPending(): JournalEntry[] { return this.entries().filter((entry) => entry.status === 'pending').sort((a, b) => a.created_at.localeCompare(b.created_at)); }
  getPendingCount(): number { return this.getPending().length; }
  getByUuid(uuid: string): JournalEntry | null { return this.journal?.getEvent(uuid) ? this.toEntry(uuid) : null; }
  markSyncing(uuid: string): void { this.journal?.setProjection(uuid, 'syncing'); }
  markSynced(uuid: string): void { this.journal?.setProjection(uuid, 'synced'); }
  markConflict(uuid: string, resolution: Record<string, unknown>): void { this.journal?.setProjection(uuid, 'conflict_requires_review', undefined, JSON.stringify(resolution)); }
  markFailed(uuid: string, error: string): void { this.journal?.setProjection(uuid, 'failed', error); }
  markRetry(uuid: string, error: string): void { this.journal?.setProjection(uuid, 'pending', error); }
  cleanup(_daysOld = 7): number { return 0; }
  getAll(): JournalEntry[] { return this.entries(); }
  getSyncMetadata(key: string): string | null { return this.journal?.getMetadata(key) ?? null; }
  setSyncMetadata(key: string, value: string): void { this.journal?.setMetadata(key, value); }
  close(): void { this.journal?.close(); this.journal = null; }

  private entries(): JournalEntry[] { return this.journal?.getEvents().map((event) => this.toEntry(event.event_id)) ?? []; }
  private toEntry(uuid: string, type?: JournalEntry['type']): JournalEntry {
    if (!this.journal) throw new Error('Journal not initialized');
    const event = this.journal.getEvent(uuid);
    if (!event) throw new Error(`event not found: ${uuid}`);
    const projection = this.journal.getProjection(uuid);
    const status = projection?.status === 'conflict_requires_review' ? 'conflict' : projection?.status === 'migration_review' ? 'failed' : projection?.status ?? 'pending';
    return { id: event.local_sequence, uuid, type: type ?? (event.event_type === 'offline.sale.completed' ? 'sale:create' : 'cash-session:open'), payload: event.payload, idempotency_key: event.idempotency_key, status: status as JournalEntry['status'], created_at: event.occurred_at, synced_at: projection?.synced_at ?? null, retry_count: projection?.retry_count ?? 0, last_error: projection?.last_error ?? null, conflict_resolution: projection?.conflict_resolution ?? null };
  }
}

export const operationJournal = new OperationJournal();
