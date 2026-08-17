# R10 Integrity Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Sprint 10 receiving, idempotency, immutability, and payable provenance safe under invalid and concurrent requests.

**Architecture:** Purchasing owns receipt normalization and locks the purchase order before calculating pending balances. Financial owns payable persistence and accepts explicit optional purchasing provenance through its service boundary.

**Tech Stack:** Django, Django REST Framework, PostgreSQL, pytest-django, Ruff, mypy.

---

### Task 1: Canonical and atomic receiving

**Files:**
- Modify: `backend/purchasing/services.py`
- Modify: `backend/purchasing/models.py`
- Create: `backend/purchasing/migrations/0006_r10_receiving_integrity.py`
- Test: `backend/tests/test_purchase_receiving_services.py`

- [ ] Add BDD tests proving duplicate rows are aggregated, divergent replay raises `DuplicateIdempotencyKey`, empty input is rejected, and receipt keys are unique per tenant.
- [ ] Run the new tests and capture the expected RED failures.
- [ ] Lock `PurchaseOrder` with `select_for_update()`, normalize rows before validation, calculate the hash before replay lookup, and add conditional unique constraints.
- [ ] Run the receiving tests and capture GREEN output.

### Task 2: Approved-order API immutability

**Files:**
- Modify: `backend/purchasing/views.py`
- Test: `backend/tests/test_purchasing_api.py`

- [ ] Add API tests for PATCH/DELETE on approved orders and DELETE on approved-order items.
- [ ] Run the tests and capture RED responses showing the current mutation succeeds.
- [ ] Add explicit draft-state guards to `perform_update()` and `perform_destroy()` and return Problem Details through DRF validation.
- [ ] Run the API tests and capture GREEN output.

### Task 3: Payable provenance

**Files:**
- Modify: `backend/financial/models.py`
- Modify: `backend/financial/services.py`
- Modify: `backend/purchasing/services.py`
- Create: `backend/financial/migrations/0004_payable_purchase_provenance.py`
- Test: `backend/tests/test_purchase_receiving_services.py`

- [ ] Add a test asserting the payable references the exact supplier, order, and receipt.
- [ ] Run it and capture the expected RED missing attributes.
- [ ] Add nullable protected foreign keys, validate their tenant IDs in `create_payable()`, and pass them from purchasing.
- [ ] Run the provenance test and capture GREEN output.

### Task 4: API validation and final gates

**Files:**
- Modify: `backend/purchasing/views.py`
- Modify: `backend/tests/test_purchasing_api.py`
- Modify: `docs/10_Releases/SPRINT-010_Purchasing_Receiving_Payables_Final_Report.md`

- [ ] Add tests for empty items and invalid quantities/costs returning non-5xx Problem Details.
- [ ] Run them and capture RED output.
- [ ] Validate the request before Decimal conversion/service dispatch and update the final report with fresh evidence.
- [ ] Run focused R10 tests, Ruff, mypy, `makemigrations --check --dry-run`, `migrate --check`, Django check, and `git diff --check`.
- [ ] Update graphify, review the scoped diff, and create isolated commits.
