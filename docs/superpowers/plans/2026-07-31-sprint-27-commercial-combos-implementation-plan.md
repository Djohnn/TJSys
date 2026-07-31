# Sprint 27 Commercial Combos Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver versioned commercial combos with their own price and correct expansion into auditable sale items.

**Architecture:** Add `CommercialCombo`, versioned `ComboItem` and price validity inside Catalog. Sales resolves the active combo version, records the commercial parent and expanded items; Inventory then applies each expanded item's existing product/service/kit behavior.

**Tech Stack:** Django/DRF, Catalog/Sales/Inventory, React, PDV Electron, pytest, Vitest and Playwright.

---

### Task 1: Combo aggregate and versioning

**Files:**
- Modify: `backend/catalog/models.py`
- Modify: `backend/catalog/serializers.py`
- Modify: `backend/catalog/urls.py`
- Create: `backend/catalog/services/combos.py`
- Create: `backend/catalog/migrations/0009_commercial_combo.py`
- Create: `backend/tests/test_commercial_combos.py`

- [ ] Write RED tests for positive quantities, tenant isolation, active validity interval and immutable used version.

```python
def test_combo_requires_positive_item_quantity(combo, product):
    with pytest.raises(ValidationError):
        ComboItem(combo=combo, item=product, quantity=Decimal('0')).full_clean()
```

- [ ] Run focused pytest; expected: FAIL because aggregate is absent.
- [ ] Implement combo/version/item models and `resolve_combo(combo_id, at)`.
- [ ] Generate migration, run tests/RLS checks; expected: PASS.
- [ ] Commit: `feat(catalog): add versioned commercial combos`.

### Task 2: Atomic sale expansion

**Files:**
- Modify: `backend/sales/models.py`
- Modify: `backend/sales/services.py`
- Create: `backend/tests/test_combo_sales.py`

- [ ] Write RED tests for own combo price, expanded audit lines, expired combo rejection and atomic stock validation.
- [ ] Run focused pytest; expected: FAIL.
- [ ] Add optional `commercial_combo_id/version` audit fields to sale items and expand via Catalog service inside sale transaction.
- [ ] Run Sales/Inventory/Sprint 23 kit regression; expected: PASS with no duplicate kit logic.
- [ ] Commit: `feat(sales): expand commercial combos atomically`.

### Task 3: Combo management and PDV selection

**Files:**
- Create: `frontend/src/catalog/CombosPage.tsx`
- Create: `frontend/src/catalog/ComboEditorPage.tsx`
- Modify: `frontend/src/app/App.tsx`
- Modify: `pdv/src/renderer/pages/Sale.tsx`
- Test: `frontend/src/catalog/combos.test.tsx`
- Test: `pdv/src/renderer/__tests__/pages/Sale.test.tsx`

- [ ] Write RED UI tests for item search, quantity, price, validity and preview.
- [ ] Run tests; expected: FAIL.
- [ ] Implement accessible combo editor and PDV badge/expanded preview.
- [ ] Run frontend/PDV tests, typecheck and build; expected: PASS.
- [ ] Commit: `feat(frontend): add commercial combo management`.

### Task 4: E2E and closure

**Files:**
- Create: `frontend/e2e/commercial-combos.spec.ts`
- Modify: `docs/PRD.md`
- Create: `docs/10_Releases/SPRINT-027_Commercial_Combos_Final_Report.md`

- [ ] E2E create combo with product, service and kit; sell and verify price, audit expansion and component stock effects.
- [ ] Run Playwright Chromium and full Catalog/Sales/Inventory regression; expected: 0 failures.
- [ ] Record raw output and commit with `feat: sprint 27 - combos comerciais`.
