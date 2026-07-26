# Sprint 22-Extensão — Criação Inline de Categoria e Unidade no Cadastro de Produto — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow creating a new `Category` or `Unit` directly from the product form,
without leaving the screen, using the existing `/categories/` and `/units/` endpoints
(no new backend model or endpoint — this is a frontend-only addition).

**Why not a full sprint:** No domain model changes, no cross-context impact, no
architectural decision in conflict. Backend contracts already exist (Sprint 2). This is
a UX gap in the product form only.

**Scope:** `frontend/src/catalog/ProductForm.tsx` and its category/unit selectors only.
No changes to `backend/catalog/`, no new migrations, no new Outbox events.

**Tech Stack:** Same frontend stack as Sprint 18/22 — React, existing form/validation
conventions, Vitest, MSW, axe-core.

---

## Locked decisions (inherited, not open for reinterpretation)

- Category/Unit creation still goes through the existing `catalog.manage` capability
  check — a user without permission to manage the catalog cannot create a category/unit
  inline either, even if they can create a product.
- No duplicate-prevention logic beyond what `/categories/` and `/units/` already
  enforce server-side (normalized uniqueness per tenant, from Sprint 2).
- Money/quantity decimal-string conventions are irrelevant here (no monetary/quantity
  field involved), but existing form validation and error-display (Problem Details)
  conventions from Sprint 18/22 must be reused, not reinvented.

---

### Task 1: Inline "create category" and "create unit" in the product form

**Files:**
- Modify: `frontend/src/catalog/ProductForm.tsx`
- Create: `frontend/src/catalog/CategoryQuickCreateModal.tsx`,
  `UnitQuickCreateModal.tsx`
- Modify: `frontend/src/catalog/catalogApi.ts` (reuse existing create calls if not
  already exposed to this component)
- Modify: `frontend/src/catalog/catalogSchemas.ts` (reuse existing category/unit
  schemas; do not duplicate validation rules)
- Modify: `frontend/src/catalog/catalogPages.test.tsx`

- [ ] Write tests: category/unit selector shows a "Criar nova categoria/unidade" option;
  selecting it opens a minimal modal (name + required fields already defined by the
  existing schema); on submit, calls the existing `POST /categories/` or `POST /units/`;
  on success, the new item is auto-selected in the product form without a page reload;
  on server validation error (e.g. duplicate name), the modal shows the Problem Details
  message inline and does not close; user without `catalog.manage` does not see the
  "create new" option at all.
- [ ] Run focused tests; expect RED.
- [ ] Implement the selector option, modal, and API wiring, reusing existing
  `catalogApi.ts` functions and `catalogSchemas.ts` validation — do not create parallel
  validation logic.
- [ ] Ensure the modal is accessible (focus trap, labeled inputs) consistent with the
  axe conventions already used in Sprint 18/22 forms.
- [ ] Run tests, typecheck and axe; expect PASS.
- [ ] Commit with `feat(frontend): allow inline category and unit creation from product form`.

### Task 2: Regression and closure

**Files:**
- Modify: `docs/PRD.md`

- [ ] Run full frontend regression suite (Sprint 18, 22 catalog tests) unchanged and
  passing.
- [ ] Update PRD entry for this task.
- [ ] Commit with `feat: sprint 22-extensão - criacao inline de categoria e unidade`.
