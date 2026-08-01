# Catalog Reference Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the shared Zyrp shell with the approved two-column reference navigation, complete Catalog submenu, responsive drawer, and verified pattern-B product editor.

**Architecture:** Keep React Router routes and backend contracts unchanged. Split navigation data from presentation, let `AppShell` own mobile drawer state, and make `Navigation` render the same module/catalog model in desktop and drawer contexts. Use existing Tailwind tokens plus focused CSS variables in `global.css`.

**Tech Stack:** React 18, React Router 7, TypeScript, Tailwind CSS 4, Vitest, Testing Library, Playwright.

**Status de execução (2026-08-01):** Tasks 1–6 concluídas. Evidências finais: 22 arquivos/328 testes Vitest aprovados, typecheck e build aprovados, 15 cenários Playwright aprovados em Chromium, Firefox e WebKit e cadastro real validado no navegador com categoria e produto de teste.

---

## File map

- Create `frontend/src/layout/navigationModel.ts`: typed module and Catalog navigation definitions plus active-route helper.
- Modify `frontend/src/layout/Navigation.tsx`: desktop rails and reusable drawer navigation.
- Modify `frontend/src/layout/AppShell.tsx`: responsive header/drawer state and content composition.
- Modify `frontend/src/styles/global.css`: Zyrp shell variables, focus, transitions, reduced-motion behavior.
- Modify `frontend/src/layout/AppShell.test.tsx`: shell, submenu, active state and drawer behavior.
- Modify `frontend/src/catalog/CatalogHomePage.tsx`: compact module landing page.
- Modify `frontend/src/catalog/catalogPages.test.tsx`: landing page semantics and destinations.
- Modify `frontend/src/catalog/ProductEditorPage.tsx`: first-fold composition and responsive guarantees.
- Modify `frontend/e2e/catalog-sprints-23-30.spec.ts`: shell and desktop pattern-B acceptance.
- Create `frontend/e2e/catalog-shell-responsive.spec.ts`: mobile drawer and no-horizontal-overflow acceptance.

### Task 1: Navigation model and complete Catalog submenu

**Files:**
- Create: `frontend/src/layout/navigationModel.ts`
- Modify: `frontend/src/layout/Navigation.tsx`
- Test: `frontend/src/layout/AppShell.test.tsx`

- [ ] **Step 1: Write the failing submenu test**

Add a test that renders `/catalog/products` and asserts unique links for all approved destinations:

```tsx
it('shows the complete contextual catalog navigation', async () => {
  renderShell('/catalog/products')
  const contextual = await screen.findByTestId('catalog-context-navigation')
  for (const label of [
    'Produtos', 'Serviços', 'Combo', 'Categorias', 'Marcas',
    'Unidades de Medida', 'Impressão de Etiquetas',
  ]) {
    expect(within(contextual).getByRole('link', { name: label })).toBeInTheDocument()
  }
  expect(within(contextual).getByRole('link', { name: 'Produtos' }))
    .toHaveAttribute('aria-current', 'page')
})
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run src/layout/AppShell.test.tsx`

Expected: FAIL because `catalog-context-navigation` does not exist.

- [ ] **Step 3: Add the typed model**

Create exported `MODULE_ITEMS`, `CATALOG_ITEMS`, `ADMIN_ITEMS`, `isRouteActive()` and types. Catalog destinations must exactly match the existing routes.

```ts
export const CATALOG_ITEMS = [
  { id: 'products', label: 'Produtos', to: '/catalog/products' },
  { id: 'services', label: 'Serviços', to: '/catalog/services' },
  { id: 'combos', label: 'Combo', to: '/catalog/combos' },
  { id: 'categories', label: 'Categorias', to: '/catalog/categories' },
  { id: 'brands', label: 'Marcas', to: '/catalog/brands' },
  { id: 'units', label: 'Unidades de Medida', to: '/catalog/units' },
  { id: 'labels', label: 'Impressão de Etiquetas', to: '/catalog/labels' },
] as const
```

- [ ] **Step 4: Implement desktop navigation**

Render a `data-testid="module-navigation"` 88 px rail and, only for `/catalog` routes, a `data-testid="catalog-context-navigation"` 248 px contextual panel. Add inline SVG icons with `aria-hidden="true"`; every link keeps visible text.

- [ ] **Step 5: Verify GREEN**

Run: `npm test -- --run src/layout/AppShell.test.tsx`

Expected: all shell tests PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/layout/navigationModel.ts frontend/src/layout/Navigation.tsx frontend/src/layout/AppShell.test.tsx
git commit -m "feat(layout): add contextual catalog navigation"
```

### Task 2: Responsive AppShell and accessible drawer

**Files:**
- Modify: `frontend/src/layout/AppShell.tsx`
- Modify: `frontend/src/layout/Navigation.tsx`
- Modify: `frontend/src/styles/global.css`
- Test: `frontend/src/layout/AppShell.test.tsx`

- [ ] **Step 1: Write failing drawer tests**

```tsx
it('opens and closes the mobile navigation drawer', async () => {
  const user = userEvent.setup()
  renderShell('/catalog')
  const trigger = await screen.findByRole('button', { name: 'Abrir menu' })
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await user.click(trigger)
  expect(trigger).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByTestId('mobile-navigation-drawer')).toBeInTheDocument()
  await user.keyboard('{Escape}')
  expect(screen.queryByTestId('mobile-navigation-drawer')).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
})
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run src/layout/AppShell.test.tsx`

Expected: FAIL because “Abrir menu” is absent.

- [ ] **Step 3: Implement shell state and responsive composition**

Use `useState`, `useEffect`, and `useRef` in `AppShell`. The header button gets `aria-expanded`, `aria-controls="mobile-navigation"`; Escape closes the drawer and restores focus. Desktop navigation uses `hidden lg:flex`; mobile drawer uses `lg:hidden`.

- [ ] **Step 4: Add intentional Zyrp shell styles**

In `global.css`, define:

```css
:root {
  --shell-ink: #071a3a;
  --shell-ink-soft: #0d2b57;
  --shell-active: #1d5df2;
  --shell-accent: #23c9d8;
  --shell-canvas: #f4f7fb;
}
@media (prefers-reduced-motion: reduce) {
  .shell-motion { transition-duration: 0.01ms !important; }
}
```

Apply a visible `focus-visible` ring and prevent shell overflow with `min-w-0` and `overflow-x-hidden`.

- [ ] **Step 5: Verify GREEN**

Run: `npm test -- --run src/layout/AppShell.test.tsx`

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/layout/AppShell.tsx frontend/src/layout/Navigation.tsx frontend/src/styles/global.css frontend/src/layout/AppShell.test.tsx
git commit -m "feat(layout): add responsive zyrp shell"
```

### Task 3: Compact Catalog landing page

**Files:**
- Modify: `frontend/src/catalog/CatalogHomePage.tsx`
- Test: `frontend/src/catalog/catalogPages.test.tsx`

- [ ] **Step 1: Write failing landing-page tests**

Assert the page has `data-testid="catalog-overview"`, heading “Catálogo”, a concise operational description, and exactly three continuation links: Produtos, Novo Produto and Impressão de Etiquetas. Assert the old seven-card grid is absent.

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run src/catalog/catalogPages.test.tsx -t "catalog home"`

Expected: FAIL because `catalog-overview` does not exist.

- [ ] **Step 3: Implement the compact overview**

Use one strong hero block, a status strip for the seven available areas, and the three continuation actions. Do not duplicate all navigation links from the contextual panel.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- --run src/catalog/catalogPages.test.tsx`

Expected: all catalog tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/catalog/CatalogHomePage.tsx frontend/src/catalog/catalogPages.test.tsx
git commit -m "feat(catalog): replace generic hub with module overview"
```

### Task 4: Pattern-B product editor visual contract

**Files:**
- Modify: `frontend/src/catalog/ProductEditorPage.tsx`
- Test: `frontend/src/catalog/catalogPages.test.tsx`

- [ ] **Step 1: Write failing structural assertions**

Assert `product-editor-layout` includes `data-layout="media-left-identity-right"`, the media region is labelled “Imagens do produto”, the identity region is labelled “Identificação do produto”, and the six tabs remain present.

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run src/catalog/catalogPages.test.tsx -t "media-left"`

Expected: FAIL because the layout contract attribute is absent.

- [ ] **Step 3: Implement the first-fold composition**

Place the title and save context in a compact toolbar, keep tabs directly beneath it, and use:

```tsx
<div
  data-testid="product-editor-layout"
  data-layout="media-left-identity-right"
  className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-[320px_minmax(0,1fr)]"
>
```

Use semantic headings/labels and prevent the right column from forcing horizontal scroll.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- --run src/catalog/catalogPages.test.tsx`

Expected: all catalog tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/catalog/ProductEditorPage.tsx frontend/src/catalog/catalogPages.test.tsx
git commit -m "feat(catalog): refine pattern b product editor"
```

### Task 5: Cross-browser and responsive acceptance

**Files:**
- Modify: `frontend/e2e/catalog-sprints-23-30.spec.ts`
- Create: `frontend/e2e/catalog-shell-responsive.spec.ts`

- [ ] **Step 1: Add failing desktop E2E assertions**

On `/catalog/products`, assert `module-navigation` and `catalog-context-navigation` are visible and all seven contextual links resolve to their exact `href` values.

- [ ] **Step 2: Add failing mobile scenario**

Use `test.use({ viewport: { width: 360, height: 800 } })`; assert desktop navigation is hidden, open the unique “Abrir menu” button, assert the drawer and seven links are visible, navigate to Produtos, and assert:

```ts
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
expect(overflow).toBe(false)
```

- [ ] **Step 3: Run E2E RED**

Run: `npx playwright test e2e/catalog-shell-responsive.spec.ts --project=chromium --workers=1`

Expected: FAIL before the new shell exists.

- [ ] **Step 4: Adjust only defects exposed by E2E**

Fix stable selectors, focus behavior, visibility or overflow in production components. Do not weaken assertions or add fixed waits.

- [ ] **Step 5: Run cross-browser GREEN**

Run: `npx playwright test e2e/catalog-sprints-23-30.spec.ts e2e/catalog-shell-responsive.spec.ts --workers=1`

Expected: PASS in Chromium, Firefox and WebKit.

- [ ] **Step 6: Commit**

```bash
git add frontend/e2e/catalog-sprints-23-30.spec.ts frontend/e2e/catalog-shell-responsive.spec.ts frontend/src
git commit -m "test(catalog): cover reference shell across viewports"
```

### Task 6: Final verification and documentation

**Files:**
- Modify: `docs/10_Releases/SPRINT-030_Catalog_Hardening_Acceptance_Final_Report.md`
- Modify: `docs/PRD.md`

- [ ] **Step 1: Run frontend regression**

Run: `npm test -- --run`

Expected: all Vitest files PASS.

- [ ] **Step 2: Run static checks and build**

Run: `npm run typecheck && npm run build`

Expected: exit code 0; record any non-blocking bundle warning.

- [ ] **Step 3: Run manual browser acceptance**

Restart Vite bound consistently to `127.0.0.1`, reload the in-app browser, authenticate with the E2E account, and inspect `/catalog`, `/catalog/products`, `/catalog/products/new` at desktop and 360 px. Confirm the design criteria rather than only route availability.

- [ ] **Step 4: Update evidence documents**

Record raw Vitest, TypeScript, build and Playwright counts, plus manual desktop/mobile observations. Remove the prior claim that the generic card shell satisfied the reference.

- [ ] **Step 5: Commit**

```bash
git add docs/PRD.md docs/10_Releases/SPRINT-030_Catalog_Hardening_Acceptance_Final_Report.md
git commit -m "docs(catalog): record visual acceptance evidence"
```

- [ ] **Step 6: Verify repository state**

Run: `git status --short && git log -6 --oneline`

Expected: clean worktree and the six scoped commits above.
