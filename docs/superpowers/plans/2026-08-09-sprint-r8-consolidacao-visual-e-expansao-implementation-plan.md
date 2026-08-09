# Sprint R8 — Consolidação visual e expansão Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** tornar o novo editor canônico e provar produto estoque PDV.

**Architecture:** App.tsx mantém uma rota de edição; rotas legadas redirecionam com replace. Playwright cria o produto no frontend, vende no PDV e confirma saldo final no admin.

**Tech Stack:** React, Playwright, Electron, Django

---

## File map

- Create or modify: `frontend/src/app/App.tsx`
- Create or modify: `frontend/src/catalog/ProductEditorPage.tsx`
- Create or modify: `frontend/src/catalog/ProductsPage.tsx`
- Create or modify: `frontend/e2e/product-pdv-stock-flow.spec.ts`
- Create or modify: `.github/workflows/e2e.yml`

### Task 1: Fixar o contrato em RED

**Files:**
- Test: `frontend/e2e/product-pdv-stock-flow.spec.ts`
- Reference: `docs/superpowers/specs/2026-08-09-sprint-r8-consolidacao-visual-e-expansao-design.md`

- [ ] **Step 1: Write the failing test**

```typescript
test('produto 10 menos venda 3 resulta saldo 7', async ({ page }) => {
  const artifact = await createTrackedProduct(page.request, { quantity: '10', price: '9.90' })
  await sellInPdv(artifact, '3')
  await page.goto('/inventory/balances')
  await expect(page.getByTestId('balance-row').filter({ hasText: artifact.sku })).toContainText('7')
})
```

- [ ] **Step 2: Run and confirm RED**

Run: `cd frontend && npx playwright test e2e/product-pdv-stock-flow.spec.ts --project=chromium --retries=0`

Expected: FAIL on the absent fluxo vertical completo contract, not on fixture or authentication setup.

- [ ] **Step 3: Commit RED**

```bash
git add frontend/e2e/product-pdv-stock-flow.spec.ts
git commit -m "test(r8): define consolidacao-visual-e-expansao contract"
```

### Task 2: Implement the minimal production boundary

**Files:**
- Create or modify: `frontend/src/app/App.tsx`
- Create or modify: `frontend/src/catalog/ProductEditorPage.tsx`
- Create or modify: `frontend/src/catalog/ProductsPage.tsx`

- [ ] **Step 1: Add the typed boundary**

```tsx
<Route path="/catalog/products/new" element={<ProductEditorPage mode="create" />} />
<Route path="/catalog/products/:productId/edit" element={<ProductEditorPage mode="edit" />} />
<Route path="/catalog/products/legacy/:productId" element={<Navigate replace to="../edit" />} />
```

Integrate this exact public shape in the named production files. Remove competing legacy exports only after all callers and tests use this boundary.

- [ ] **Step 2: Run the focused test and confirm GREEN**

Run: `cd frontend && npx playwright test e2e/product-pdv-stock-flow.spec.ts --project=chromium --retries=0`

Expected: focused file PASS with zero unhandled request warnings.

- [ ] **Step 3: Run type and build gates**

```powershell
cd frontend
npm.cmd run typecheck
npm.cmd run build
```

Expected: TypeScript exit 0 and Vite build completes.

- [ ] **Step 4: Commit production slice**

```bash
git add frontend/src/app/App.tsx frontend/src/catalog/ProductEditorPage.tsx frontend/src/catalog/ProductsPage.tsx
git commit -m "feat(r8): implement consolidacao-visual-e-expansao"
```

### Task 3: Close visual accessibility and CI gates

**Files:**
- Create or modify: `.github/workflows/e2e.yml`
- Modify: `.github/workflows/e2e.yml`
- Modify: `docs/DOCUMENT_INDEX.md`

- [ ] **Step 1: Add Playwright and axe assertions**

```typescript
test('r8 visual and keyboard contract', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('body')).toHaveScreenshot('r8-consolidacao-visual-e-expansao.png')
  await expect(page.locator(':focus-visible')).toHaveCount(0)
})
```

Capture the approved desktop and mobile viewports, then add keyboard interaction and `@axe-core/playwright` with zero serious/critical violations. Do not use hardcoded waits or retries.

- [ ] **Step 2: Run all sprint gates**

```powershell
cd frontend
npm.cmd test -- --run
npx playwright test e2e/r8-consolidacao-visual-e-expansao.spec.ts --project=chromium --retries=0
npm.cmd run typecheck
npm.cmd run build
```

Expected: Vitest PASS, Playwright PASS with retries disabled, axe clean, typecheck/build exit 0.

- [ ] **Step 3: Validate repository and refresh graph**

```powershell
git diff --check
graphify update .
```

Expected: no whitespace errors; Graphify completes or its access-denied infrastructure error is recorded explicitly.

- [ ] **Step 4: Commit closure**

```bash
git add .github/workflows/e2e.yml docs/DOCUMENT_INDEX.md frontend graphify-out
git commit -m "test(r8): close visual acceptance"
```

## Completion checklist

- [ ] Named acceptance test maps to the sprint spec.
- [ ] No literal color exists outside the approved token boundary.
- [ ] Keyboard, axe, desktop and mobile visual checks pass.
- [ ] CI executes the focused gate with `retries: 0`.
- [ ] Legacy behavior is removed only after parity is proven.
