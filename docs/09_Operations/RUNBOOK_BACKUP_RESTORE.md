# Backup & Restore Runbook

## Overview

PostgreSQL backup/restore for the TJSys pilot. All scripts read credentials
from environment variables — **never** embed secrets in scripts.

## Prerequisites

- PostgreSQL client tools: `pg_dump`, `pg_restore`, `psql`
- Environment variables:
  ```powershell
  $env:DB_NAME = "tjsys"
  $env:DB_USER = "postgres"
  $env:DB_PASSWORD = "<your-password>"
  $env:DB_HOST = "localhost"     # optional, default localhost
  $env:DB_PORT = "5432"          # optional, default 5432
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
`tjsys_YYYYMMDD_HHmmss.dump`. Retention: 30 days (auto-cleanup).

### Manual

```powershell
$env:PGPASSWORD = "<password>"
pg_dump -h localhost -p 5432 -U postgres -F c -Z 9 -f backup.dump tjsys
```

### Expected output

```
=== PostgreSQL Backup ===
Database: tjsys
Host: localhost:5432
Output: C:\ERP\infra\scripts\backups\tjsys_20260719_120000.dump
[PASS] Backup completed: ...\tjsys_20260719_120000.dump
       Size: 12.34 MB
=== Backup finished at 2026-07-19 12:00:00 ===
```

## Restore Verification

Run from the repository root:

```powershell
cd infra/scripts
./restore_postgres_verify.ps1 .\backups\tjsys_20260719_120000.dump
```

This script:
1. Creates a disposable database `verify_restore_<timestamp>`
2. Restores the dump into it
3. Verifies key tables exist and have rows
4. Drops the disposable database

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
dropdb -h localhost -U postgres tjsys
createdb -h localhost -U postgres tjsys
pg_restore -h localhost -U postgres -d tjsys -c ./backups/tjsys_20260719_060000.dump
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
