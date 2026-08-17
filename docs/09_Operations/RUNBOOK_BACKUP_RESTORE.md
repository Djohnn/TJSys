# Backup & Restore Runbook

## Overview

PostgreSQL backup/restore for the TJSys pilot. All scripts read credentials
from environment variables — **never** embed secrets in scripts.

## Prerequisites

- PostgreSQL client tools: `pg_dump`, `pg_restore`, `psql`
- Environment variables:
  ```powershell
  $env:PGDATABASE = "tjsys"
  $env:PGUSER = "tjsys_app"
  $env:PGPASSWORD = "<your-password>"
  $env:PGHOST = "localhost"
  $env:PGPORT = "5432"
  ```
- Write permission to the backup directory

## Backup

### Automated

Run from the repository root:

```powershell
cd infra/scripts
./backup_postgres.ps1
```

By default, backups are stored in `./backups/` with filename
`tjsys_YYYYMMDD_HHmmss.dump`. Retention: 7 days (auto-cleanup). O formato
custom já usa compressão nativa do PostgreSQL e não depende de `gzip`.

### Manual

```powershell
$env:PGPASSWORD = "<password>"
pg_dump -h localhost -p 5432 -U tjsys_app -F c -Z 9 -f backup.dump tjsys
```

### Expected output

```
=== PostgreSQL Backup ===
Database: zyrp
Host: localhost:5432
Output: C:\ERP\infra\scripts\backups\zyrp_20260719_120000.dump
[PASS] Backup completed: ...\zyrp_20260719_120000.dump
       Size: 12.34 MB
=== Backup finished at 2026-07-19 12:00:00 ===
```

## Restore Verification

Run from the repository root:

```powershell
cd infra/scripts
./restore_postgres_verify.ps1 -BackupFile .\backups\tjsys_20260812_174300.dump
```

This script:
1. Verifica o checksum SHA-256, quando presente
2. Cria o banco descartável `tjsys_restore_<timestamp>`
3. Restaura o dump e falha para erros fora da allowlist de compatibilidade
4. Verifica tabelas críticas, consultas e índices
5. Remove o banco descartável

### Expected output

```
=== Restore Verification ===
[PASS] Disposable database created
[PASS] Restore completed
[PASS] All key tables verified
[CLEANUP] Done
=== Restore verification finished at 2026-07-19 12:05:00 ===
```

## Rollback with Restore

If a rollback is needed:

1. Stop the application
2. Identify the last good backup
3. Create a backup of the current state (point-in-time recovery)
4. Restore the last good backup:

```powershell
$env:PGPASSWORD = "<password>"
dropdb -h localhost -U postgres zyrp
createdb -h localhost -U postgres zyrp
pg_restore -h localhost -U postgres -d zyrp -c ./backups/zyrp_20260719_060000.dump
```

5. Verify restore with `./restore_postgres_verify.ps1`
6. Restart the application
7. Verify health: `GET /health/` → 200

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| `pg_dump: not found` | PostgreSQL client not installed | Install via `choco install postgresql` or add to PATH |
| `FATAL: password authentication failed` | Wrong PGPASSWORD | Check DB_PASSWORD env var |
| `CREATE DATABASE: permission denied` | User lacks CREATEDB | `ALTER USER postgres CREATEDB;` |
| `ERROR: must be owner of schema public` | Wrong user | Restore with the schema owner |
| Restore fails on extension | Extension not available | `CREATE EXTENSION IF NOT EXISTS ...` first |
