# Sprint 28 Label Printing Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate authorized, deterministic product-label PDFs from selected catalog items and versioned templates.

**Architecture:** Catalog owns label templates and resolves product code/current effective price. A dedicated PDF service renders immutable generation inputs; the web UI supports batch selection and preview but no silent printer access.

**Tech Stack:** Django/DRF, bundled PDF runtime, React/TypeScript, pytest PDF inspection, Vitest and Playwright.

---

### Task 1: Label template and generation request domain

**Files:**
- Modify: `backend/catalog/models.py`
- Modify: `backend/catalog/serializers.py`
- Modify: `backend/catalog/urls.py`
- Create: `backend/catalog/services/labels.py`
- Create: `backend/catalog/migrations/0010_label_templates.py`
- Create: `backend/tests/test_label_templates.py`

- [ ] Write RED tests for positive dimensions, allowed fields, tenant isolation and immutable template version.

```python
def test_label_template_rejects_non_positive_width(tenant):
    template = LabelTemplate(tenant=tenant, name='A', width_mm=Decimal('0'), height_mm=Decimal('30'))
    with pytest.raises(ValidationError):
        template.full_clean()
```

- [ ] Run focused pytest; expected: FAIL because models/services are absent.
- [ ] Implement `LabelTemplate`, version and `LabelGeneration` audit metadata without storing rendered customer data.
- [ ] Generate migration and run RLS tests; expected: PASS.
- [ ] Commit: `feat(catalog): add label templates and generation audit`.

### Task 2: Deterministic PDF renderer

**Files:**
- Create: `backend/catalog/services/label_pdf.py`
- Modify: `backend/catalog/views.py`
- Create: `backend/tests/test_label_pdf.py`

- [ ] Write RED test generating two products with quantities 2 and 3 and assert exactly five label cells, EAN text and effective prices.
- [ ] Run: `..\.venv\Scripts\python.exe -m pytest tests/test_label_pdf.py -q`; expected: FAIL.
- [ ] Implement renderer using millimetre dimensions, Decimal formatting and a fixed font; reject missing primary code or price with field-specific `application/problem+json`.
- [ ] Render test PDF, inspect page/cell count and run tests; expected: PASS.
- [ ] Commit: `feat(catalog): render deterministic label PDFs`.

### Task 3: Label selection and preview UI

**Files:**
- Create: `frontend/src/catalog/LabelsPage.tsx`
- Create: `frontend/src/catalog/LabelPreview.tsx`
- Modify: `frontend/src/catalog/catalogApi.ts`
- Modify: `frontend/src/app/App.tsx`
- Test: `frontend/src/catalog/labels.test.tsx`

- [ ] Write RED tests for product search, filter, quantity, template selection, validation and preview/download.
- [ ] Run Vitest target; expected: FAIL.
- [ ] Implement `/catalog/labels` with semantic table, per-row quantity and preview; require an explicit click for PDF download.
- [ ] Run tests, axe, typecheck and build; expected: PASS.
- [ ] Commit: `feat(frontend): add label printing workflow`.

### Task 4: E2E and closure

**Files:**
- Create: `frontend/e2e/label-printing.spec.ts`
- Modify: `docs/PRD.md`
- Create: `docs/10_Releases/SPRINT-028_Label_Printing_Final_Report.md`

- [ ] E2E select products → preview → download PDF and verify download filename/content type.
- [ ] Run PDF tests, Playwright and complete Catalog regression; expected: 0 failures.
- [ ] Record counts/durations and commit with `feat: sprint 28 - impressao de etiquetas`.
