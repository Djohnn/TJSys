# Sprint 25 Catalog Classifiers Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver complete tenant-safe CRUDs for categories, subcategories, brands and units, shared by full pages and quick-create modals.

**Architecture:** Keep classifiers inside `catalog`; use category parentage for subcategories, the Sprint 24 `Brand`, and existing `Unit`/`ProductUnit`. All UI surfaces call the same API functions and canonical query keys.

**Tech Stack:** Django/DRF/PostgreSQL RLS, React/TypeScript/TanStack Query, pytest, Vitest/MSW and Playwright.

---

### Task 1: Complete classifier invariants and APIs

**Files:**
- Modify: `backend/catalog/models.py`
- Modify: `backend/catalog/serializers.py`
- Modify: `backend/catalog/views.py`
- Modify: `backend/catalog/urls.py`
- Create: `backend/tests/test_catalog_classifiers_api.py`

- [ ] Write RED tests for unique brand name per tenant, category-cycle rejection, same-tenant parent, protected inactivation and positive-decimal product-unit factor.

```python
def test_category_rejects_cycle(api_client, category, tenant_headers):
    response = api_client.patch(
        f'/api/v1/catalog/categories/{category.id}/',
        {'parent': str(category.id)}, headers=tenant_headers,
    )
    assert response.status_code == 400
    assert 'parent' in response.json()['errors']
```

- [ ] Run: `..\.venv\Scripts\python.exe -m pytest tests/test_catalog_classifiers_api.py -q`
  Expected: FAIL on missing/incorrect invariants.
- [ ] Implement serializer/model validation, filters and `is_active` transitions; never hard-delete referenced classifiers.
- [ ] Run the focused test plus `tests/test_catalog_rls.py`; expected: PASS.
- [ ] Commit: `git commit -am "feat(catalog): complete classifier APIs"`.

### Task 2: Build classifier pages and shared forms

**Files:**
- Create: `frontend/src/catalog/BrandsPage.tsx`
- Create: `frontend/src/catalog/ClassifierForm.tsx`
- Modify: `frontend/src/catalog/CategoriesPage.tsx`
- Modify: `frontend/src/catalog/UnitsPage.tsx`
- Modify: `frontend/src/catalog/catalogApi.ts`
- Modify: `frontend/src/app/App.tsx`
- Test: `frontend/src/catalog/classifiers.test.tsx`

- [ ] Write RED tests for search, pagination, edit, inactivate/reactivate and parent selection.

```tsx
await user.type(screen.getByRole('textbox', { name: 'Buscar marcas' }), 'Marca QA')
await user.click(screen.getByRole('button', { name: 'Buscar' }))
expect(await screen.findByText('Marca QA')).toBeVisible()
```

- [ ] Run: `npm test -- --run src/catalog/classifiers.test.tsx`; expected: FAIL.
- [ ] Implement routed pages `/catalog/categories`, `/catalog/brands`, `/catalog/units` with shared labeled fields, accessible tables and state actions.
- [ ] Run tests and `npm run typecheck`; expected: PASS/exit 0.
- [ ] Commit: `git add frontend/src && git commit -m "feat(catalog): add classifier management pages"`.

### Task 3: Unify quick-create behavior

**Files:**
- Modify: `frontend/src/catalog/CategoryQuickCreateModal.tsx`
- Modify: `frontend/src/catalog/UnitQuickCreateModal.tsx`
- Create: `frontend/src/catalog/BrandQuickCreateModal.tsx`
- Modify: `frontend/src/catalog/ProductIdentityStep.tsx`
- Test: `frontend/src/catalog/classifiers.test.tsx`

- [ ] Write a RED test proving every newly created option becomes selected without reload.
- [ ] Run the focused test; expected: FAIL for at least brand or selection propagation.
- [ ] Implement each modal through `catalogApi.ts`, invalidate `catalogKeys`, call `onCreated(entity)` and set the form value.
- [ ] Run tests; expected: PASS.
- [ ] Commit: `git add frontend/src/catalog && git commit -m "feat(catalog): unify quick classifier creation"`.

### Task 4: E2E and closure

**Files:**
- Create: `frontend/e2e/catalog-classifiers.spec.ts`
- Modify: `docs/PRD.md`
- Create: `docs/10_Releases/SPRINT-025_Catalog_Classifiers_Final_Report.md`

- [ ] Implement Given/When/Then E2E for CRUD, inactivation, cycle error and product quick-create reuse.
- [ ] Run: `npx playwright test e2e/catalog-classifiers.spec.ts --project=chromium`; expected: all scenarios pass.
- [ ] Run backend classifier/RLS tests, full frontend tests, typecheck and build; expected: 0 failures.
- [ ] Record raw output in the report and commit with `feat: sprint 25 - classificadores do catalogo`.
