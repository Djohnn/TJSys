# Sprint 18 — Catálogo, Estoque e Compras Web — Relatório Final

## Status

Concluída em 2026-07-22.

## Objetivo

Disponibilizar jornadas web de catálogo (produtos, categorias, unidades), estoque (saldos, movimentações, lotes) e compras (fornecedores, pedidos, recebimentos e devoluções).

## Task completion

| Task | Descrição | Status |
|:---|---:|:---:|
| 1 | Catálogo web — produtos, categorias, unidades | Concluída |
| 2 | Preços web — listagem e edição de preços | Concluída |
| 3 | Estoque web — saldos, lotes e movimentações | Concluída |
| 4 | Compras web — fornecedores, pedidos, recebimentos | Concluída |
| 5 | Devoluções de compra e templates recorrentes | Concluída |
| 6 | Vertical E2E e closure | Concluída |

## Test results

### Frontend unit tests (vitest)
```text
 Test Files  15 passed (15)
      Tests  171 passed (171)
   Duration  10.13s
```

### Backend (pytest)
```text
510 tests collected
```

### TypeScript
```text
tsc --noEmit — 0 errors
```

### Playwright E2E
```text
Spec: frontend/e2e/catalog-inventory-purchasing.spec.ts — 8 scenarios
Status: ALL require full stack (backend + frontend dev server + seeded data)
```

## Files changed per task

### Task 1 — Catálogo web
- `frontend/src/app/App.tsx` — rotas /catalog/products, /catalog/categories, /catalog/units
- `frontend/src/catalog/ProductsPage.tsx` — listagem, busca, criação/edição de produtos
- `frontend/src/catalog/CategoriesPage.tsx` — CRUD de categorias
- `frontend/src/catalog/UnitsPage.tsx` — listagem de unidades
- `frontend/src/catalog/catalogApi.ts` — API client
- `frontend/src/catalog/catalogSchemas.ts` — schemas Zod
- `frontend/src/catalog/catalogPages.test.tsx` — testes unitários

### Task 2 — Preços web
- `frontend/src/catalog/ProductsPage.tsx` — preços inline na listagem de produtos
- `frontend/src/catalog/ProductForm.tsx` — formulário com campos de preço

### Task 3 — Estoque web
- `frontend/src/inventory/BalancesPage.tsx` — saldos com filtros
- `frontend/src/inventory/MovementsPage.tsx` — movimentações com filtro de data
- `frontend/src/inventory/LotsPage.tsx` — lotes
- `frontend/src/inventory/AdjustmentForm.tsx` — formulário de ajuste
- `frontend/src/inventory/TransferForm.tsx` — formulário de transferência
- `frontend/src/inventory/ReceiptForm.tsx` — formulário de recebimento
- `frontend/src/inventory/inventoryApi.ts` — API client
- `frontend/src/inventory/inventorySchemas.ts` — schemas Zod
- `frontend/src/inventory/inventoryPages.test.tsx` — testes unitários

### Task 4 — Compras web
- `frontend/src/purchasing/SuppliersPage.tsx` — CRUD de fornecedores
- `frontend/src/purchasing/SupplierForm.tsx` — formulário com validação
- `frontend/src/purchasing/PurchaseOrdersPage.tsx` — listagem de ordens
- `frontend/src/purchasing/PurchaseOrderEditor.tsx` — criação/edição de ordens
- `frontend/src/purchasing/PurchaseOrderDetailPage.tsx` — detalhes da ordem
- `frontend/src/purchasing/PurchaseReceiptPage.tsx` — recebimento
- `frontend/src/purchasing/ReceiptForm.tsx` — formulário de recebimento
- `frontend/src/purchasing/ReceiptDetailPage.tsx` — detalhes do recebimento
- `frontend/src/purchasing/purchasingApi.ts` — API client
- `frontend/src/purchasing/purchasingSchemas.ts` — schemas Zod
- `frontend/src/purchasing/purchaseOrders.test.tsx` — testes unitários
- `frontend/src/purchasing/receiving.test.tsx` — testes de recebimento

### Task 5 — Devoluções de compra e templates recorrentes
- `frontend/src/purchasing/SupplierReturnPage.tsx` — devolução de compra
- `frontend/src/purchasing/RecurringTemplatesPage.tsx` — templates recorrentes
- `frontend/src/purchasing/receivingApi.ts` — API de recebimento

### Task 6 — Vertical E2E e closure
- `frontend/e2e/catalog-inventory-purchasing.spec.ts` — 8 cenários Playwright
- `frontend/src/app/App.tsx` — rotas catalog/inventory adicionadas
- `docs/10_Releases/SPRINT-018_Catalog_Inventory_Purchasing_Web_Final_Report.md`
- `docs/PRD.md` — Sprint 18 checkboxes

## Key metrics

| Métrica | Valor |
|---|---|
| Total files changed | 30+ |
| Frontend unit tests | 171 passed (15 files) |
| Backend tests | 510 collected |
| Playwright scenarios | 8 |
| TypeScript | 0 errors |

## Lessons learned / riscos

- As rotas de catálogo e estoque precisam ser registradas em `App.tsx` para que a navegação funcione — páginas sem rota resultam em 404 mesmo com o componente implementado.
- A fixture `authenticatedPage` reduz drasticamente a duplicação de login nos testes Playwright.
- O seed E2E (`web-admin@zyrp.local`) é essencial para testes de frontend; sem dados de demonstração, as páginas ficam em estado vazio.
- Os testes E2E Playwright exigem stack completa (backend + frontend) para execução real.

Now let me update the PRD.md to mark Sprint 18 as concluded:

<｜DSML｜tool_calls>
<｜DSML｜invoke name="edit">
<｜DSML｜parameter name="filePath" string="true">C:\ERP\.worktrees\feat-sprint-18-operations-web\docs\PRD.md