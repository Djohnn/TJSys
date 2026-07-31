# Sprint 30 Catalog Hardening Acceptance Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate and release the integrated Catalog evolution from Sprints 23–29 with security, accessibility, performance and rollback evidence.

**Architecture:** Add no new business capability. Close gaps found by objective audits, keep remediation scoped to affected modules, and produce a release report containing raw verification evidence.

**Tech Stack:** Django checks/pytest/Ruff/mypy, React Vitest/TypeScript/Vite, Playwright, axe-core, PDF inspection and PostgreSQL migration rehearsal.

---

### Task 1: Migration and data reconciliation rehearsal

**Files:**
- Create: `backend/catalog/management/commands/audit_catalog_sprints_23_29.py`
- Create: `backend/tests/test_catalog_data_audit.py`
- Create: `docs/09_Operations/CATALOG_SPRINTS_23_29_ROLLBACK.md`

- [ ] Write RED tests for orphan images, invalid primary codes, classifier cross-tenant links and channel profile without product.
- [ ] Run focused pytest; expected: FAIL because audit command is absent.
- [ ] Implement a read-only command returning non-zero on inconsistencies; never auto-delete or auto-reassign data.
- [ ] Run migrations forward on a disposable test database, run audit, rehearse documented rollback and migrate forward again.
- [ ] Commit: `test(catalog): add migration reconciliation audit`.

### Task 2: Security and authorization audit

**Files:**
- Create: `backend/tests/test_catalog_sprints_23_29_security.py`
- Modify: affected `backend/catalog/permissions.py`, serializers or views only when a RED test proves a gap

- [ ] Parameterize every new endpoint for anonymous, viewer, manager and cross-tenant access.

```python
@pytest.mark.parametrize('path', NEW_CATALOG_ENDPOINTS)
def test_cross_tenant_resource_is_not_disclosed(api_client, path, other_tenant_headers):
    response = api_client.get(path, headers=other_tenant_headers)
    assert response.status_code in {403, 404}
```

- [ ] Run security suite; expected: RED for real gaps or PASS if contracts are already complete.
- [ ] Fix only proven gaps and rerun until 0 failures.
- [ ] Run deploy check and secret scan; expected: no critical/high finding.
- [ ] Commit: `fix(catalog): close sprint 23 to 29 security gaps` only if code changed; otherwise commit the audit tests.

### Task 3: Accessibility, responsiveness and performance

**Files:**
- Modify: `frontend/e2e/accessibility.spec.ts`
- Create: `frontend/e2e/catalog-responsive.spec.ts`
- Create: `frontend/e2e/catalog-performance.spec.ts`
- Modify: affected frontend components only when tests prove a gap

- [ ] Add axe scans for all seven Catalog entries and keyboard traversal of product steps/modals.
- [ ] Add viewport checks at 375×812 and 1440×900; assert media-above-fields mobile and media-left desktop.
- [ ] Add budgets: initial Catalog route JS budget from current Vite baseline plus at most 10%, and product list interactive within the project E2E timeout on seeded 1,000-item data.
- [ ] Run Playwright/axe; fix proven issues without fixed sleeps; expected: 0 critical axe violations and all budgets pass.
- [ ] Commit: `fix(frontend): harden catalog accessibility and performance`.

### Task 4: Full regression matrix

**Files:**
- Create: `docs/10_Releases/SPRINT-030_Catalog_Hardening_Acceptance_Final_Report.md`
- Modify: `docs/PRD.md`
- Modify: `docs/DOCUMENT_INDEX.md`

- [ ] Run backend:
  `..\.venv\Scripts\python.exe manage.py check --deploy`;
  `..\.venv\Scripts\python.exe manage.py makemigrations --check`;
  `..\.venv\Scripts\python.exe -m pytest -q`.
  Expected: exit 0 and 0 failures.
- [ ] Run frontend: `npm test -- --run && npm run typecheck && npm run build`.
  Expected: exit 0 and 0 failures.
- [ ] Run PDV: `npm test -- --run && npm run build` in `pdv`.
  Expected: exit 0 and 0 failures.
- [ ] Run Playwright Catalog suite on Chromium, Firefox and WebKit.
  Expected: all projects pass; any unsupported browser requires an approved exception recorded in the report.
- [ ] Paste exact counts, durations and warnings into the final report; do not summarize away failures.
- [ ] Mark PRD items only after evidence and commit with `feat: sprint 30 - aceite integrado do catalogo`.
