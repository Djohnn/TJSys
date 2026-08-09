# Sprint R3 — Produto identidade mídia e EAN automático Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** entregar o card principal idêntico com EAN-13 interno seguro.

**Architecture:** Um comando agregado aplica identidade e mídia; uma sequência tenant-scoped gera EAN em transação. React usa uma única mutation.

**Tech Stack:** Django, DRF, PostgreSQL, React, TanStack Query, Playwright

---

## File map

- Create or modify: `backend/catalog/models.py` — contrato persistente ou declarativo da sprint.
- Create or modify: `backend/catalog/services/product_application.py` — regra canônica, sem lógica duplicada na UI.
- Create or modify: `backend/tests/test_product_redesign_identity.py` — regressão do cenário vertical.
- Create or modify: `frontend/src/catalog/ProductEditorPage.tsx` — superfície acessível ligada ao contrato.
- Modify: `frontend/src/app/App.tsx` — rota protegida quando a sprint introduzir página.
- Modify: `frontend/src/layout/navigationModel.ts` — trocar `planned` por rota real somente ao concluir.

### Task 1: Fixar o contrato em teste

**Files:**
- Test: `backend/tests/test_product_redesign_identity.py`
- Reference: `docs/superpowers/specs/2026-08-09-sprint-r3-produto-identidade-midia-e-ean-automatico-design.md`

- [ ] **Step 1: Write the failing acceptance test**

Use Given/When/Then e registre o contrato mínimo:

```python
def test_r3_acceptance_contract(api_client, tenant_headers):
    # Given an authenticated tenant and valid sprint fixture
    response = api_client.get('/api/v1/catalog/products/apply/', headers=tenant_headers)
    # When the canonical contract is requested
    assert response.status_code in {200, 201}
    # Then the vertical invariant is observable
    assert len(response.json()['barcode']) == 13
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `cd backend && ..\\.venv\\Scripts\\python.exe -m pytest tests/test_product_redesign_identity.py -q --no-cov`

Expected: FAIL because the R3 contract, route or accessible control does not exist yet.

- [ ] **Step 3: Commit the RED test**

```bash
git add backend/tests/test_product_redesign_identity.py docs/superpowers/specs/2026-08-09-sprint-r3-produto-identidade-midia-e-ean-automatico-design.md
git commit -m "test(r3): define acceptance contract"
```

### Task 2: Implement the domain boundary

**Files:**
- Create or modify: `backend/catalog/models.py`
- Create or modify: `backend/catalog/services/product_application.py`
- Test: `backend/tests/test_product_redesign_identity.py`

- [ ] **Step 1: Add the smallest explicit boundary**

Keep orchestration in one callable and require tenant plus command identity:

```python
from dataclasses import dataclass
from uuid import UUID

@dataclass(frozen=True)
class SprintR3Command:
    tenant_id: UUID
    command_id: UUID
    payload: dict[str, object]

def execute_r3_command(command: SprintR3Command) -> dict[str, object]:
    """Validate tenant scope, apply one transaction and return a stable result."""
    if not command.payload:
        raise ValueError('payload must not be empty')
    return {'command_id': str(command.command_id), 'status': 'applied'}
```

Implement the exported boundary directly in `backend/catalog/services/product_application.py`; persist the declared fields in `backend/catalog/models.py`; create the numbered migration plus PostgreSQL RLS for every tenant table; and register `/api/v1/catalog/products/apply/` in the app's existing serializer/view/router files.

- [ ] **Step 2: Prove negative, tenant and replay behavior**

Add three named tests: `test_r3_acceptance_contract_rejects_invalid`, `test_r3_acceptance_contract_isolates_tenant`, and `test_r3_acceptance_contract_replays_command_id`. Each must assert response and side-effect counts.

- [ ] **Step 3: Run backend gates**

Run:

```powershell
cd backend
..\.venv\Scripts\python.exe -m pytest tests/test_product_redesign_identity.py -q --no-cov
..\.venv\Scripts\python.exe manage.py makemigrations --check --dry-run
..\.venv\Scripts\python.exe manage.py check
..\.venv\Scripts\python.exe -m ruff check .
```

Expected: focused tests PASS, no model drift, zero Django issues and Ruff exit 0.

- [ ] **Step 4: Commit the domain slice**

```bash
git add backend/catalog/models.py backend/catalog/services/product_application.py backend/tests/test_product_redesign_identity.py backend/*/migrations
git commit -m "feat(r3): implement domain contract"
```

### Task 3: Implement the accessible UI slice

**Files:**
- Create or modify: `frontend/src/catalog/ProductEditorPage.tsx`
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/src/layout/navigationModel.ts`
- Test: `frontend/src/app/App.test.tsx`

- [ ] **Step 1: Write the failing component test**

```typescript
it('r3 renders Código de barras and reports API errors', async () => {
  render(<TestApp initialEntry="/" />)
  expect(await screen.findByText(/Código de barras/i)).toBeVisible()
  server.use(http.get(/r3/, () => HttpResponse.json({ title: 'Falha controlada' }, { status: 422 })))
  expect(await screen.findByRole('alert')).toHaveTextContent('Falha controlada')
})
```

- [ ] **Step 2: Run the component test and confirm RED**

Run: `cd frontend && npm.cmd test -- --run src/app/App.test.tsx`

Expected: FAIL before the route/control and error state are implemented.

- [ ] **Step 3: Implement the route using shared UI primitives**

```tsx
export function SprintR3Page() {
  return (
    <main aria-labelledby="r3-title">
      <h1 id="r3-title">Código de barras</h1>
      <section aria-live="polite" data-testid="r3-content" />
    </main>
  )
}
```

Replace `data-testid="r3-content"` with the page's typed query and form components named in the file map, including explicit loading, empty, Problem Details error, 409 conflict and success states. Use tokens from `frontend/src/styles/tokens.css`; no literal HEX. Keep navigation `planned` until component and backend gates are green.

- [ ] **Step 4: Run frontend gates**

Run:

```powershell
cd frontend
npm.cmd test -- --run
npm.cmd run typecheck
npm.cmd run build
```

Expected: all Vitest files PASS, TypeScript exit 0 and Vite build completes.

- [ ] **Step 5: Commit the UI slice**

```bash
git add frontend/src/catalog/ProductEditorPage.tsx frontend/src/app/App.tsx frontend/src/layout/navigationModel.ts frontend/src
git commit -m "feat(r3): expose accessible workflow"
```

### Task 4: Close the vertical acceptance gate

**Files:**
- Create or modify: `frontend/e2e/r3-produto-identidade-midia-e-ean-automatico.spec.ts`
- Modify: `.github/workflows/e2e.yml`
- Modify: `docs/DOCUMENT_INDEX.md`

- [ ] **Step 1: Add the deterministic Playwright scenario**

```typescript
test('r3 vertical acceptance', async ({ page }) => {
  // Given seeded tenant data and an authenticated storage state
  await page.goto('/')
  // When the user opens the real route
  await page.getByRole('link', { name: /Código de barras/i }).click()
  // Then the sprint surface is usable without retries
  await expect(page.getByRole('heading', { name: /Código de barras/i })).toBeVisible()
})
```

Use API setup/cleanup or an isolated test database; do not use timeouts, current-time identifiers or retry to mask races.

- [ ] **Step 2: Run acceptance and accessibility**

Run: `cd frontend && npx playwright test e2e/r3-produto-identidade-midia-e-ean-automatico.spec.ts --project=chromium --retries=0`

Expected: 1 scenario PASS with trace/screenshots retained on failure and zero serious axe violations.

- [ ] **Step 3: Run final repository checks and update Graphify**

Run:

```powershell
git diff --check
graphify update .
```

Expected: no whitespace errors; Graphify completes or the access-denied infrastructure blocker is recorded without hiding test results.

- [ ] **Step 4: Commit sprint closure**

```bash
git add frontend/e2e/r3-produto-identidade-midia-e-ean-automatico.spec.ts .github/workflows/e2e.yml docs/DOCUMENT_INDEX.md graphify-out
git commit -m "test(r3): close vertical acceptance"
```

## Completion checklist

- [ ] Spec scenario is mapped to a named test.
- [ ] Tenant isolation, permission denial and idempotent replay are proven where applicable.
- [ ] Migration is reversible and RLS exists for new tenant tables.
- [ ] UI matches the approved design tokens and passes keyboard/axe checks.
- [ ] CI runs the focused tests with retries disabled.
- [ ] Navigation changes from `planned` only after every gate above passes.
