# Sprint 24 Catalog Product Experience Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the TJSys catalog hub and a complete, working product registration flow with the approved image-left/identification-right layout.

**Architecture:** Keep `Product` as the catalog root and adapt the React form to the existing nested APIs for codes, prices, fiscal data, tiers, units and Sprint 23 composition. Add only `Brand`, category hierarchy usage and `ProductImage`; Inventory remains the sole owner of stock balances and movements.

**Tech Stack:** Django 5.2, DRF, PostgreSQL/RLS, React 18, TypeScript, TanStack Query, React Hook Form, Zod, Tailwind CSS v4, Vitest/MSW, pytest and Playwright.

---

### Task 1: Reproduce and fix the product payload contract

**Files:**
- Modify: `frontend/src/catalog/catalogSchemas.ts`
- Modify: `frontend/src/catalog/catalogApi.ts`
- Modify: `frontend/src/catalog/ProductsPage.tsx`
- Test: `frontend/src/catalog/catalogPages.test.tsx`

- [ ] **Step 1: Write a failing request-contract test**

```ts
it('maps the product form to the backend contract', async () => {
  const body = await submitProduct({ unit: 'unit-1', barcode: '789', tags: 'qa, web' })
  expect(body).toMatchObject({ base_unit: 'unit-1', tags: ['qa', 'web'] })
  expect(body).not.toHaveProperty('unit')
  expect(body).not.toHaveProperty('barcode')
})
```

- [ ] **Step 2: Run the test and prove RED**

Run: `npm test -- --run src/catalog/catalogPages.test.tsx`
Expected: FAIL because the current request contains `unit`, `barcode` and string `tags`.

- [ ] **Step 3: Add the explicit adapter and code creation**

```ts
export function toProductPayload(data: ProductFormData) {
  const { unit, barcode, tags, ...product } = data
  return {
    product: { ...product, base_unit: unit, tags: tags.split(',').map(v => v.trim()).filter(Boolean) },
    barcode: barcode.trim(),
  }
}
```

After `POST /catalog/products/` succeeds, create a primary `ean` code through
`POST /catalog/products/{id}/codes/` when `barcode` is non-empty.

- [ ] **Step 4: Display structured API errors**

```ts
export function problemMessage(problem: ApiProblem): string {
  return problem.errors
    ? Object.entries(problem.errors).flatMap(([field, values]) => values.map(v => `${field}: ${v}`)).join('; ')
    : problem.detail
}
```

- [ ] **Step 5: Run focused frontend tests**

Run: `npm test -- --run src/catalog/catalogPages.test.tsx`
Expected: all catalog tests PASS, including the new request-contract regression.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/catalog
git commit -m "fix(catalog): align product form with API contract"
```

### Task 2: Standardize category, brand and unit query caches

**Files:**
- Create: `frontend/src/catalog/catalogQueryKeys.ts`
- Modify: `frontend/src/catalog/ProductForm.tsx`
- Modify: `frontend/src/catalog/ProductsPage.tsx`
- Modify: `frontend/src/catalog/CategoryQuickCreateModal.tsx`
- Modify: `frontend/src/catalog/UnitQuickCreateModal.tsx`
- Test: `frontend/src/catalog/catalogPages.test.tsx`

- [ ] **Step 1: Write a failing quick-create visibility test**

```ts
it('shows a quick-created category without reloading', async () => {
  await user.click(screen.getByTestId('quick-create-category-btn'))
  await user.type(screen.getByTestId('quick-cat-name-input'), 'Nova categoria')
  await user.click(screen.getByTestId('quick-cat-submit'))
  expect(await screen.findByRole('option', { name: 'Nova categoria' })).toBeVisible()
})
```

- [ ] **Step 2: Run and prove RED**

Run: `npm test -- --run src/catalog/catalogPages.test.tsx -t "quick-created category"`
Expected: FAIL because `['categories', tenantId]` and `['categories', tenantId, 1]` diverge.

- [ ] **Step 3: Introduce canonical keys**

```ts
export const catalogKeys = {
  categories: (tenantId: string) => ['categories', tenantId] as const,
  units: (tenantId: string) => ['units', tenantId] as const,
  brands: (tenantId: string) => ['brands', tenantId] as const,
}
```

Use these keys in every query, invalidation and `setQueryData`; select the created option after the modal closes.

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- --run src/catalog/catalogPages.test.tsx`
Expected: PASS.

```bash
git add frontend/src/catalog
git commit -m "fix(catalog): refresh inline classifiers consistently"
```

### Task 3: Add Brand and ProductImage domain/API

**Files:**
- Modify: `backend/catalog/models.py`
- Modify: `backend/catalog/serializers.py`
- Modify: `backend/catalog/views.py`
- Modify: `backend/catalog/urls.py`
- Create: `backend/catalog/migrations/0007_brand_product_image.py`
- Test: `backend/tests/test_catalog_product_experience_api.py`

- [ ] **Step 1: Write failing BDD API tests**

```python
def test_admin_creates_tenant_scoped_brand(api_client, tenant_headers):
    response = api_client.post('/api/v1/catalog/brands/', {'name': 'Marca QA'}, headers=tenant_headers)
    assert response.status_code == 201

def test_product_image_rejects_cross_tenant_product(api_client, other_product, tenant_headers):
    response = api_client.post(
        f'/api/v1/catalog/products/{other_product.id}/images/',
        {'object_key': 'products/test.webp', 'is_primary': True, 'position': 0},
        headers=tenant_headers,
    )
    assert response.status_code == 404
```

- [ ] **Step 2: Run and prove RED**

Run: `..\.venv\Scripts\python.exe -m pytest tests/test_catalog_product_experience_api.py -q`
Expected: FAIL because the models/routes do not exist.

- [ ] **Step 3: Implement minimal tenant-scoped models**

```python
class Brand(TimeStampedModel, TenantScopedModel):
    name = models.CharField(max_length=120)
    is_active = models.BooleanField(default=True)

class ProductImage(TimeStampedModel, TenantScopedModel):
    product = models.ForeignKey(Product, related_name='images', on_delete=models.CASCADE)
    object_key = models.CharField(max_length=500)
    alt_text = models.CharField(max_length=200, blank=True, default='')
    is_primary = models.BooleanField(default=False)
    position = models.PositiveSmallIntegerField(default=0)
```

Add same-tenant validation, one-primary-image constraint, tenant managers, serializers and nested routes.

- [ ] **Step 4: Generate and inspect migration**

Run: `..\.venv\Scripts\python.exe manage.py makemigrations catalog`
Expected: one migration creating `Brand` and `ProductImage` plus constraints/RLS migration operations.

- [ ] **Step 5: Run backend gates**

Run: `..\.venv\Scripts\python.exe -m pytest tests/test_catalog_product_experience_api.py tests/test_catalog_rls.py -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/catalog backend/tests/test_catalog_product_experience_api.py
git commit -m "feat(catalog): add brands and product images"
```

### Task 4: Build the Catalog hub and routed product editor

**Files:**
- Create: `frontend/src/catalog/CatalogHomePage.tsx`
- Create: `frontend/src/catalog/ProductEditorPage.tsx`
- Create: `frontend/src/catalog/ProductIdentityStep.tsx`
- Create: `frontend/src/catalog/ProductMediaPanel.tsx`
- Modify: `frontend/src/catalog/ProductsPage.tsx`
- Modify: `frontend/src/app/App.tsx`
- Test: `frontend/src/catalog/catalogPages.test.tsx`

- [ ] **Step 1: Write failing routing/layout tests**

```tsx
expect(screen.getByRole('link', { name: 'Produtos' })).toHaveAttribute('href', '/catalog/products')
expect(screen.getByTestId('product-media-panel')).toBeVisible()
expect(screen.getByTestId('product-identity-step')).toBeVisible()
```

- [ ] **Step 2: Run and prove RED**

Run: `npm test -- --run src/catalog/catalogPages.test.tsx src/app/App.test.tsx`
Expected: FAIL because `/catalog` still renders `ProductsPage` and the editor is inline.

- [ ] **Step 3: Implement routes and approved layout**

```tsx
<Route path="catalog" element={<CatalogHomePage />} />
<Route path="catalog/products" element={<ProductsPage />} />
<Route path="catalog/products/new" element={<ProductEditorPage />} />
<Route path="catalog/products/:productId/edit" element={<ProductEditorPage />} />
```

Render seven catalog cards. On desktop use `grid-cols-[minmax(220px,0.8fr)_minmax(0,2.2fr)]`; place `ProductMediaPanel` left and `ProductIdentityStep` right. Stack on small screens.

- [ ] **Step 4: Run frontend gates and commit**

Run: `npm test -- --run src/catalog/catalogPages.test.tsx src/app/App.test.tsx`
Expected: PASS.

Run: `npm run typecheck`
Expected: exit 0.

```bash
git add frontend/src/catalog frontend/src/app
git commit -m "feat(catalog): add catalog hub and product editor"
```

### Task 5: Add product steps and dependent-resource orchestration

**Files:**
- Create: `frontend/src/catalog/ProductEditorSteps.tsx`
- Create: `frontend/src/catalog/ProductPricesStep.tsx`
- Create: `frontend/src/catalog/ProductInventoryStep.tsx`
- Create: `frontend/src/catalog/ProductFiscalStep.tsx`
- Create: `frontend/src/catalog/ProductCompositionStep.tsx`
- Create: `frontend/src/catalog/ProductChannelsStep.tsx`
- Modify: `frontend/src/catalog/catalogApi.ts`
- Test: `frontend/src/catalog/productEditor.test.tsx`

- [ ] **Step 1: Write failing step-orchestration tests**

```tsx
expect(screen.getByRole('tab', { name: 'Preços' })).toHaveAttribute('aria-disabled', 'true')
await saveIdentity()
expect(screen.getByRole('tab', { name: 'Preços' })).toHaveAttribute('aria-disabled', 'false')
expect(screen.getByTestId('product-composition-step')).toBeVisible()
```

- [ ] **Step 2: Run and prove RED**

Run: `npm test -- --run src/catalog/productEditor.test.tsx`
Expected: FAIL because step components do not exist.

- [ ] **Step 3: Implement accessible steps**

Use `role="tablist"`, `role="tab"`, `aria-selected` and keyboard navigation. Identity creates the base product; subsequent steps receive `productId`. Inventory reads balances and links to official movement screens; it never patches a balance. Channels shows readiness only and explicitly labels publication as Sprint 29.

- [ ] **Step 4: Run tests, axe and build**

Run: `npm test -- --run src/catalog/productEditor.test.tsx src/catalog/catalogPages.test.tsx`
Expected: PASS.

Run: `npm run typecheck && npm run build`
Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/catalog
git commit -m "feat(catalog): orchestrate product registration steps"
```

### Task 6: Browser acceptance, docs and Sprint 24 closure

**Files:**
- Create: `frontend/e2e/product-registration.spec.ts`
- Modify: `frontend/e2e/accessibility.spec.ts`
- Modify: `docs/PRD.md`
- Create: `docs/10_Releases/SPRINT-024_Catalog_Product_Experience_Final_Report.md`

- [ ] **Step 1: Write the full E2E scenario**

```ts
test('cadastra produto completo com classificadores rápidos', async ({ authenticatedPage: page }) => {
  await page.goto('/catalog/products/new')
  // Given image panel and identification form
  // When category, brand and unit are quick-created and all steps are saved
  // Then the product is searchable, editable and can be inactivated
})
```

Use role/label/test-id selectors, unique test data and no fixed waits.

- [ ] **Step 2: Reset deterministic E2E data and run Playwright**

Run: `..\.venv\Scripts\python.exe manage.py seed_e2e`
Expected: E2E tenant and admin recreated.

Run: `npx playwright test e2e/product-registration.spec.ts --project=chromium`
Expected: `1 passed` with duration printed.

- [ ] **Step 3: Run complete verification**

Run: `..\.venv\Scripts\python.exe manage.py check && ..\.venv\Scripts\python.exe manage.py makemigrations --check`
Expected: no issues and no pending migrations.

Run: `..\.venv\Scripts\python.exe -m pytest tests catalog/tests inventory/tests sales/tests -q`
Expected: 0 failures.

Run: `npm test -- --run && npm run typecheck && npm run build`
Expected: 0 failures and all commands exit 0.

- [ ] **Step 4: Update PRD/report and commit**

Record raw pass/fail counts and durations in the final report before marking Sprint 24 complete.

```bash
git add frontend/e2e docs/PRD.md docs/10_Releases/SPRINT-024_Catalog_Product_Experience_Final_Report.md
git commit -m "feat: sprint 24 - catalogo e cadastro completo de produto"
```
