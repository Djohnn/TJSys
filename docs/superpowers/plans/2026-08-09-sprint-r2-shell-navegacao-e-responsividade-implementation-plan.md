# Sprint R2 — Shell navegação e responsividade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** reproduzir topbar rail flyouts e drawer com rotas reais.

**Architecture:** navigationModel é declarativo. AppShell controla um menu aberto por vez, restaura foco e converte o rail em drawer no breakpoint aprovado.

**Tech Stack:** React 18, React Router, TypeScript, Playwright, axe

---

## File map

- Create or modify: `frontend/src/layout/navigationModel.ts`
- Create or modify: `frontend/src/layout/Navigation.tsx`
- Create or modify: `frontend/src/layout/AppShell.tsx`
- Create or modify: `frontend/src/layout/AppShell.test.tsx`
- Create or modify: `frontend/e2e/r2-shell.spec.ts`

### Task 1: Fixar o contrato em RED

**Files:**
- Test: `frontend/src/layout/AppShell.test.tsx`
- Reference: `docs/superpowers/specs/2026-08-09-sprint-r2-shell-navegacao-e-responsividade-design.md`

- [ ] **Step 1: Write the failing test**

```tsx
it('fecha o flyout com Escape e não navega para item planned', async () => {
  const user = userEvent.setup()
  render(<TestApp initialEntry="/" />)
  await user.click(screen.getByRole('button', { name: 'Vendas' }))
  expect(screen.getByRole('menu', { name: 'Vendas' })).toBeVisible()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('menu', { name: 'Vendas' })).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run and confirm RED**

Run: `cd frontend && npm.cmd test -- --run src/layout/AppShell.test.tsx`

Expected: FAIL on the absent shell responsivo contract, not on fixture or authentication setup.

- [ ] **Step 3: Commit RED**

```bash
git add frontend/src/layout/AppShell.test.tsx
git commit -m "test(r2): define shell-navegacao-e-responsividade contract"
```

### Task 2: Implement the minimal production boundary

**Files:**
- Create or modify: `frontend/src/layout/navigationModel.ts`
- Create or modify: `frontend/src/layout/Navigation.tsx`
- Create or modify: `frontend/src/layout/AppShell.tsx`

- [ ] **Step 1: Add the typed boundary**

```typescript
export type NavigationItem = {
  id: string
  label: string
  route?: string
  status: 'active' | 'planned'
  children?: NavigationItem[]
}

export const canNavigate = (item: NavigationItem) => item.status === 'active' && Boolean(item.route)
```

Integrate this exact public shape in the named production files. Remove competing legacy exports only after all callers and tests use this boundary.

- [ ] **Step 2: Run the focused test and confirm GREEN**

Run: `cd frontend && npm.cmd test -- --run src/layout/AppShell.test.tsx`

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
git add frontend/src/layout/navigationModel.ts frontend/src/layout/Navigation.tsx frontend/src/layout/AppShell.tsx
git commit -m "feat(r2): implement shell-navegacao-e-responsividade"
```

### Task 3: Close visual accessibility and CI gates

**Files:**
- Create or modify: `frontend/e2e/r2-shell.spec.ts`
- Modify: `.github/workflows/e2e.yml`
- Modify: `docs/DOCUMENT_INDEX.md`

- [ ] **Step 1: Add Playwright and axe assertions**

```typescript
test('r2 visual and keyboard contract', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('body')).toHaveScreenshot('r2-shell-navegacao-e-responsividade.png')
  await expect(page.locator(':focus-visible')).toHaveCount(0)
})
```

Capture the approved desktop and mobile viewports, then add keyboard interaction and `@axe-core/playwright` with zero serious/critical violations. Do not use hardcoded waits or retries.

- [ ] **Step 2: Run all sprint gates**

```powershell
cd frontend
npm.cmd test -- --run
npx playwright test e2e/r2-shell-navegacao-e-responsividade.spec.ts --project=chromium --retries=0
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
git commit -m "test(r2): close visual acceptance"
```

## Completion checklist

- [ ] Named acceptance test maps to the sprint spec.
- [ ] No literal color exists outside the approved token boundary.
- [ ] Keyboard, axe, desktop and mobile visual checks pass.
- [ ] CI executes the focused gate with `retries: 0`.
- [ ] Legacy behavior is removed only after parity is proven.
