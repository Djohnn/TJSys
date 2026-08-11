import { app } from 'electron';
import { join } from 'node:path';
import { logger } from '../utils/logger';
import { createJournalV3, type JournalV3, type MigrationReviewRecord } from './journalV3';
import { migrateLegacyJournal } from './journalMigration';

export interface JournalEntry {
  id: number;
  uuid: string;
  type: 'sale:create' | 'cash-session:open' | 'cash-session:close';
  payload: string;
  idempotency_key: string;
  status: 'pending' | 'syncing' | 'synced' | 'conflict' | 'failed' | 'migration_review';
  created_at: string;
  synced_at: string | null;
  retry_count: number;
  last_error: string | null;
  conflict_resolution: string | null;
}

interface SyncIdentity {
  device_id: string;
  tenant_id: string;
  branch_id: string;
  cash_session_id: string;
  operator_id: string;
  local_sequence: number;
}

interface ReviewEnvelope {
  type: JournalEntry['type'];
  payload: Record<string, unknown>;
  idempotency_key: string;
  occurred_at: string;
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
    const occurredAt = new Date().toISOString();
    const payload = JSON.stringify(op.payload);
    const quarantineReason = this.getQuarantineReason(op.type, op.payload);
    if (quarantineReason) {
      this.journal.addMigrationReview({
        event_id: op.uuid,
        reason: `non_syncable:${quarantineReason}`,
        raw_payload: JSON.stringify({
          type: op.type,
          payload: op.payload,
          idempotency_key: op.idempotencyKey,
          occurred_at: occurredAt,
        } satisfies ReviewEnvelope),
        exported_at: occurredAt,
      });
      return this.toReviewEntry(op.uuid);
    }

    const identity = this.requireIdentity(op.payload);
    this.journal.append({
      event_id: op.uuid,
      device_id: identity.device_id,
      tenant_id: identity.tenant_id,
      branch_id: identity.branch_id,
      cash_session_id: identity.cash_session_id,
      operator_id: identity.operator_id,
      local_sequence: identity.local_sequence,
      event_type: 'offline.sale.completed',
      event_version: 1,
      idempotency_key: op.idempotencyKey,
      occurred_at: occurredAt,
      payload,
    });
    return this.toEntry(op.uuid, op.type);
  }

  getPending(): JournalEntry[] { return this.entries().filter((entry) => entry.status === 'pending').sort((a, b) => a.created_at.localeCompare(b.created_at)); }
  getPendingCount(): number { return this.getPending().length; }
  getByUuid(uuid: string): JournalEntry | null {
    if (!this.journal) return null;
    return this.journal.getEvent(uuid) || this.journal.getMigrationReview(uuid) ? this.toEntry(uuid) : null;
  }
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

  private entries(): JournalEntry[] {
    if (!this.journal) return [];
    const eventEntries = this.journal.getEvents().map((event) => this.toEntry(event.event_id));
    const reviewEntries = this.journal.getMigrationReviews()
      .filter((review) => !this.journal?.getEvent(review.event_id))
      .map((review) => this.reviewToEntry(review));
    return [...eventEntries, ...reviewEntries].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  private toEntry(uuid: string, type?: JournalEntry['type']): JournalEntry {
    if (!this.journal) throw new Error('Journal not initialized');
    const event = this.journal.getEvent(uuid);
    if (!event) {
      return this.toReviewEntry(uuid);
    }
    const projection = this.journal.getProjection(uuid);
    const status = projection?.status === 'conflict_requires_review' ? 'conflict' : projection?.status ?? 'pending';
    return { id: event.local_sequence, uuid, type: type ?? (event.event_type === 'offline.sale.completed' ? 'sale:create' : 'cash-session:open'), payload: event.payload, idempotency_key: event.idempotency_key, status: status as JournalEntry['status'], created_at: event.occurred_at, synced_at: projection?.synced_at ?? null, retry_count: projection?.retry_count ?? 0, last_error: projection?.last_error ?? null, conflict_resolution: projection?.conflict_resolution ?? null };
  }

  private toReviewEntry(uuid: string): JournalEntry {
    if (!this.journal) throw new Error('Journal not initialized');
    const review = this.journal.getMigrationReview(uuid);
    if (!review) throw new Error(`event not found: ${uuid}`);
    return this.reviewToEntry(review);
  }

  private reviewToEntry(review: MigrationReviewRecord): JournalEntry {
    const envelope = this.parseReviewEnvelope(review);
    return {
      id: review.legacy_id ?? 0,
      uuid: review.event_id,
      type: envelope?.type ?? 'sale:create',
      payload: envelope ? JSON.stringify(envelope.payload) : review.raw_payload,
      idempotency_key: envelope?.idempotency_key ?? review.event_id,
      status: 'migration_review',
      created_at: envelope?.occurred_at ?? review.exported_at ?? new Date(0).toISOString(),
      synced_at: null,
      retry_count: 0,
      last_error: review.reason,
      conflict_resolution: null,
    };
  }

  private parseReviewEnvelope(review: MigrationReviewRecord): ReviewEnvelope | null {
    try {
      const parsed = JSON.parse(review.raw_payload) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      const candidate = parsed as Partial<ReviewEnvelope>;
      if (!candidate.type || !candidate.payload || typeof candidate.idempotency_key !== 'string' || typeof candidate.occurred_at !== 'string') return null;
      return candidate as ReviewEnvelope;
    } catch {
      return null;
    }
  }

  private getQuarantineReason(type: JournalEntry['type'], payload: Record<string, unknown>): string | null {
    if (type === 'cash-session:open' || type === 'cash-session:close') {
      return 'legacy cash-session operations stay audit-only and cannot sync';
    }
    return this.hasIdentity(payload) ? null : 'missing device_id, tenant_id, branch_id, cash_session_id, operator_id or local_sequence';
  }

  private hasIdentity(payload: Record<string, unknown>): payload is Record<string, unknown> & SyncIdentity {
    return ['device_id', 'tenant_id', 'branch_id', 'cash_session_id', 'operator_id'].every((key) => typeof payload[key] === 'string' && payload[key]) && typeof payload.local_sequence === 'number' && payload.local_sequence > 0;
  }

  private requireIdentity(payload: Record<string, unknown>): SyncIdentity {
    if (!this.hasIdentity(payload)) {
      throw new Error('sale:create requires device_id, tenant_id, branch_id, cash_session_id, operator_id and local_sequence');
    }
    return payload;
  }
}

export const operationJournal = new OperationJournal();
