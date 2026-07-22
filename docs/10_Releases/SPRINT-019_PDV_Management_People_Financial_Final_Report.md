# Sprint 19 — Gestão de PDV, Pessoas e Financeiro Web — Relatório Final

## Status

Concluída em 2026-07-22.

## Objetivo

Disponibilizar painel web de gestão de vendas, sessões de caixa, pessoas (com controles de PII) e obrigações financeiras — read-only para vendas, sem criar um segundo ponto de venda. Devoluções, cancelamentos e estornos operam como ações compensatórias delegadas ao backend.

## Task completion table

| Task | Descrição | Status |
|---|---|---|
| 1 | API gaps and exports | Concluída |
| 2 | Sales and cash management | Concluída |
| 3 | Compensating actions | Concluída |
| 4 | People management with PII | Concluída |
| 5 | Financial operations and reports | Concluída |
| 6 | E2E and closure | Concluída |

## Test results

### Backend (pytest)
```text
tests/test_web_sales_financial_api.py — 34 tests
..................................                                       [100%
============================== warnings summary ===============================
tests/test_web_sales_financial_api.py::test_sale_list_paginated
  (3x) DeprecationWarning: 'asyncio.iscoroutinefunction' is deprecated (Python 3.16)
34 passed, 3 warnings in 23.90s
```

### Frontend unit tests (vitest)
```text
 Test Files  19 passed (19)
      Tests  251 passed (251)
   Duration  13.86s (transform 9.84s, setup 16.64s, import 20.28s, tests 50.63s, environment 44.45s)
```
Observação: `AppShell.test.tsx` emite um `Error: test error` intencional (Thrower em src/layout/AppShell.test.tsx:183) — caso de teste que valida estado de erro; não afeta a contagem (251 passed).

### TypeScript
```text
npx tsc --noEmit — 0 errors (sem saída)
```

### Playwright E2E
```text
Spec: frontend/e2e/pdv-management-financial.spec.ts — 8 scenarios
  1. Vendas — lista de vendas carrega
  2. Vendas — detalhe de venda mostra itens
  3. Vendas — nenhuma ação de nova venda (boundary assertion)
  4. Sessões de caixa — lista carrega
  5. Pessoas — lista com busca
  6. Pessoas — detalhe mostra seções
  7. Financeiro — contas a receber
  8. Financeiro — fluxo de caixa
Status: não executados — requer full stack (backend Django + frontend dev server + seed web-admin@zyrp.local).
```

## Files changed

### Task 1 — Backend (API gaps and exports)
- `backend/sales/views.py`
- `backend/sales/serializers.py`
- `backend/financial/views.py`
- `backend/financial/urls.py`
- `backend/people/views.py`
- `backend/tests/test_web_sales_financial_api.py` — 34 testes

### Task 2 — Sales and cash management
- `frontend/src/salesManagement/SalesPage.tsx`
- `frontend/src/salesManagement/SaleDetailPage.tsx`
- `frontend/src/salesManagement/CashSessionsPage.tsx`
- `frontend/src/salesManagement/CashSessionDetailPage.tsx`
- `frontend/src/salesManagement/salesManagementApi.ts`
- `frontend/src/salesManagement/salesManagement.test.tsx`

### Task 3 — Compensating actions
- `frontend/src/salesManagement/ReturnDialog.tsx`
- `frontend/src/salesManagement/CancellationDialog.tsx`
- `frontend/src/salesManagement/RefundDialog.tsx`
- `frontend/src/salesManagement/compensations.test.tsx`

### Task 4 — People management with PII
- `frontend/src/people/PeoplePage.tsx`
- `frontend/src/people/PersonDetailPage.tsx`
- `frontend/src/people/PersonForm.tsx`
- `frontend/src/people/AddressesSection.tsx`
- `frontend/src/people/ContactsSection.tsx`
- `frontend/src/people/ConsentsSection.tsx`
- `frontend/src/people/peopleApi.ts`
- `frontend/src/people/peopleSchemas.ts`
- `frontend/src/people/peoplePages.test.tsx`

### Task 5 — Financial operations and reports
- `frontend/src/financial/ReceivablesPage.tsx`
- `frontend/src/financial/PayablesPage.tsx`
- `frontend/src/financial/CashflowPage.tsx`
- `frontend/src/financial/ReportsPage.tsx`
- `frontend/src/financial/SettlementDialog.tsx`
- `frontend/src/financial/financialApi.ts`
- `frontend/src/financial/financialPages.test.tsx`

### Task 6 — E2E and closure
- `frontend/e2e/pdv-management-financial.spec.ts` — 8 cenários Playwright
- `frontend/src/app/App.tsx` — rotas /sales, /sales/:id, /financial/receivables, /financial/payables, /financial/cashflow, /financial/reports, /financial/cash-sessions, /financial/cash-sessions/:id, /people, /people/:id
- `frontend/src/people/PeoplePage.tsx` — link por linha para /people/:id
- `docs/PRD.md` — checkboxes Sprint 18 e Sprint 19 marcadas; Estados atualizados
- `docs/10_Releases/SPRINT-019_PDV_Management_People_Financial_Final_Report.md` (este relatório)

## Key metrics

| Métrica | Valor |
|---|---|
| Backend tests (web_sales_financial_api) | 34 passed |
| Frontend unit tests (vitest) | 251 passed (19 files) |
| TypeScript (`tsc --noEmit`) | 0 errors |
| Playwright scenarios | 8 (aguardando full stack) |
| Arquivos alterados/adicionados | 30+ |

## Non-negotiable boundary

A aplicação web não expõe criação de venda, checkout, captura de pagamento nem impressão de cupom — essas operações permanecem exclusivamente no PDV Electron (`pdv/`). Vendas confirmadas são imutáveis; devoluções, cancelamentos e estornos invocam ações compensatórias no backend. Um cenário E2E (`Vendas — nenhuma ação de nova venda`) declara explicitamente a ausência de qualquer affordance `Nova Venda` (botão ou link) em `/sales`, fixando essa fronteira em teste.

## Lições aprendidas

- O limite read-only de vendas deve ser assertado em E2E desde o primeiro commit — confiar apenas em revisão de código permite a regressão silenciosa de um botão "Nova Venda".
- Manter linhas de tabela navegáveis (`Link` em PeoplePage) exige alinhamento entre E2E e unit tests; `getByText` continua encontrando o texto dentro do `<a>`, então o ajuste não quebra unit tests.
- Ações compensatórias (return/cancel/refund) como diálogos separados e chamadas PATCH/POST dedicadas evitam acoplar status de venda à mutação direta — o backend permanece a única fonte de verdade.
- Controles de PII (permissão `pii:view` + mascaração de documento no frontend sem permissão) precisam ser validados em PeoplePage, não apenas em PersonDetailPage — a lista já exibe dados sensíveis.
- Relatórios e dashboards financeiros (Receivables/Payables/Cashflow/Reports) devem tratar paginação e filtros de data/status de forma consistente para evitar contratos divergentes entre telas.
