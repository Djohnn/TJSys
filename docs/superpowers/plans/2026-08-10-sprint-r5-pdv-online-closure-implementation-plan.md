# Sprint R5 PDV Electron Online Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar os gaps verificáveis do PDV Electron online da R5 sem iniciar o escopo offline da R6, fiscal da R7 ou maquineta.

**Architecture:** Manter o Electron dividido em main/preload/renderer, com chamadas de rede e SQLite no main process e IPC tipado para o renderer. Corrigir os contratos do cache para consumir produtos e preços do backend atual, e separar E2E determinístico mockado de cenários que exigem backend/artefato externo.

**Tech Stack:** Electron, React, TypeScript strict, Vite/electron-vite, Vitest, Playwright, ESLint 9 flat config, Axios, better-sqlite3, Django/DRF.

---

### Task 1: Restabelecer gates locais do pacote PDV

**Files:**
- Create: `pdv/eslint.config.mjs`
- Modify: `pdv/package.json`
- Modify: `pdv/tsconfig.json`
- Modify: `pdv/tsconfig.node.json`

- [ ] **Step 1: Write the failing gate commands**

Run from `pdv/`:

```powershell
npx tsc --noEmit
npm run lint
```

Expected baseline: typecheck reports TS6305 after a build and lint reports that ESLint 9 cannot find `eslint.config.*`.

- [ ] **Step 2: Add explicit scripts and flat ESLint configuration**

Add `typecheck` and configure `eslint.config.mjs` to lint `src/**/*.{ts,tsx}` with TypeScript parser/plugin and the existing React hooks rules. Keep generated `dist`, test-results and node_modules ignored.

- [ ] **Step 3: Make TypeScript checks independent of build artifacts**

Remove project-reference coupling that makes `tsc --noEmit` require generated declaration outputs, or provide a dedicated no-emit config used by the `typecheck` script. Do not enable declaration emission into `src/`.

- [ ] **Step 4: Run the gates**

```powershell
npm run typecheck
npm run lint
npm run build
```

Expected: zero TypeScript errors, zero ESLint errors, successful Electron build.

- [ ] **Step 5: Commit**

```powershell
git add pdv/eslint.config.mjs pdv/package.json pdv/tsconfig.json pdv/tsconfig.node.json
git commit -m "fix(r5): restore PDV quality gates"
```

### Task 2: Corrigir contrato do cache local de catálogo

**Files:**
- Modify: `pdv/src/main/services/catalogCache.ts`
- Create: `pdv/src/main/services/__tests__/catalogCache.test.ts`
- Modify: `pdv/src/main/ipc/catalog-cache.ts` only if the typed result contract changes

- [ ] **Step 1: Write failing cache-contract tests**

Cover:

```text
Given an active backend product page and a product pricing response,
When syncFromBackend runs,
Then it stores the product and the canonical ProductPrice amount/validity in SQLite.

Given a paginated product response,
When the next link is absent,
Then sync stops without an extra request.

Given a product without a price,
When price loading fails or returns an empty list,
Then the product remains searchable and no invalid price row is written.
```

- [ ] **Step 2: Run the focused test and confirm failure**

```powershell
npx vitest run src/main/services/__tests__/catalogCache.test.ts
```

Expected: failure because the current implementation calls `price-tiers` and maps tier records as base prices.

- [ ] **Step 3: Implement the canonical API mapping**

Use the existing `/products/` pagination contract and `/products/<id>/prices/` endpoint. Accept the backend response shape used by the current catalog API, persist only canonical `ProductPrice` rows, preserve `valid_from` and `valid_to`, and keep sync counts accurate.

- [ ] **Step 4: Run focused and full tests**

```powershell
npx vitest run src/main/services/__tests__/catalogCache.test.ts
npm test
```

Expected: focused tests pass and the complete PDV suite remains green.

- [ ] **Step 5: Commit**

```powershell
git add pdv/src/main/services/catalogCache.ts pdv/src/main/services/__tests__/catalogCache.test.ts pdv/src/main/ipc/catalog-cache.ts
git commit -m "fix(r5): align PDV catalog cache with price API"
```

### Task 3: Tornar o E2E online determinístico

**Files:**
- Modify: `pdv/playwright.config.ts`
- Modify: `pdv/e2e/fixtures/index.ts`
- Modify: `pdv/e2e/login.spec.ts`
- Modify: `pdv/e2e/sale.spec.ts`
- Modify: `pdv/e2e/product-stock-sale.spec.ts`
- Modify: `pdv/e2e/qa-visual.spec.ts`

- [ ] **Step 1: Classify current failures**

Run:

```powershell
npx playwright test --project=chromium --retries=0
```

Record separately: renderer-server startup failures, tests requiring the admin artifact, tests requiring a live backend and genuine assertion failures.

- [ ] **Step 2: Isolate the online test layers**

Keep login/dashboard tests fully route-mocked and independent of Django. Put live-backend scenarios behind an explicit project or environment gate. Make the admin-flow artifact path explicit and fail with a short actionable message when the prerequisite is not supplied.

- [ ] **Step 3: Fix renderer web-server lifecycle**

Configure one stable Vite command/root for Playwright, use a dedicated port, and ensure the test server is ready before navigation. Do not add hardcoded sleeps.

- [ ] **Step 4: Run deterministic E2E suites**

```powershell
npx playwright test e2e/login.spec.ts --project=chromium --retries=0
npx playwright test e2e/cash-session.spec.ts --project=chromium --retries=0
npx playwright test e2e/sale.spec.ts --project=chromium --retries=0
```

Expected: mockable R5 scenarios pass with zero retries; live scenarios either pass against the documented backend fixture or are excluded with an explicit prerequisite, never silently skipped.

- [ ] **Step 5: Commit**

```powershell
git add pdv/playwright.config.ts pdv/e2e
git commit -m "test(r5): stabilize PDV online E2E"
```

### Task 4: R5 final verification and documentation

**Files:**
- Modify: `docs/DOCUMENT_INDEX.md`
- Modify: `docs/PRD.md` only if the recorded evidence is demonstrably stale
- Create: `docs/10_Releases/SPRINT-005_PDV_Electron_Online_Final_Report.md`

- [ ] **Step 1: Run the complete gates**

```powershell
cd pdv
npm run typecheck
npm test
npm run lint
npm run build
npx playwright test --project=chromium --retries=0
```

- [ ] **Step 2: Run applicable backend checks**

```powershell
cd backend
python manage.py check
python manage.py makemigrations --check --dry-run
pytest tests/test_session_auth.py tests/test_sales_api.py tests/test_cash_sessions_api.py -q --no-cov
```

- [ ] **Step 3: Record raw evidence and remaining scope**

Document counts, durations, known non-blocking warnings, the online-only boundary, and explicit follow-ups for R6 offline synchronization and R7 fiscal integration.

- [ ] **Step 4: Mark R5 complete only if all acceptance evidence is green**

Update the document index and report with the commit IDs and exact commands. Leave the sprint open if a live-backend prerequisite remains unavailable.

- [ ] **Step 5: Commit**

```powershell
git add docs/DOCUMENT_INDEX.md docs/PRD.md docs/10_Releases/SPRINT-005_PDV_Electron_Online_Final_Report.md
git commit -m "docs(r5): record PDV online acceptance"
```
