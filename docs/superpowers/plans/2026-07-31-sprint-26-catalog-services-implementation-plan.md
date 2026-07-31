# Sprint 26 Catalog Services Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add service items that can be priced and sold without creating inventory movements.

**Architecture:** Represent service as an explicit catalog item type with service-specific metadata, reuse catalog pricing, and let Sales accept mixed items. Inventory ignores service items by contract; Fiscal exposes a provider-neutral NFS-e preparation seam.

**Tech Stack:** Django/DRF, Catalog/Sales/Inventory/Fiscal modules, React, PDV Electron, pytest, Vitest and Playwright.

---

### Task 1: Service domain and API

**Files:**
- Modify: `backend/catalog/models.py`
- Modify: `backend/catalog/serializers.py`
- Modify: `backend/catalog/views.py`
- Create: `backend/catalog/migrations/0008_service_item_fields.py`
- Create: `backend/tests/test_catalog_services_api.py`

- [ ] Write RED tests that service rejects `tracks_inventory=true`, lot/expiry and stock fields.

```python
def test_service_cannot_track_inventory(api_client, unit, tenant_headers):
    response = api_client.post('/api/v1/catalog/products/', {
        'sku': 'SERV-1', 'name': 'Banho', 'base_unit': str(unit.id),
        'product_kind': 'servico', 'tracks_inventory': True,
    }, headers=tenant_headers)
    assert response.status_code == 400
```

- [ ] Run focused pytest; expected: FAIL.
- [ ] Add service metadata (`billing_unit`, optional `duration_minutes`) and invariant enforcement in `Product.clean()`/serializer.
- [ ] Generate migration, run tests and `makemigrations --check`; expected: PASS/no changes.
- [ ] Commit: `feat(catalog): add service item invariants`.

### Task 2: Mixed sale without stock movement

**Files:**
- Modify: `backend/sales/services.py`
- Modify: `backend/inventory/services.py`
- Create: `backend/tests/test_service_sales_inventory.py`

- [ ] Write RED integration test: one product plus one service completes sale; only product generates `StockMovement`.
- [ ] Run: `..\.venv\Scripts\python.exe -m pytest tests/test_service_sales_inventory.py -q`; expected: FAIL.
- [ ] Filter inventory movement generation by catalog contract `tracks_inventory`; preserve totals and SaleItem audit data.
- [ ] Run sales/inventory regression; expected: PASS and exactly one movement in the new scenario.
- [ ] Commit: `feat(sales): support mixed product and service sales`.

### Task 3: Web/PDV service experience

**Files:**
- Create: `frontend/src/catalog/ServicesPage.tsx`
- Create: `frontend/src/catalog/ServiceEditorPage.tsx`
- Modify: `frontend/src/app/App.tsx`
- Modify: `pdv/src/renderer/pages/Sale.tsx`
- Test: `frontend/src/catalog/services.test.tsx`
- Test: `pdv/src/renderer/__tests__/pages/Sale.test.tsx`

- [ ] Write RED tests for `/catalog/services`, service fields and a service line without stock badge.
- [ ] Run both Vitest targets; expected: FAIL.
- [ ] Implement service list/editor using catalog pricing and surface item type in PDV selection/cart.
- [ ] Run frontend/PDV tests and typechecks; expected: PASS.
- [ ] Commit: `feat(frontend): add service catalog and sale surfacing`.

### Task 4: Fiscal seam, E2E and closure

**Files:**
- Modify: `backend/fiscal/ports.py`
- Create: `backend/tests/test_service_fiscal_contract.py`
- Create: `frontend/e2e/catalog-services.spec.ts`
- Modify: `docs/PRD.md`
- Create: `docs/10_Releases/SPRINT-026_Catalog_Services_Final_Report.md`

- [ ] Define and test a provider-neutral service fiscal payload; do not call an external NFS-e provider.
- [ ] Run fiscal contract tests; expected: PASS.
- [ ] Run E2E create service → price → sell → verify no stock movement.
- [ ] Run complete Catalog/Sales/Inventory/Fiscal regression; expected: 0 failures.
- [ ] Record outputs and commit with `feat: sprint 26 - cadastro e venda de servicos`.
