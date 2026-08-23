# R8 Finalization Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the technical gates of Sprint R8 with trustworthy observability, reproducible backup/restore, meaningful smoke tests, clean migrations, and evidence-backed release documentation.

**Architecture:** Keep observability aggregates explicitly global and read-only, while protecting destructive monitoring actions with Django authorization. Use PostgreSQL custom-format compression without external gzip, make restore validation fail closed except for one explicitly recognized PG18-to-PG16 compatibility warning, and make smoke tests distinguish availability from authenticated functional readiness.

**Tech Stack:** Django 5/DRF, pytest, PostgreSQL 16/18 client tools, PowerShell 5.1+, Redis, Electron/Vitest, detect-secrets.

---

### Task 1: Trustworthy operational metrics

**Files:**
- Modify: `backend/config/observability.py`
- Modify: `backend/monitoring/views.py`
- Modify: `backend/tests/test_operational_metrics.py`
- Modify: `backend/tests/test_observability.py`

- [ ] Add a failing test proving global fiscal metrics include documents outside request tenant context.
- [ ] Add failing tests proving anonymous metrics reset is denied and an authorized staff user can reset in DEBUG/test.
- [ ] Run the focused tests and confirm the expected failures.
- [ ] Aggregate fiscal documents through the explicit global manager.
- [ ] Require authenticated staff and DEBUG for metrics reset.
- [ ] Re-run focused tests until green.

### Task 2: Fail-closed backup and restore

**Files:**
- Modify: `infra/scripts/backup_postgres.ps1`
- Modify: `infra/scripts/restore_postgres_verify.ps1`
- Create: `infra/scripts/tests/r8_backup_restore.Tests.ps1`
- Modify: `docs/09_Operations/RUNBOOK_BACKUP_RESTORE.md`

- [ ] Add static/behavior checks proving backup does not require gzip and restore rejects unclassified pg_restore errors.
- [ ] Run the checks and confirm they fail against the original scripts.
- [ ] Produce a `.dump` using pg_dump custom-format native compression and verify tool exit codes.
- [ ] Validate backup checksum before restore when a checksum file exists.
- [ ] Allow only the exact PG18 `transaction_timeout` compatibility warning with exactly one ignored restore error; fail for all other non-zero exits.
- [ ] Require critical tables, migrations and at least one qualifying index.
- [ ] Run a real disposable backup/restore and verify cleanup.

### Task 3: Meaningful readiness and smoke gates

**Files:**
- Modify: `backend/tests/test_readiness.py`
- Modify: `infra/scripts/smoke_backend.ps1`
- Modify: `infra/scripts/smoke_pdv.ps1`

- [ ] Add negative readiness tests for Redis and database failures.
- [ ] Require correlation ID on health/readiness responses.
- [ ] Split unauthenticated availability checks from authenticated functional checks; require 2xx for functional endpoints when credentials are supplied.
- [ ] Ensure the smoke fails if credentials are absent in strict functional mode.
- [ ] Execute backend and PDV smoke tests against the E2E environment.

### Task 4: Environment and regression gates

**Files:**
- No production source changes expected unless a failure is directly attributable to R8.

- [ ] Apply pending migrations to the disposable/local E2E database.
- [ ] Run focused R8 backend tests, Ruff, mypy, Django check and migration checks.
- [ ] Run the complete backend suite.
- [ ] Run PDV Vitest, typecheck, lint, build and PDV smoke.
- [ ] Run frontend Vitest, typecheck, lint and build.
- [ ] Run detect-secrets on tracked files and review findings without exposing values.

### Task 5: Evidence and isolated commit

**Files:**
- Modify: `docs/09_Operations/OBSERVABILITY_DASHBOARDS.md`
- Modify: `docs/09_Operations/PILOT_READINESS_CHECKLIST.md`
- Modify: `docs/09_Operations/RUNBOOK_INCIDENT_RESPONSE.md`
- Modify: `docs/09_Operations/RUNBOOK_ROLLBACK.md`
- Modify: `docs/10_Releases/SPRINT-008_Pilot_Observability_Hardening_Final_Report.md`
- Modify: `docs/PRD.md`

- [ ] Correct invalid SQL/table/field names and align retention/RTO/RPO documentation with scripts.
- [ ] Record fresh raw outputs, limitations and separation between technical closure and pilot human GO.
- [ ] Keep Product/Support/Security signatures blank; never infer approval.
- [ ] Run `git diff --check` and inspect the exact staged file list.
- [ ] Create one isolated R8 finalization commit; do not push.
