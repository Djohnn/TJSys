# Sprint F3 — Vendas pré-venda Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** criar orçamento pedido e conversão idempotente em venda.

**Architecture:** Quote e SalesOrder usam máquina de estados e linhas versionadas. Serviço de conversão chama o fluxo canônico de venda.

**Tech Stack:** Django, DRF, React, PostgreSQL

---

## File map

- Create or modify: `backend/sales/models.py` — contrato persistente ou declarativo da sprint.
- Create or modify: `backend/sales/services.py` — regra canônica, sem lógica duplicada na UI.
- Create or modify: `backend/tests/test_sales_preorder.py` — regressão do cenário vertical.
- Create or modify: `frontend/src/salesManagement/SalesOrdersPage.tsx` — superfície acessível ligada ao contrato.
- Modify: `frontend/src/app/App.tsx` — rota protegida quando a sprint introduzir página.
- Modify: `frontend/src/layout/navigationModel.ts` — trocar `planned` por rota real somente ao concluir.

### Task 1: Fixar o contrato em teste

**Files:**
- Test: `backend/tests/test_sales_preorder.py`
- Reference: `docs/superpowers/specs/2026-08-09-sprint-f3-vendas-pre-venda-design.md`

- [ ] **Step 1: Write the failing acceptance test**

Use Given/When/Then e registre o contrato mínimo:

```python
def test_f3_acceptance_contract(api_client, tenant_headers):
    # Given an authenticated tenant and valid sprint fixture
    response = api_client.get('/api/v1/sales/orders/{order_id}/convert/', headers=tenant_headers)
    # When the canonical contract is requested
    assert response.status_code in {200, 201}
    # Then the vertical invariant is observable
    assert Sale.objects.filter(source_order=order).count() == 1
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `cd backend && ..\\.venv\\Scripts\\python.exe -m pytest tests/test_sales_preorder.py -q --no-cov`

Expected: FAIL because the F3 contract, route or accessible control does not exist yet.

- [ ] **Step 3: Commit the RED test**

```bash
git add backend/tests/test_sales_preorder.py docs/superpowers/specs/2026-08-09-sprint-f3-vendas-pre-venda-design.md
git commit -m "test(f3): define acceptance contract"
```

### Task 2: Implement the domain boundary

**Files:**
- Create or modify: `backend/sales/models.py`
- Create or modify: `backend/sales/services.py`
- Test: `backend/tests/test_sales_preorder.py`

- [ ] **Step 1: Add the smallest explicit boundary**

Keep orchestration in one callable and require tenant plus command identity:

```python
from dataclasses import dataclass
from uuid import UUID

@dataclass(frozen=True)
class SprintF3Command:
    tenant_id: UUID
    command_id: UUID
    payload: dict[str, object]

def execute_f3_command(command: SprintF3Command) -> dict[str, object]:
    """Validate tenant scope, apply one transaction and return a stable result."""
    if not command.payload:
        raise ValueError('payload must not be empty')
    return {'command_id': str(command.command_id), 'status': 'applied'}
```

Implement the exported boundary directly in `backend/sales/services.py`; persist the declared fields in `backend/sales/models.py`; create the numbered migration plus PostgreSQL RLS for every tenant table; and register `/api/v1/sales/orders/{order_id}/convert/` in the app's existing serializer/view/router files.

- [ ] **Step 2: Prove negative, tenant and replay behavior**

Add three named tests: `test_f3_acceptance_contract_rejects_invalid`, `test_f3_acceptance_contract_isolates_tenant`, and `test_f3_acceptance_contract_replays_command_id`. Each must assert response and side-effect counts.

- [ ] **Step 3: Run backend gates**

Run:

```powershell
cd backend
..\.venv\Scripts\python.exe -m pytest tests/test_sales_preorder.py -q --no-cov
..\.venv\Scripts\python.exe manage.py makemigrations --check --dry-run
..\.venv\Scripts\python.exe manage.py check
..\.venv\Scripts\python.exe -m ruff check .
```

Expected: focused tests PASS, no model drift, zero Django issues and Ruff exit 0.

- [ ] **Step 4: Commit the domain slice**

```bash
git add backend/sales/models.py backend/sales/services.py backend/tests/test_sales_preorder.py backend/*/migrations
git commit -m "feat(f3): implement domain contract"
```

### Task 3: Implement the accessible UI slice

**Files:**
- Create or modify: `frontend/src/salesManagement/SalesOrdersPage.tsx`
- Modify: `frontend/src/app/App.tsx`
- Modify: `frontend/src/layout/navigationModel.ts`
- Test: `frontend/src/app/App.test.tsx`

- [ ] **Step 1: Write the failing component test**

```typescript
it('f3 renders Converter em venda and reports API errors', async () => {
  render(<TestApp initialEntry="/" />)
  expect(await screen.findByText(/Converter em venda/i)).toBeVisible()
  server.use(http.get(/f3/, () => HttpResponse.json({ title: 'Falha controlada' }, { status: 422 })))
  expect(await screen.findByRole('alert')).toHaveTextContent('Falha controlada')
})
```

- [ ] **Step 2: Run the component test and confirm RED**

Run: `cd frontend && npm.cmd test -- --run src/app/App.test.tsx`

Expected: FAIL before the route/control and error state are implemented.

- [ ] **Step 3: Implement the route using shared UI primitives**

```tsx
export function SprintF3Page() {
  return (
    <main aria-labelledby="f3-title">
      <h1 id="f3-title">Converter em venda</h1>
      <section aria-live="polite" data-testid="f3-content" />
    </main>
  )
}
```

Replace `data-testid="f3-content"` with the page's typed query and form components named in the file map, including explicit loading, empty, Problem Details error, 409 conflict and success states. Use tokens from `frontend/src/styles/tokens.css`; no literal HEX. Keep navigation `planned` until component and backend gates are green.

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
git add frontend/src/salesManagement/SalesOrdersPage.tsx frontend/src/app/App.tsx frontend/src/layout/navigationModel.ts frontend/src
git commit -m "feat(f3): expose accessible workflow"
```

### Task 4: Close the vertical acceptance gate

**Files:**
- Create or modify: `frontend/e2e/f3-vendas-pre-venda.spec.ts`
- Modify: `.github/workflows/e2e.yml`
- Modify: `docs/DOCUMENT_INDEX.md`

- [ ] **Step 1: Add the deterministic Playwright scenario**

```typescript
test('f3 vertical acceptance', async ({ page }) => {
  // Given seeded tenant data and an authenticated storage state
  await page.goto('/')
  // When the user opens the real route
  await page.getByRole('link', { name: /Converter em venda/i }).click()
  // Then the sprint surface is usable without retries
  await expect(page.getByRole('heading', { name: /Converter em venda/i })).toBeVisible()
})
```

Use API setup/cleanup or an isolated test database; do not use timeouts, current-time identifiers or retry to mask races.

- [ ] **Step 2: Run acceptance and accessibility**

Run: `cd frontend && npx playwright test e2e/f3-vendas-pre-venda.spec.ts --project=chromium --retries=0`

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
git add frontend/e2e/f3-vendas-pre-venda.spec.ts .github/workflows/e2e.yml docs/DOCUMENT_INDEX.md graphify-out
git commit -m "test(f3): close vertical acceptance"
```

## Completion checklist

- [ ] Spec scenario is mapped to a named test.
- [ ] Tenant isolation, permission denial and idempotent replay are proven where applicable.
- [ ] Migration is reversible and RLS exists for new tenant tables.
- [ ] UI matches the approved design tokens and passes keyboard/axe checks.
- [ ] CI runs the focused tests with retries disabled.
- [ ] Navigation changes from `planned` only after every gate above passes.
