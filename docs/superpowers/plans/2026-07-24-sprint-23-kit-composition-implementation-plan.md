# Sprint 23 Kit Composition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> to implement this plan task-by-task. Option 1 is locked; do not switch to
> superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement D1 from `2026-07-24-sprint-22-catalog-refactoring-design.md` in full:
kit products composed of other products, with automatic component stock decrement on
sale completion, as detailed in
`2026-07-24-sprint-23-kit-composition-design.md`.

**Architecture:** New `ProductComposition` aggregate inside `catalog`. No model changes
in `sales`. `inventory` gains a consumer for `SaleCompleted` that resolves kit
composition through Catalog's public contract and generates one outbound
`StockMovement` per component, inside a single atomic transaction per sale.

**Tech Stack:** Same as prior Catalog/Inventory/Sales sprints — Django/DRF,
PostgreSQL/RLS, Celery/Outbox, pytest, OpenAPI-generated TypeScript client, Vitest, MSW,
Playwright.

---

## Execution protocol

Prerequisite: Sprint 22 is merged and green, and `product_kind` field exists on
`Product`. Every decision D-KIT-1 through D-KIT-5 in the design document must be marked
resolved with an identified approver before Task 1 starts. If any is still "pendente"
when this plan is picked up, stop and request the decision — do not assume a default.

Execute on `feat/sprint-23-kit-composition`. Decimal policy, idempotency policy, and
RLS/tenant isolation rules from SAD-001, DDD-001 and API-001 remain unchanged and apply
to every new field, event and endpoint below.

## Locked decisions (inherited, not open for reinterpretation)

- Money and quantity remain decimal strings; no `float` anywhere new.
- `Inventory` depends on `Catalog`; `Catalog` never depends on `Inventory` or `Sales`.
- Stock changes only via `StockMovement` (DDD-001 invariant) — kit decomposition must
  produce movements, never a direct balance write.
- Completed sales are never edited (DDD-001 invariant) — decomposition failure must
  prevent sale completion, not follow it with a correction.
- Every critical event/command carries an idempotent ID (DDD-001 invariant) —
  `SaleCompleted` reprocessing must not duplicate component movements.

## Decisions required before Task 1 (from design Section 3)

- [x] D-KIT-1 — kit stock ownership: **approved** — virtual-only, kit never holds its own stock; always decomposed at sale time.
- [x] D-KIT-2 — nested kits: **approved** — forbidden; a kit component cannot itself be a kit.
- [x] D-KIT-3 — insufficient component stock: **approved** — blocks the whole sale atomically; no partial decomposition.
- [x] D-KIT-4 — composition versioning: **approved** — versioned like `ProductUnit`; immutable once used by a completed sale.
- [x] D-KIT-5 — decomposition logic ownership: **approved** — lives in `Inventory`, which consumes `SaleCompleted` and calls Catalog's `resolve_composition` contract.

All five decisions are approved per the recommendations recorded in the design
document's Section 3. **Task 1 is cleared to start.**

---

### Task 1: ProductComposition domain and migration

**Files:**
- Modify: `backend/catalog/domain/product.py` (or equivalent aggregate module)
- Create: `backend/catalog/models.py` → `ProductComposition`
- Create: `backend/catalog/migrations/00XX_product_composition.py`
- Create: `backend/catalog/tests/test_product_composition.py`

- [ ] Write unit tests: cycle detection (kit cannot compose itself, directly or
  indirectly), positive-decimal quantity validation, versioning/vigência rules mirroring
  `ProductUnit`, rejection of a kit component that is itself a kit (if D-KIT-2 = forbid).
- [ ] Run focused tests; expect RED.
- [ ] Implement `ProductComposition` per approved D-KIT-2 and D-KIT-4.
- [ ] Write backward-compatible migration.
- [ ] Run focused tests, `manage.py makemigrations --check`, Ruff, mypy; expect PASS.
- [ ] Commit with `feat(catalog): add product composition aggregate`.

### Task 2: Catalog application services and API

**Files:**
- Modify: `backend/catalog/application/` (composition use cases)
- Modify: `backend/catalog/interfaces/serializers.py`, `views.py`, `urls.py`
- Create: `backend/tests/test_catalog_composition_api.py`

- [ ] Write BDD tests for `/products/{id}/composition/` (list, create, version), role
  denial, cross-tenant, RLS, and `kit_without_active_composition` validation when a kit
  has no active composition.
- [ ] Run focused tests; expect RED.
- [ ] Implement `resolve_composition(product_id, at)` as the public read contract other
  modules will use (this is the seam `inventory` calls in Task 3 — keep it a stable,
  documented interface, not an internal query).
- [ ] Add Outbox event `catalog.product.composition_changed` in the same transaction as
  composition create/version.
- [ ] Regenerate OpenAPI schema and TypeScript client.
- [ ] Run focused tests; expect PASS.
- [ ] Commit with `feat(catalog): expose composition API and resolution contract`.

### Task 3: Inventory consumer — sale decomposition

**Files:**
- Create: `backend/inventory/application/kit_decomposition.py` (or equivalent service)
- Modify: existing `SaleCompleted` consumer in `backend/inventory/`
- Create: `backend/inventory/tests/test_kit_decomposition.py`

- [ ] Write tests: kit item in a completed sale generates one outbound `StockMovement`
  per component with correct quantity (sold quantity × composition factor); no
  movement is generated for the kit itself; insufficient stock in any component blocks
  the entire decomposition atomically (D-KIT-3); reprocessing the same `SaleCompleted`
  event ID does not duplicate movements (idempotency); non-kit items continue to behave
  exactly as before this sprint (regression).
- [ ] Run focused tests; expect RED.
- [ ] Implement the consumer calling Catalog's `resolve_composition` contract from
  Task 2, generating movements inside a single `transaction.atomic()` block per sale.
- [ ] Ensure movement records reference the kit product, the sale, and the composition
  version applied, for audit reconstruction.
- [ ] Run focused tests; expect PASS.
- [ ] Commit with `feat(inventory): decompose kit sales into component stock movements`.

### Task 4: Frontend catalog composition screens

**Files:**
- Create: `frontend/src/catalog/ProductCompositionPage.tsx`,
  `ProductCompositionForm.tsx`
- Modify: `frontend/src/catalog/ProductForm.tsx`, `catalogApi.ts`, `catalogSchemas.ts`
- Modify: `frontend/src/catalog/catalogPages.test.tsx`

- [ ] Write tests for: composition CRUD screen (visible only when
  `product_kind = kit`), validation error display for `kit_without_active_composition`
  and cycle rejection, decimal-string quantity inputs.
- [ ] Run focused tests; expect RED.
- [ ] Implement screens reusing existing decimal/idempotency/URL-filter conventions.
- [ ] Run tests, typecheck and axe; expect PASS.
- [ ] Commit with `feat(frontend): add kit composition management`.

### Task 5: Sales-side surfacing and E2E

**Files:**
- Modify: relevant Sales/PDV item-selection component to surface "produto é kit" and,
  on `insufficient_component_stock`, show which components are short (read-only
  display; no new Sales domain logic)
- Create: `frontend/e2e/kit-composition.spec.ts`
- Modify: `docs/PRD.md`
- Create: `docs/10_Releases/SPRINT-023_Kit_Composition_Final_Report.md`

- [ ] Write E2E: create kit with 3 components → sell kit → confirm 3 component stock
  movements exist and no kit movement exists; attempt sale with one component
  insufficient → confirm sale is blocked and no partial movements are created; edit
  composition after a sale exists → confirm the historical sale's audit trail still
  shows the original composition version.
- [ ] Run full backend/frontend regression suite, including Sprints 2, 3, 4, 18 and 22
  test files, unchanged and passing.
- [ ] Run three-browser E2E; capture raw output.
- [ ] Update PRD Sprint 23 entry and write the final report, including which of
  D-KIT-1 through D-KIT-5 were approved.
- [ ] Commit with `feat: sprint 23 - composicao de kit`.
