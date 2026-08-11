import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { createJournalV3, payloadHash, type OfflineEventType } from './journalV3';

export type MigrationPhase = 'backup_created' | 'schema_created' | 'rows_copied' | 'validated' | 'activated';
const phases: MigrationPhase[] = ['backup_created', 'schema_created', 'rows_copied', 'validated', 'activated'];

export interface MigrationOptions {
  legacyPath: string;
  targetPath: string;
  failAfterPhase?: MigrationPhase;
}

export interface MigrationResult {
  phase: MigrationPhase;
  targetPath: string;
  backupPath: string;
  reviewCount: number;
}

interface LegacyRow {
  id: number;
  uuid: string;
  type: string;
  payload: string;
  idempotency_key: string;
  status: string;
  created_at: string;
}

interface PersistedMigrationState {
  phase: MigrationPhase | null;
  snapshotPath: string | null;
  backupPath: string | null;
}

export function migrateLegacyJournal(options: MigrationOptions): MigrationResult {
  const targetPath = options.targetPath;
  const defaultBackupPath = `${options.legacyPath}.migration-backup`;
  const lockPath = `${options.legacyPath}.migration.lock`;
  let lockFd: number | undefined;
  let state: ReturnType<typeof phaseStore> | undefined;
  let targetJournal: ReturnType<typeof createJournalV3> | undefined;

  try {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    lockFd = fs.openSync(lockPath, 'wx');
    state = phaseStore(targetPath);

    const persisted = state.get();
    const backupPath = persisted.backupPath ?? defaultBackupPath;
    const snapshotPath = persisted.snapshotPath ?? path.join(backupPath, path.basename(options.legacyPath));

    if (persisted.phase === 'activated') {
      return { phase: 'activated', targetPath, backupPath, reviewCount: countReviews(targetPath) };
    }

    if (!fs.existsSync(options.legacyPath)) {
      if (persisted.phase === 'backup_created') {
        return completeFromSnapshot(snapshotPath, targetPath, backupPath, persisted.phase, options.failAfterPhase, state);
      }
      targetJournal = createJournalV3(targetPath);
      state.set('activated');
      return { phase: 'activated', targetPath, backupPath, reviewCount: 0 };
    }

    if (persisted.phase && phases.indexOf(persisted.phase) >= phases.indexOf('backup_created')) {
      if (!fs.existsSync(snapshotPath)) throw new Error(`migration snapshot missing: ${snapshotPath}`);
      return completeFromSnapshot(snapshotPath, targetPath, backupPath, persisted.phase, options.failAfterPhase, state);
    }

    createFrozenSnapshot(options.legacyPath, backupPath);
    state.set('backup_created', snapshotPath, backupPath);
    if (options.failAfterPhase === 'backup_created') throw new Error('simulated migration interruption');

    return completeFromSnapshot(snapshotPath, targetPath, backupPath, 'backup_created', options.failAfterPhase, state);
  } finally {
    try { targetJournal?.close(); } catch { /* already closed */ }
    try { state?.close(); } catch { /* already closed */ }
    if (lockFd !== undefined) fs.closeSync(lockFd);
    try { fs.unlinkSync(lockPath); } catch { /* retry can remove an absent lock */ }
  }

  function completeFromSnapshot(
    snapshotFile: string,
    finalTargetPath: string,
    finalBackupPath: string,
    currentPhase: MigrationPhase | null,
    failAfterPhase: MigrationPhase | undefined,
    stateStore: ReturnType<typeof phaseStore>,
  ): MigrationResult {
    targetJournal = createJournalV3(finalTargetPath);
    const targetDb = (targetJournal as unknown as { db: Database.Database }).db;
    const rows = readLegacyRows(snapshotFile);

    advance('schema_created', currentPhase, failAfterPhase, stateStore);

    const insertReview = targetDb.prepare(
      'INSERT OR IGNORE INTO migration_review (event_id,legacy_id,reason,raw_payload,exported_at) VALUES (?,?,?,?,?)',
    );
    const insertEvent = targetDb.prepare(
      'INSERT OR IGNORE INTO offline_events (event_id,device_id,tenant_id,branch_id,cash_session_id,operator_id,local_sequence,event_type,event_version,idempotency_key,occurred_at,payload,payload_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    );
    const insertProjection = targetDb.prepare(
      'INSERT OR IGNORE INTO offline_event_projection (event_id,status,updated_at) VALUES (?, ?, ?)',
    );

    const copy = targetDb.transaction(() => {
      for (const row of rows) {
        const parsed = parsePayload(row.payload);
        const identity = parsed && hasIdentity(parsed) ? parsed : null;
        const incompatible = row.type !== 'sale:create';
        const eventType: OfflineEventType = incompatible ? 'legacy.incompatible' : 'offline.sale.completed';
        const eventId = row.uuid;

        if (!identity || incompatible) {
          insertEvent.run(
            eventId,
            identity?.device_id ?? 'legacy-review',
            identity?.tenant_id ?? 'legacy-review',
            identity?.branch_id ?? 'legacy-review',
            identity?.cash_session_id ?? 'legacy-review',
            identity?.operator_id ?? 'legacy-review',
            identity?.local_sequence ?? row.id,
            eventType,
            1,
            row.idempotency_key,
            row.created_at,
            row.payload,
            payloadHash(row.payload),
          );
          insertProjection.run(
            eventId,
            row.status === 'conflict' ? 'conflict_requires_review' : 'migration_review',
            new Date().toISOString(),
          );
          insertReview.run(
            eventId,
            row.id,
            incompatible ? 'cash-session event is legacy incompatible' : 'missing identity or ordering',
            row.payload,
            row.created_at,
          );
          continue;
        }

        insertEvent.run(
          eventId,
          identity.device_id,
          identity.tenant_id,
          identity.branch_id,
          identity.cash_session_id,
          identity.operator_id,
          identity.local_sequence,
          eventType,
          1,
          row.idempotency_key,
          row.created_at,
          row.payload,
          payloadHash(row.payload),
        );
        insertProjection.run(
          eventId,
          row.status === 'synced' ? 'synced' : row.status === 'conflict' ? 'conflict_requires_review' : 'pending',
          new Date().toISOString(),
        );
      }
    });
    copy();

    advance('rows_copied', stateStore.get().phase, failAfterPhase, stateStore);

    const count = (targetDb.prepare('SELECT COUNT(*) AS count FROM offline_events').get() as { count: number }).count;
    const reviews = (targetDb.prepare('SELECT COUNT(*) AS count FROM migration_review').get() as { count: number }).count;
    if (count < rows.length) throw new Error('migration validation count mismatch');

    advance('validated', stateStore.get().phase, failAfterPhase, stateStore);
    advance('activated', stateStore.get().phase, failAfterPhase, stateStore);

    return { phase: 'activated', targetPath: finalTargetPath, backupPath: finalBackupPath, reviewCount: reviews };
  }
}

function createFrozenSnapshot(legacyPath: string, backupPath: string): void {
  fs.mkdirSync(backupPath, { recursive: true });
  const source = new Database(legacyPath);

  try {
    source.pragma('busy_timeout = 5000');
    source.pragma('locking_mode = EXCLUSIVE');
    source.pragma('wal_checkpoint(TRUNCATE)');
    source.exec('BEGIN EXCLUSIVE');

    for (const suffix of ['', '-wal', '-shm']) {
      const file = `${legacyPath}${suffix}`;
      if (fs.existsSync(file)) fs.copyFileSync(file, path.join(backupPath, path.basename(file)));
    }

    source.exec('COMMIT');
  } catch (error) {
    try { source.exec('ROLLBACK'); } catch { /* transaction may already be closed */ }
    throw error;
  } finally {
    source.close();
  }
}

function readLegacyRows(file: string): LegacyRow[] {
  const db = new Database(file, { readonly: true });
  try {
    return db.prepare(
      'SELECT id,uuid,type,payload,idempotency_key,status,created_at FROM operation_journal ORDER BY id',
    ).all() as LegacyRow[];
  } finally {
    db.close();
  }
}

function countReviews(file: string): number {
  if (!fs.existsSync(file)) return 0;
  const db = new Database(file, { readonly: true });
  try {
    const hasTable = db.prepare(
      "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'migration_review'",
    ).get() as { present: 1 } | undefined;
    if (!hasTable) return 0;
    return (db.prepare('SELECT COUNT(*) AS count FROM migration_review').get() as { count: number }).count;
  } finally {
    db.close();
  }
}

function parsePayload(raw: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function hasIdentity(
  payload: Record<string, unknown>,
): payload is Record<string, string | number> & {
  device_id: string;
  tenant_id: string;
  branch_id: string;
  cash_session_id: string;
  operator_id: string;
  local_sequence: number;
} {
  return ['device_id', 'tenant_id', 'branch_id', 'cash_session_id', 'operator_id'].every(
    (key) => typeof payload[key] === 'string' && payload[key],
  ) && typeof payload.local_sequence === 'number' && payload.local_sequence > 0;
}

function phaseStore(file: string): {
  get: () => PersistedMigrationState;
  set: (phase: MigrationPhase, snapshotPath?: string | null, backupPath?: string | null) => void;
  close: () => void;
} {
  const db = new Database(file);
  db.exec('CREATE TABLE IF NOT EXISTS journal_migrations (id INTEGER PRIMARY KEY CHECK(id = 1), phase TEXT NOT NULL, updated_at TEXT NOT NULL)');

  const columns = new Set(
    (db.prepare('PRAGMA table_info(journal_migrations)').all() as Array<{ name: string }>).map((column) => column.name),
  );
  if (!columns.has('snapshot_path')) db.exec('ALTER TABLE journal_migrations ADD COLUMN snapshot_path TEXT');
  if (!columns.has('backup_path')) db.exec('ALTER TABLE journal_migrations ADD COLUMN backup_path TEXT');

  return {
    get: () => {
      const row = db.prepare(
        'SELECT phase,snapshot_path,backup_path FROM journal_migrations WHERE id = 1',
      ).get() as { phase: MigrationPhase; snapshot_path: string | null; backup_path: string | null } | undefined;

      return {
        phase: row?.phase ?? null,
        snapshotPath: row?.snapshot_path ?? null,
        backupPath: row?.backup_path ?? null,
      };
    },
    set: (phase, snapshotPath, backupPath) => {
      db.prepare(`
        INSERT INTO journal_migrations (id,phase,snapshot_path,backup_path,updated_at)
        VALUES (1,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET
          phase = excluded.phase,
          snapshot_path = COALESCE(excluded.snapshot_path, journal_migrations.snapshot_path),
          backup_path = COALESCE(excluded.backup_path, journal_migrations.backup_path),
          updated_at = excluded.updated_at
      `).run(phase, snapshotPath ?? null, backupPath ?? null, new Date().toISOString());
    },
    close: () => db.close(),
  };
}

function advance(
  phase: MigrationPhase,
  current: MigrationPhase | null,
  failAfter: MigrationPhase | undefined,
  state: { set: (phase: MigrationPhase, snapshotPath?: string | null, backupPath?: string | null) => void },
): void {
  if (current && phases.indexOf(current) >= phases.indexOf(phase)) return;
  state.set(phase);
  if (failAfter === phase) throw new Error('simulated migration interruption');
}
