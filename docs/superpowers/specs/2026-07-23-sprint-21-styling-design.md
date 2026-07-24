# Sprint 21 — Estilização do Painel Web Administrativo

## Objetivo

Aplicar estilização consistente em todos os módulos do frontend web usando Tailwind CSS v4, transformando o protótipo funcional em uma interface profissional e utilizável.

## Stack

- **Framework:** Tailwind CSS v4 (já instalado, `@tailwindcss/vite`)
- **Design Tokens:** já definidos em `src/styles/global.css` (cores, spacing, tipografia)
- **Abordagem:** utilitária — classes Tailwind diretamente nos componentes JSX
- **Ícones:** Heroicons ou Lucide React (a definir)

## Escopo

### Módulos a estilizar (17 páginas + layout)

| Módulo | Páginas | Prioridade |
|---|---|---|
| **Shell/Layout** | AppShell, Navigation, TenantSelector, LoginPage, MfaPage | P0 |
| **Dashboard** | DashboardPage | P0 |
| **Organization** | CompaniesPage, BranchesPage | P1 |
| **Access** | MembersPage, InvitationsPage | P1 |
| **Security** | MfaPolicyPage, DevicesPage | P1 |
| **Catalog** | ProductsPage, CategoriesPage, UnitsPage, ProductForm | P1 |
| **Inventory** | BalancesPage, MovementsPage, LotsPage, AdjustmentForm, TransferForm, ReceiptForm | P1 |
| **Purchasing** | SuppliersPage, SupplierForm, PurchaseOrdersPage, PurchaseOrderEditor, PurchaseOrderDetailPage | P1 |
| **Sales** | SalesPage, SaleDetailPage, CashSessionsPage, CashSessionDetailPage, ReturnDialog, CancellationDialog, RefundDialog | P2 |
| **People** | PeoplePage, PersonDetailPage, PersonForm, AddressesSection, ContactsSection, ConsentsSection | P2 |
| **Financial** | ReceivablesPage, PayablesPage, CashflowPage, ReportsPage, SettlementDialog | P2 |
| **Fiscal** | FiscalConfigPage, FiscalDocumentsPage, FiscalDocumentDetailPage, PurchaseFiscalReconciliationPage, ProductConfigPage | P2 |
| **Payments** | ProviderConfigPage, TransactionsPage, ReconciliationBatchesPage, ReconciliationBatchDetailPage | P2 |
| **Monitoring** | OperationsPage, MetricCard, RunbookLink | P3 |

### Componentes compartilhados

- **Button** — variantes primary/secondary/danger/ghost com loading state
- **Card** — container com padding, sombra, borda arredondada
- **Table** — linhas zebradas, header escuro, hover
- **FormField** — label + input + erro
- **Dialog/Modal** — overlay, título, corpo, ações
- **Badge** — status colors (success/warning/error/info)
- **Pagination** — botões anterior/próximo com números
- **Loading/Skeleton** — estado de carregamento
- **EmptyState** — estado vazio com ícone e mensagem
- **ErrorState** — estado de erro com mensagem

### Design System (CSS custom properties)

As variáveis existentes em `global.css` serão usadas como tokens do Tailwind via `@theme`:

```css
@theme {
  --color-primary-50: #eff6ff;
  --color-primary-100: #dbeafe;
  ...
  --font-sans: system-ui, ...;
}
```

## Fora do escopo

- Animações complexas (micro-interações)
- Modo escuro
- Responsividade mobile (prioridade desktop)
- Testes visuais (regression screenshots)

## Critérios de aceite

- Todas as páginas navegáveis têm layout visual consistente
- Estados de loading, vazio e erro têm feedback visual
- Componentes compartilhados (Button, Card, Table) são reutilizados em todos os módulos
- Nenhum teste existente quebra (283 vitest, 98 backend)
- TypeScript 0 erros
