# Sprint 21 — Estilização do Painel Web — Plano de Implementação

> **Branch:** `feat/sprint-21-styling` (criar a partir de `master`)
> **MO:** Aplicar Tailwind CSS v4 em todos os 17 módulos + layout sem quebrar testes.

---

## Pré-requisito

Tailwind CSS v4 já instalado. Verificar:
```bash
npx tailwindcss --help  # deve funcionar
```
`vite.config.ts` já tem `@tailwindcss/vite` plugin. `global.css` já tem `@import "tailwindcss"`.

---

## Task 1: Design tokens + componentes base

**Arquivos:**
- Modificar: `frontend/src/styles/global.css` — adicionar `@theme` block com tokens
- Criar: `frontend/src/components/ui/Button.tsx` + `Button.test.tsx`
- Criar: `frontend/src/components/ui/Card.tsx`
- Criar: `frontend/src/components/ui/Table.tsx`
- Criar: `frontend/src/components/ui/Badge.tsx`
- Criar: `frontend/src/components/ui/Modal.tsx`
- Criar: `frontend/src/components/ui/EmptyState.tsx`
- Criar: `frontend/src/components/ui/Skeleton.tsx`

**Tokens Tailwind:**
```css
@theme {
  --color-primary-50: #eff6ff;
  --color-primary-100: #dbeafe;
  --color-primary-200: #bfdbfe;
  --color-primary-300: #93c5fd;
  --color-primary-400: #60a5fa;
  --color-primary-500: #3b82f6;
  --color-primary-600: #2563eb;
  --color-primary-700: #1d4ed8;
  --color-primary-800: #1e40af;
  --color-primary-900: #1e3a8a;
  --color-success: #16a34a;
  --color-warning: #ca8a04;
  --color-danger: #dc2626;
  --color-neutral-50: #f9fafb;
  --color-neutral-100: #f3f4f6;
  --color-neutral-200: #e5e7eb;
  --color-neutral-300: #d1d5db;
  --color-neutral-400: #9ca3af;
  --color-neutral-500: #6b7280;
  --color-neutral-600: #4b5563;
  --color-neutral-700: #374151;
  --color-neutral-800: #1f2937;
  --color-neutral-900: #111827;
}
```

**Testes:** 1 test por componente (render + props básicas)

---

## Task 2: Layout + navegação

**Arquivos:**
- Modificar: `frontend/src/layout/AppShell.tsx`
- Modificar: `frontend/src/layout/AppShell.test.tsx`
- Modificar: `frontend/src/layout/Navigation.tsx`
- Modificar: `frontend/src/auth/LoginPage.tsx`
- Modificar: `frontend/src/auth/MfaPage.tsx`
- Modificar: `frontend/src/tenant/TenantSelector.tsx`

**Estilo:**
- AppShell: sidebar à esquerda (escura) + header fixo + content main
- Navigation: links com ícone, hover state, active state
- LoginPage: card centralizado, fundo gradiente suave
- MfaPage: mesmo layout do login
- TenantSelector: dropdown estilizado no header

**Testes:** Atualizar AppShell.test.tsx se necessário (links continuam os mesmos)

---

## Task 3: Dashboard + Organization + Access + Security

**Arquivos:**
- Modificar: `frontend/src/dashboard/DashboardPage.tsx`
- Modificar: `frontend/src/organization/CompaniesPage.tsx`
- Modificar: `frontend/src/organization/BranchesPage.tsx`
- Modificar: `frontend/src/access/MembersPage.tsx`
- Modificar: `frontend/src/access/InvitationsPage.tsx`
- Modificar: `frontend/src/security/MfaPolicyPage.tsx`
- Modificar: `frontend/src/devices/DevicesPage.tsx`

**Estilo:**
- DashboardPage: cards de módulo com grid, health status colorido
- CRUD pages: tabelas com Badge de status, formulários com Card

---

## Task 4: Catalog + Inventory + Purchasing

**Arquivos:**
- Modificar: todos os componentes em `frontend/src/catalog/`, `inventory/`, `purchasing/`

**Estilo:**
- ProductsPage: tabela com filtros inline, preço formatado
- BalancesPage: tabela com quantidades
- Forms: Card com grid de campos

---

## Task 5: Sales + People + Financial

**Arquivos:**
- Modificar: todos os componentes em `frontend/src/salesManagement/`, `people/`, `financial/`

**Estilo:**
- SaleDetailPage: seções em Cards (itens, pagamentos, timeline)
- PeoplePage: tabela com badges PF/PJ, seções colapsáveis
- Financial: tabelas com status colorido, settlement dialog

---

## Task 6: Fiscal + Payments + Monitoring

**Arquivos:**
- Modificar: todos os componentes em `frontend/src/fiscal/`, `payments/`, `monitoring/`

**Estilo:**
- FiscalConfigPage: secret field com eye toggle
- DocumentsPage: status timeline vertical
- OperationsPage: metric cards em grid com cor por severidade
- RunbookLink: card com ícone de link externo

---

## Task 7: E2E + Validação final

**Verificações:**
1. `npm run vitest` — 283+ tests (novos componentes) verdes
2. `npx tsc --noEmit` — 0 erros
3. `npx playwright test` — 10 specs (se backend rodando)
4. `python -m pytest backend/tests/test_web_*.py` — 98 tests verdes
5. Navegação visual em http://localhost:5173 — todas as páginas com estilo

**Arquivos:**
- Modificar: `docs/PRD.md` — Sprint 21 = Concluída
- Criar: `docs/10_Releases/SPRINT-021_Styling_Final_Report.md`

**Commit:** `feat: sprint 21 - estilizacao tailwind admin web`

---

## Resumo de tasks

| Task | Descrição | Arquivos | Dependência |
|:---|---:|---:|---:|
| 1 | Design tokens + componentes base | 8+ | Nenhuma |
| 2 | Layout + navegação | 6 | Task 1 |
| 3 | Dashboard + Org + Access + Security | 8 | Task 1, 2 |
| 4 | Catalog + Inventory + Purchasing | 18 | Task 1, 2 |
| 5 | Sales + People + Financial | 20 | Task 1, 2 |
| 6 | Fiscal + Payments + Monitoring | 15 | Task 1, 2 |
| 7 | E2E + Validação | 3 | Todas |
