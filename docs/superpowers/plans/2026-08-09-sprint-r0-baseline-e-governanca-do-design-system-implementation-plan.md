# Sprint R0 — Baseline e governança do Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** versionar referências visuais e bloquear deriva de cor.

**Architecture:** O manifesto registra hashes dos quatro artefatos aprovados. Um script Node percorre arquivos rastreados do frontend e rejeita literais HEX fora de tokens/fixtures.

**Tech Stack:** Markdown, Node.js, Vitest, Git

---

## File map

- Create or modify: `docs/02_Architecture/design-system/reference/manifest.json`
- Create or modify: `docs/02_Architecture/design-system/reference/redesign.html`
- Create or modify: `docs/02_Architecture/design-system/reference/design-system-paleta-cor.md`
- Create or modify: `frontend/scripts/check-design-tokens.mjs`
- Create or modify: `frontend/src/styles/designGovernance.test.ts`

### Task 1: Fixar o contrato em RED

**Files:**
- Test: `frontend/src/styles/designGovernance.test.ts`
- Reference: `docs/superpowers/specs/2026-08-09-sprint-r0-baseline-e-governanca-do-design-system-design.md`

- [ ] **Step 1: Write the failing test**

```tsx
import manifest from '../../../docs/02_Architecture/design-system/reference/manifest.json'

it('fixa a versão e os hashes aprovados', () => {
  expect(manifest.version).toBe('1.0.0')
  expect(manifest.assets.redesign.sha256).toMatch(/^[A-F0-9]{64}$/)
  expect(manifest.assets.logoBlue.sha256).toBe('8DF077FA7F5F87D51C9F0A940F5AE6B670B555A41EB51EA1DE0F90BE1AEA59C2')
})
```

- [ ] **Step 2: Run and confirm RED**

Run: `cd frontend && npm.cmd test -- --run src/styles/designGovernance.test.ts`

Expected: FAIL on the absent manifesto e verificador contract, not on fixture or authentication setup.

- [ ] **Step 3: Commit RED**

```bash
git add frontend/src/styles/designGovernance.test.ts
git commit -m "test(r0): define baseline-e-governanca-do-design-system contract"
```

### Task 2: Implement the minimal production boundary

**Files:**
- Create or modify: `docs/02_Architecture/design-system/reference/manifest.json`
- Create or modify: `docs/02_Architecture/design-system/reference/redesign.html`
- Create or modify: `docs/02_Architecture/design-system/reference/design-system-paleta-cor.md`

- [ ] **Step 1: Add the typed boundary**

```javascript
export const forbiddenHex = /#[0-9a-fA-F]{3,8}\b/g
export function findLiteralColors(path, source) {
  if (path.endsWith('tokens.css') || path.includes('/test/')) return []
  return [...source.matchAll(forbiddenHex)].map(match => ({ path, value: match[0] }))
}
```

Integrate this exact public shape in the named production files. Remove competing legacy exports only after all callers and tests use this boundary.

- [ ] **Step 2: Run the focused test and confirm GREEN**

Run: `cd frontend && npm.cmd test -- --run src/styles/designGovernance.test.ts`

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
git add docs/02_Architecture/design-system/reference/manifest.json docs/02_Architecture/design-system/reference/redesign.html docs/02_Architecture/design-system/reference/design-system-paleta-cor.md
git commit -m "feat(r0): implement baseline-e-governanca-do-design-system"
```

### Task 3: Close visual accessibility and CI gates

**Files:**
- Create or modify: `frontend/src/styles/designGovernance.test.ts`
- Modify: `.github/workflows/e2e.yml`
- Modify: `docs/DOCUMENT_INDEX.md`

- [ ] **Step 1: Add Playwright and axe assertions**

```typescript
test('r0 visual and keyboard contract', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('body')).toHaveScreenshot('r0-baseline-e-governanca-do-design-system.png')
  await expect(page.locator(':focus-visible')).toHaveCount(0)
})
```

Capture the approved desktop and mobile viewports, then add keyboard interaction and `@axe-core/playwright` with zero serious/critical violations. Do not use hardcoded waits or retries.

- [ ] **Step 2: Run all sprint gates**

```powershell
cd frontend
npm.cmd test -- --run
npx playwright test e2e/r0-baseline-e-governanca-do-design-system.spec.ts --project=chromium --retries=0
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
git commit -m "test(r0): close visual acceptance"
```

## Completion checklist

- [ ] Named acceptance test maps to the sprint spec.
- [ ] No literal color exists outside the approved token boundary.
- [ ] Keyboard, axe, desktop and mobile visual checks pass.
- [ ] CI executes the focused gate with `retries: 0`.
- [ ] Legacy behavior is removed only after parity is proven.
