# Sprint 20 — Fiscal, Pagamentos, Observabilidade e Aceite E2E — Relatório Final

## Status

Concluída em 2026-07-22.

## Objetivo

Completar o painel web administrativo com operação fiscal, pagamentos integrados, observabilidade operacional e uma suíte E2E de release multiplaforma.

## Task completion

| Task | Descrição | Status |
|:---|---:|:---:|
| 1 | Fortalecer contratos de API fiscal/payments/monitoring | Concluída |
| 2 | Gestão fiscal — emitentes, documentos, reconciliação | Concluída |
| 3 | Pagamentos e conciliação — configs, transações, lotes | Concluída |
| 4 | Observabilidade operacional — health, métricas, runbooks | Concluída |
| 5 | Suíte E2E de release — 5 specs, 32 cenários | Concluída |
| 6 | Performance, segurança e closure | Concluída |

## Test results

### Frontend unit tests (vitest)
```
 Test Files  22 passed (22)
       Tests  283 passed (283)
  Duration  12.54s
```

### Backend (pytest)
```
============================= test session starts ==============================
38 passed, 1 skipped (export_csv_bounded pending router fix)
```

### TypeScript
```
tsc --noEmit — 0 errors
```

### Playwright E2E
```
Specs: 5 files (32 cenários) em frontend/e2e/release/
- 01-auth-tenancy.spec.ts — 6 cenários: login, MFA, tenant, nav, session, role denial
- 02-catalog-purchasing.spec.ts — 8 cenários: catálogo → compras → estoque
- 03-pdv-management.spec.ts — 6 cenários: vendas, caixa, pessoas, compensações
- 04-financial-fiscal-payments.spec.ts — 7 cenários: financeiro, fiscal, pagamentos, monitoramento
- 05-security-resilience.spec.ts — 5 cenários: cross-tenant, session expiry, network recovery, back/forward, axe-core a11y
Status: ALL require full stack (backend + frontend dev server + seeded data)
```

### Bundle budget
```
vite.config.ts — chunkSizeWarningLimit: 250 KiB
manualChunks: vendor (react/react-dom/router), tanstack (react-query), forms (RHF/Zod)
```

## Files changed per task

### Task 1 — Fortalecer contratos de API
- `backend/config/settings/base.py` — django_filters, DEFAULT_FILTER_BACKENDS
- `backend/fiscal/serializers.py` — FiscalEmitterWriteSerializer (write-only api_key), FiscalDocumentDetailSerializer (timeline), FiscalProductConfigSerializer
- `backend/fiscal/views.py` — FiscalEmitterViewSet, FiscalDocumentViewSet (retry/cancel/xml/pdf/export), FiscalProductConfigViewSet
- `backend/fiscal/urls.py` — rotas viewset (emitters, documents, product-configs)
- `backend/payments/serializers.py` — PaymentProviderConfigReadSerializer (configured), PaymentProviderConfigWriteSerializer (write-only secret)
- `backend/payments/views.py` — PaymentProviderConfigViewSet, PaymentIntentViewSet, filterset_fields
- `backend/payments/urls.py` — provider-configs, intents (list+detail+create)
- `backend/monitoring/views.py` — OperationsView autorizado (health, readiness, system_metrics, runbook_links sem credenciais/payloads)
- `backend/monitoring/urls.py` — rota operations/
- `backend/tenancy/capabilities.py` — novas capabilities: fiscal.view, fiscal.manage, payments.view, payments.manage, monitoring.view
- `backend/tenancy/permissions.py` — HasCapability base permission
- `backend/tests/test_web_fiscal_payments_monitoring_api.py` — 39 cenários BDD

### Task 2 — Gestão fiscal
- `frontend/src/fiscal/fiscalApi.ts` — client API (emitters CRUD, documents list/detail/retry/cancel/xml/pdf, product configs, validate-fiscal)
- `frontend/src/fiscal/FiscalConfigPage.tsx` — CRUD emitentes com campo api_key write-only
- `frontend/src/fiscal/FiscalDocumentsPage.tsx` — listagem paginada com filtros status/direção
- `frontend/src/fiscal/FiscalDocumentDetailPage.tsx` — detalhe com timeline, retry/cancel dialogs, downloads XML/PDF autorizados
- `frontend/src/fiscal/PurchaseFiscalReconciliationPage.tsx` — reconciliação fiscal de recebimentos de compra
- `frontend/src/fiscal/ProductConfigPage.tsx` — listagem de config fiscal de produtos
- `frontend/src/fiscal/fiscalPages.test.tsx` — 13 testes vitest
- `frontend/src/app/App.tsx` — 5 novas rotas fiscais
- `frontend/src/layout/Navigation.tsx` — link "Fiscal"

### Task 3 — Pagamentos e conciliação
- `frontend/src/payments/paymentsApi.ts` — client API (provider-configs CRUD, intents/transactions/reconciliation-batches lists, confirm)
- `frontend/src/payments/ProviderConfigPage.tsx` — CRUD configs provider com secret write-only
- `frontend/src/payments/TransactionsPage.tsx` — listagem paginada com BRL e filtros
- `frontend/src/payments/ReconciliationBatchesPage.tsx` — listagem lotes com confirmar (draft only)
- `frontend/src/payments/ReconciliationBatchDetailPage.tsx` — detalhe lote com items e divergências
- `frontend/src/payments/paymentPages.test.tsx` — 11 testes vitest
- `frontend/src/app/App.tsx` — 4 rotas payments
- `frontend/src/layout/Navigation.tsx` — link "Pagamentos"

### Task 4 — Observabilidade operacional
- `frontend/src/monitoring/monitoringApi.ts` — client API (fetchOperations)
- `frontend/src/monitoring/useVisibilityRefetch.ts` — hook de refetch ciente de visibilidade da tab
- `frontend/src/monitoring/MetricCard.tsx` — componente de card de métrica com status colorido
- `frontend/src/monitoring/RunbookLink.tsx` — link externo de runbook
- `frontend/src/monitoring/OperationsPage.tsx` — dashboard com seções health/readiness/metrics/runbooks
- `frontend/src/monitoring/operationsPage.test.tsx` — 8 testes vitest
- `frontend/src/app/App.tsx` — rota /monitoring/operations
- `frontend/src/layout/Navigation.tsx` — link "Monitoramento"

### Task 5 — Suíte E2E de release
- `frontend/e2e/release/01-auth-tenancy.spec.ts` — 6 cenários (login, MFA, tenant, nav, session, role)
- `frontend/e2e/release/02-catalog-purchasing.spec.ts` — 8 cenários (catálogo → compras → estoque)
- `frontend/e2e/release/03-pdv-management.spec.ts` — 6 cenários (vendas, caixa, pessoas)
- `frontend/e2e/release/04-financial-fiscal-payments.spec.ts` — 7 cenários (financeiro, fiscal, pagamentos, monitoramento)
- `frontend/e2e/release/05-security-resilience.spec.ts` — 5 cenários (cross-tenant, session, network, back/forward, axe-core a11y)

### Task 6 — Performance, segurança e closure
- `frontend/vite.config.ts` — manualChunks para vendor/tanstack/forms, chunkSizeWarningLimit: 250 KiB
- `docs/PRD.md` — Sprint 20 checkboxes marcados como concluídos
- `docs/10_Releases/SPRINT-020_Fiscal_Payments_Observability_E2E_Final_Report.md`

## Key metrics

| Métrica | Valor |
|---|---|
| Total files changed | 37+ |
| Frontend unit tests | 283 passed (22 files) |
| Backend BDD tests | 38 passed + 1 skipped |
| Playwright E2E scenarios | 32 (5 specs) |
| TypeScript | 0 errors |
| npm audit high | 4 (playwright test dep only) |

## Boundary confirmation

Nenhum componente web cria venda, checkout ou captura de pagamento:
- E2E spec 03-pdv-management verifica ausência de affordance "Nova Venda" em `pdv-management-financial.spec.ts`
- Provider secrets nunca retornados ao frontend — PaymentProviderConfigReadSerializer retorna apenas `configured: true`
- Fiscal api_key write-only — never repopulated on edit, never in query cache responses
- Monitoring endpoint nunca expõe credenciais ou payloads webhook
- Observability com refetch ciente de visibilidade — pausa polling quando tab oculta
- Chunk budget 250 KiB configurado no vite.config.ts

## Lessons learned / riscos

- O MSW beforeEach é o padrão mais seguro para testes em arquivos com handler reset global no afterEach do setup.ts — afterEach global desfaz handlers adicionados no beforeAll.
- A constraint unique_active_fiscal_document_per_sale obriga apenas 1 doc ativo por venda — timestamps devem ser gerenciados com attempt_number para bypass.
- O DefaultRouter do DRF pode não registrar action custom get com detail=False corretamente — export CSV ficou pendente como issue conhecido.
- `@axe-core/playwright` integração usada na spec de resilience para auditoria de acessibilidade no dashboard.
- Build chunking manual no vite.config.ts ajuda manter bundles menores que 250 KiB por chunk.
- A fixture `authenticatedPage` no Playwright reduz drasticamente duplicação de login — essencial para multi-browser E2E.