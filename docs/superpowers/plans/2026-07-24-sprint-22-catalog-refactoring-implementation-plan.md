# Sprint 22 Catalog Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> to implement this plan task-by-task. Option 1 is locked; do not switch to
> superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Product aggregate and related Catalog contracts with the
descriptive, pricing-tier, fiscal-registration and inventory-flag attributes requested
in `Spec_cadastro_produto_refatoração`, as approved in
`2026-07-24-sprint-22-catalog-refactoring-design.md`, without breaking any contract,
event, or data from Sprint 2 or Sprint 18.

**Architecture:** All changes stay inside the `catalog` Django app (domain, application,
infrastructure, interfaces, tests), except the inventory flag, which is written in
Catalog and read by `inventory` through its existing public contract. `fiscal` app is
not modified in this sprint; Catalog only stores registration data consulted by Fiscal
later.

**Tech Stack:** Same as Sprint 2/18 — Django/DRF, PostgreSQL/RLS, Celery/Outbox,
pytest, OpenAPI-generated TypeScript client, Vitest, MSW, Playwright.

---

## Execution protocol

Prerequisite: Sprints 0–21 are merged and green, and every open decision in Section 3
of the design document (D1–D5) is marked resolved with an identified approver. If any of
D1–D5 is still "pendente" when this plan is picked up, **stop and request the decision**
before running Task 1 — do not assume a default.

Execute on `feat/sprint-22-catalog-refactoring`. Decimal policy, idempotency policy and
RLS/tenant isolation rules from SAD-001 and API-001 remain unchanged and apply to every
new field and endpoint below.

## Locked decisions (inherited, not open for reinterpretation)

- Money and quantity are decimal strings end to end; no `float` anywhere new.
- Product is never physically deleted; deactivation only.
- `Unit` stays an existing configurable entity (D6) — the product form selects an
  existing `Unit`, it does not define a new enum.
- `Category` stays hierarchical (D7) — sub-category is `Category.parent`, not a new
  field.
- Fiscal registration data does not block non-fiscal product edits (Sprint 18 rule).
- Inventory balance/movement logic stays in `inventory`; Catalog never gains its own
  stock ledger.

## Decisions required before Task 1 (from design Section 3)

- [ ] D1 — product kind / kit: confirm option (a), (b) or (c) with approver.
- [ ] D2 — wholesale price tier + cost: confirm option (a), (b) or (c) with approver.
- [ ] D3 — fiscal registration data placement: confirm option (a), (b) or (c) with approver.
- [ ] D4 — inventory-control flag ownership: confirm option (a) or (b) with approver.
- [ ] D5 — brand/model/tag/scale code modeling: confirm option (a) or (b) with approver.

**Do not proceed to Task 1 until this checklist is fully checked and each decision is
recorded back into the design document's Section 3 table.**

---

### Task 1: Domain and migration for approved extensions

**Files:**
- Modify: `backend/catalog/domain/product.py` (or equivalent aggregate module)
- Modify: `backend/catalog/models.py`
- Create: `backend/catalog/migrations/00XX_product_refactoring_fields.py`
- Create (if D3 = a): `backend/catalog/models.py` → `ProductFiscalData`
- Create (if D2 = a): `backend/catalog/models.py` → `ProductPriceTier`
- Create: `backend/catalog/tests/test_product_extensions.py`

- [ ] Write unit tests for each approved field/submodel: validation, normalization,
  uniqueness where applicable, decimal handling for any new monetary/quantity field.
- [ ] Run focused tests; expect RED.
- [ ] Implement only the fields/submodels approved in D1–D5; skip anything left
  unapproved or deferred.
- [ ] Write backward-compatible migration; confirm existing products remain valid with
  new fields unset/null where optional.
- [ ] Run focused tests, `manage.py makemigrations --check`, Ruff, mypy; expect PASS.
- [ ] Commit with `feat(catalog): add approved product refactoring fields`.

### Task 2: Application services and business rules

**Files:**
- Modify: `backend/catalog/application/` (product use cases)
- Modify/Create: price-tier resolution service (if D2 = a)
- Modify/Create: fiscal-data upsert service (if D3 = a)
- Modify: `backend/catalog/tests/test_product_application.py`

- [ ] Write tests for: inactive product rejecting new price tiers/fiscal data;
  quantity-based price resolution (if D2); fiscal data upsert not blocking non-fiscal
  edits (if D3); inventory flag read contract (if D4).
- [ ] Run focused tests; expect RED.
- [ ] Implement use cases inside `transaction.atomic()`, following the existing
  Sprint 2 pattern for `ProductPrice`.
- [ ] Add Outbox events: `catalog.product.fiscal_data_updated`,
  `catalog.product.price_tier_added` (only for approved submodels).
- [ ] Run focused tests; expect PASS.
- [ ] Commit with `feat(catalog): add product extension business rules`.

### Task 3: API contracts

**Files:**
- Modify: `backend/catalog/interfaces/serializers.py`, `views.py`, `urls.py`
- Create: `backend/tests/test_catalog_refactoring_api.py`

- [ ] Write BDD tests for new/extended endpoints: `PATCH /products/{id}/` with new
  fields, `/products/{id}/fiscal-data/` (if D3=a), `/products/{id}/price-tiers/`
  (if D2=a); include RLS, cross-tenant, role denial and optimistic-concurrency cases.
- [ ] Run focused tests; expect RED.
- [ ] Implement serializers/views/urls; add new Problem Details error codes
  (`invalid_price_tier_quantity`, `duplicate_fiscal_data`, etc.) to the stable catalog.
- [ ] Regenerate OpenAPI schema and TypeScript client.
- [ ] Run focused tests; expect PASS.
- [ ] Commit with `feat(api): expose approved catalog refactoring fields`.

### Task 4: Frontend catalog form updates

**Files:**
- Modify: `frontend/src/catalog/ProductForm.tsx`, `PriceForm.tsx`, `catalogApi.ts`,
  `catalogSchemas.ts`
- Create (if D3 = a): `frontend/src/catalog/ProductFiscalForm.tsx`
- Create (if D2 = a): `frontend/src/catalog/PriceTierForm.tsx`
- Modify: `frontend/src/catalog/catalogPages.test.tsx`

- [ ] Write tests for new form fields, validation messages, decimal-string inputs, and
  conditional rendering (e.g., inventory section only if D4 flag is on).
- [ ] Run focused tests; expect RED.
- [ ] Implement forms reusing existing decimal/idempotency/URL-filter conventions from
  Sprint 18; surface fiscal warnings without blocking save.
- [ ] Run tests, typecheck and axe; expect PASS.
- [ ] Commit with `feat(frontend): add catalog refactoring fields to product form`.

### Task 5: Regression, E2E and closure

**Files:**
- Create: `frontend/e2e/catalog-refactoring.spec.ts`
- Modify: `docs/PRD.md`
- Create: `docs/10_Releases/SPRINT-022_Catalog_Refactoring_Final_Report.md`

- [ ] Write E2E covering product creation/edit with all approved new fields, plus a
  scenario confirming an old product without new fields still opens/saves correctly.
- [ ] Run full backend/frontend regression suite, including Sprint 2 and Sprint 18
  test files, unchanged and passing.
- [ ] Run three-browser E2E; capture raw output.
- [ ] Update PRD Sprint 22 entry and write the final report, listing which of D1–D5
  were approved and which were deferred.
- [ ] Commit with `feat: sprint 22 - refatoracao do catalogo`.