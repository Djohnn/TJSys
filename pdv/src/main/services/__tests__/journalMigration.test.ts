// @vitest-environment node
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createJournalV3, type OfflineEvent } from '../journalV3';
import { migrateLegacyJournal, type MigrationPhase } from '../journalMigration';

describe('Journal v3 migration (BDD)', () => {
  let root: string;

  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'r6-journal-')); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  function legacyDb(rows: Array<Record<string, unknown>> = []): string {
    const file = path.join(root, 'operation-journal.db');
    const db = new Database(file);
    db.exec(`PRAGMA journal_mode = WAL; CREATE TABLE operation_journal (
      id INTEGER PRIMARY KEY AUTOINCREMENT, uuid TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL, payload TEXT NOT NULL, idempotency_key TEXT NOT NULL,
      status TEXT NOT NULL, created_at TEXT NOT NULL, synced_at TEXT,
      retry_count INTEGER DEFAULT 0, last_error TEXT, conflict_resolution TEXT
    );`);
    const insert = db.prepare(`INSERT INTO operation_journal
      (uuid,type,payload,idempotency_key,status,created_at) VALUES (?,?,?,?,?,?)`);
    for (const row of rows) insert.run(row.uuid, row.type, row.payload, row.idempotency_key, row.status ?? 'pending', row.created_at ?? '2026-08-10T10:00:00.000Z');
    db.close();
    return file;
  }

  function readEvents(file: string): OfflineEvent[] {
    const db = new Database(file, { readonly: true });
    const rows = db.prepare('SELECT * FROM offline_events ORDER BY local_sequence').all() as OfflineEvent[];
    db.close();
    return rows;
  }

  it('Given no legacy journal, when initialized, then activates an empty v3 schema', () => {
    const result = migrateLegacyJournal({ legacyPath: path.join(root, 'missing.db'), targetPath: path.join(root, 'v3.db') });
    expect(result.phase).toBe('activated');
    expect(readEvents(path.join(root, 'v3.db'))).toEqual([]);
  });

  it('Given an intact legacy journal, when migrated, then preserves rows and backup', () => {
    const legacy = legacyDb([{ uuid: 'sale-1', type: 'sale:create', payload: JSON.stringify({ total: '10.00', lines: [], tenant_id: 't-1', device_id: 'd-1', branch_id: 'b-1', cash_session_id: 'c-1', operator_id: 'o-1', local_sequence: 1 }), idempotency_key: 'id-1' }]);
    const result = migrateLegacyJournal({ legacyPath: legacy, targetPath: path.join(root, 'v3.db') });
    expect(result.phase).toBe('activated');
    expect(readEvents(result.targetPath)).toHaveLength(1);
    expect(fs.existsSync(result.backupPath)).toBe(true);
  });

  it('Given WAL pending, when migrated under lock, then includes committed WAL state', () => {
    const legacy = legacyDb();
    const db = new Database(legacy);
    db.prepare(`INSERT INTO operation_journal (uuid,type,payload,idempotency_key,status,created_at) VALUES (?,?,?,?,?,?)`)
      .run('wal-sale', 'sale:create', JSON.stringify({ total: '2.00', lines: [], tenant_id: 't-1', device_id: 'd-1', branch_id: 'b-1', cash_session_id: 'c-1', operator_id: 'o-1', local_sequence: 1 }), 'wal-id', 'pending', '2026-08-10T10:00:00.000Z');
    db.close();
    expect(migrateLegacyJournal({ legacyPath: legacy, targetPath: path.join(root, 'v3.db') }).phase).toBe('activated');
    expect(readEvents(path.join(root, 'v3.db'))[0].event_id).toBe('wal-sale');
  });

  it.each<MigrationPhase>(['backup_created', 'schema_created', 'rows_copied', 'validated'])('Given a crash after %s, when retried, then activates without duplicates', (phase) => {
    const legacy = legacyDb([{ uuid: 'sale-1', type: 'sale:create', payload: JSON.stringify({ total: '10.00', lines: [], tenant_id: 't-1', device_id: 'd-1', branch_id: 'b-1', cash_session_id: 'c-1', operator_id: 'o-1', local_sequence: 1 }), idempotency_key: 'id-1' }]);
    const target = path.join(root, 'v3.db');
    expect(() => migrateLegacyJournal({ legacyPath: legacy, targetPath: target, failAfterPhase: phase })).toThrow('simulated migration interruption');
    const result = migrateLegacyJournal({ legacyPath: legacy, targetPath: target });
    expect(result.phase).toBe('activated');
    expect(readEvents(target)).toHaveLength(1);
  });

  it('Given a corrupted payload, when validated, then quarantines it without dropping the raw event', () => {
    const legacy = legacyDb([{ uuid: 'bad', type: 'sale:create', payload: '{bad-json', idempotency_key: 'bad-id' }]);
    const result = migrateLegacyJournal({ legacyPath: legacy, targetPath: path.join(root, 'v3.db') });
    const db = new Database(result.targetPath, { readonly: true });
    expect(db.prepare(`SELECT status FROM offline_event_projection WHERE event_id = 'bad'`).get()).toEqual({ status: 'migration_review' });
    expect((db.prepare(`SELECT payload FROM offline_events WHERE event_id = 'bad'`).get() as { payload: string }).payload).toBe('{bad-json');
    db.close();
  });

  it('Given missing identity or ordering, when migrated, then blocks automatic synchronization', () => {
    const legacy = legacyDb([{ uuid: 'unknown', type: 'sale:create', payload: JSON.stringify({ total: '1.00', lines: [] }), idempotency_key: 'unknown-id' }]);
    const result = migrateLegacyJournal({ legacyPath: legacy, targetPath: path.join(root, 'v3.db') });
    const db = new Database(result.targetPath, { readonly: true });
    expect(db.prepare(`SELECT status FROM offline_event_projection WHERE event_id = 'unknown'`).get()).toEqual({ status: 'migration_review' });
    expect(db.prepare(`SELECT COUNT(*) AS count FROM migration_review`).get()).toEqual({ count: 1 });
    db.close();
  });

  it('Given a v3 event, when a projection changes, then immutable event payload and hash remain unchanged', () => {
    const file = path.join(root, 'v3.db');
    const journal = createJournalV3(file);
    const event = journal.append({ event_id: 'e-1', tenant_id: 't-1', device_id: 'd-1', branch_id: 'b-1', cash_session_id: 'c-1', operator_id: 'o-1', local_sequence: 1, event_type: 'offline.sale.completed', event_version: 1, idempotency_key: 'k-1', occurred_at: '2026-08-10T10:00:00.000Z', payload: JSON.stringify({ total: '1.00' }) });
    const original = { payload: event.payload, payload_hash: event.payload_hash };
    journal.setProjection(event.event_id, 'synced');
    expect(journal.getEvent(event.event_id)).toMatchObject({ ...original, event_id: event.event_id });
    expect(() => journal.deleteEvent(event.event_id)).toThrow('immutable');
    journal.close();
  });
});
