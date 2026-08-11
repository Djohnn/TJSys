import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';

export type OfflineEventType = 'offline.sale.completed' | 'offline.sale.cancelled_before_sync' | 'legacy.incompatible';
export type ProjectionStatus = 'pending' | 'syncing' | 'synced' | 'conflict_requires_review' | 'failed' | 'migration_review';

export interface OfflineEvent {
  event_id: string;
  device_id: string;
  tenant_id: string;
  branch_id: string;
  cash_session_id: string;
  operator_id: string;
  local_sequence: number;
  event_type: OfflineEventType;
  event_version: number;
  idempotency_key: string;
  occurred_at: string;
  payload: string;
  payload_hash: string;
}

export interface AppendEventInput extends Omit<OfflineEvent, 'payload_hash'> {
  payload: string;
}

export function canonicalPayload(payload: string): string {
  try {
    return JSON.stringify(sortValue(JSON.parse(payload)));
  } catch {
    return payload;
  }
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, sortValue(entry)]));
  }
  return value;
}

export function payloadHash(payload: string): string {
  return createHash('sha256').update(canonicalPayload(payload), 'utf8').digest('hex');
}

export function createJournalV3(filePath: string): JournalV3 {
  return new JournalV3(filePath);
}

export class JournalV3 {
  private readonly db: Database.Database;

  constructor(filePath: string) {
    this.db = new Database(filePath);
    this.db.pragma('busy_timeout = 5000');
    this.db.pragma('journal_mode = WAL');
    const initializeSchema = this.db.transaction(() => this.db.exec(`
      CREATE TABLE IF NOT EXISTS offline_events (
        event_id TEXT PRIMARY KEY NOT NULL,
        device_id TEXT NOT NULL, tenant_id TEXT NOT NULL, branch_id TEXT NOT NULL,
        cash_session_id TEXT NOT NULL, operator_id TEXT NOT NULL,
        local_sequence INTEGER NOT NULL CHECK(local_sequence > 0),
        event_type TEXT NOT NULL, event_version INTEGER NOT NULL,
        idempotency_key TEXT NOT NULL, occurred_at TEXT NOT NULL,
        payload TEXT NOT NULL, payload_hash TEXT NOT NULL,
        UNIQUE(device_id, local_sequence),
        UNIQUE(tenant_id, device_id, idempotency_key)
      );
      CREATE TABLE IF NOT EXISTS offline_event_projection (
        event_id TEXT PRIMARY KEY NOT NULL REFERENCES offline_events(event_id),
        status TEXT NOT NULL DEFAULT 'pending', retry_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT, synced_at TEXT, conflict_resolution TEXT, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS migration_review (
        event_id TEXT PRIMARY KEY NOT NULL, legacy_id INTEGER, reason TEXT NOT NULL,
        raw_payload TEXT NOT NULL, exported_at TEXT
      );
      CREATE TABLE IF NOT EXISTS journal_metadata (
        key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TRIGGER IF NOT EXISTS offline_events_no_update BEFORE UPDATE ON offline_events BEGIN SELECT RAISE(ABORT, 'immutable offline event'); END;
      CREATE TRIGGER IF NOT EXISTS offline_events_no_delete BEFORE DELETE ON offline_events BEGIN SELECT RAISE(ABORT, 'immutable offline event'); END;
      CREATE INDEX IF NOT EXISTS idx_offline_projection_status ON offline_event_projection(status);
    `));
    initializeSchema();
  }

  append(input: AppendEventInput): OfflineEvent {
    if (!input.event_id || !input.device_id || !input.tenant_id || !input.branch_id || !input.cash_session_id || !input.operator_id || !input.local_sequence) {
      throw new Error('offline event identity and ordering are required');
    }
    const event: OfflineEvent = { ...input, payload_hash: payloadHash(input.payload) };
    const tx = this.db.transaction(() => {
      this.db.prepare(`INSERT INTO offline_events (event_id,device_id,tenant_id,branch_id,cash_session_id,operator_id,local_sequence,event_type,event_version,idempotency_key,occurred_at,payload,payload_hash) VALUES (@event_id,@device_id,@tenant_id,@branch_id,@cash_session_id,@operator_id,@local_sequence,@event_type,@event_version,@idempotency_key,@occurred_at,@payload,@payload_hash)`).run(event);
      this.db.prepare(`INSERT INTO offline_event_projection (event_id,status,updated_at) VALUES (?, 'pending', ?)`).run(event.event_id, new Date().toISOString());
    });
    tx();
    return event;
  }

  getEvent(eventId: string): OfflineEvent | null { return (this.db.prepare('SELECT * FROM offline_events WHERE event_id = ?').get(eventId) as OfflineEvent | undefined) ?? null; }

  getEvents(): OfflineEvent[] { return this.db.prepare('SELECT * FROM offline_events ORDER BY occurred_at DESC').all() as OfflineEvent[]; }
  getProjection(eventId: string): { status: ProjectionStatus; retry_count: number; last_error: string | null; synced_at: string | null; conflict_resolution: string | null } | null {
    return (this.db.prepare('SELECT status,retry_count,last_error,synced_at,conflict_resolution FROM offline_event_projection WHERE event_id = ?').get(eventId) as { status: ProjectionStatus; retry_count: number; last_error: string | null; synced_at: string | null; conflict_resolution: string | null } | undefined) ?? null;
  }

  setProjection(eventId: string, status: ProjectionStatus, lastError?: string, conflictResolution?: string): void {
    const result = this.db.prepare(`UPDATE offline_event_projection SET status = ?, last_error = ?, conflict_resolution = ?, retry_count = CASE WHEN ? IN ('failed','pending') AND ? IS NOT NULL THEN retry_count + 1 ELSE retry_count END, synced_at = CASE WHEN ? = 'synced' THEN ? ELSE synced_at END, updated_at = ? WHERE event_id = ?`).run(status, lastError ?? null, conflictResolution ?? null, status, lastError ?? null, status, new Date().toISOString(), new Date().toISOString(), eventId);
    if (result.changes === 0) throw new Error(`event not found: ${eventId}`);
  }

  deleteEvent(_eventId: string): never { throw new Error('immutable offline event'); }

  getMetadata(key: string): string | null { return (this.db.prepare('SELECT value FROM journal_metadata WHERE key = ?').get(key) as { value: string } | undefined)?.value ?? null; }
  setMetadata(key: string, value: string): void { this.db.prepare('INSERT INTO journal_metadata (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').run(key, value, new Date().toISOString()); }

  close(): void { this.db.close(); }
}
