import { lazy, Suspense, type ReactNode } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'

import { AuthProvider } from '@/auth/AuthProvider'
import LoginPage from '@/auth/LoginPage'
import MfaPage from '@/auth/MfaPage'
import ProtectedRoute from '@/auth/ProtectedRoute'
import { TenantProvider, useTenant } from '@/tenant/TenantProvider'
import { OrganizationProvider } from '@/organization/OrganizationProvider'
import AppShell from '@/layout/AppShell'
import ErrorState from '@/errors/ErrorState'
import AppErrorBoundary from '@/errors/AppErrorBoundary'
import LandingPage from '@/marketing/LandingPage'
const DashboardPage = lazy(() => import('@/dashboard/DashboardPage'))
const FavoritesPage = lazy(() => import('@/favorites/FavoritesPage'))
const CompaniesPage = lazy(() => import('@/organization/CompaniesPage'))
const BranchesPage = lazy(() => import('@/organization/BranchesPage'))
const MembersPage = lazy(() => import('@/access/MembersPage'))
const InvitationsPage = lazy(() => import('@/access/InvitationsPage'))
const MfaPolicyPage = lazy(() => import('@/security/MfaPolicyPage'))
const DevicesPage = lazy(() => import('@/devices/DevicesPage'))
const ProductsPage = lazy(() => import('@/catalog/ProductsPage'))
const CatalogHomePage = lazy(() => import('@/catalog/CatalogHomePage'))
const ProductEditorPage = lazy(() => import('@/catalog/ProductEditorPage'))
const SprintR4Page = lazy(() =>
  import('@/catalog/ProductPricesStep').then(({ SprintR4Page }) => ({
    default: SprintR4Page,
  })),
)
const ServicesPage = lazy(() => import('@/catalog/ServicesPage'))
const ServiceEditorPage = lazy(() => import('@/catalog/ServiceEditorPage'))
const CategoriesPage = lazy(() => import('@/catalog/CategoriesPage'))
const UnitsPage = lazy(() => import('@/catalog/UnitsPage'))
const BrandsPage = lazy(() => import('@/catalog/BrandsPage'))
const CombosPage = lazy(() => import('@/catalog/CombosPage'))
const ComboEditorPage = lazy(() => import('@/catalog/ComboEditorPage'))
const LabelsPage = lazy(() => import('@/catalog/LabelsPage'))
const BalancesPage = lazy(() => import('@/inventory/BalancesPage'))
const MovementsPage = lazy(() => import('@/inventory/MovementsPage'))
const LotsPage = lazy(() => import('@/inventory/LotsPage'))
const SuppliersPage = lazy(() => import('@/purchasing/SuppliersPage'))
const PurchaseOrdersPage = lazy(() => import('@/purchasing/PurchaseOrdersPage'))
const ReceivablesPage = lazy(() => import('@/financial/ReceivablesPage'))
const PayablesPage = lazy(() => import('@/financial/PayablesPage'))
const CashflowPage = lazy(() => import('@/financial/CashflowPage'))
const ReportsPage = lazy(() => import('@/financial/ReportsPage'))
const BankReconciliationPage = lazy(
  () => import('@/financial/BankReconciliationPage'),
)
const FinancialStatementPage = lazy(
  () => import('@/financial/FinancialStatementPage'),
)
const SalesPage = lazy(() => import('@/salesManagement/SalesPage'))
const SaleDetailPage = lazy(() => import('@/salesManagement/SaleDetailPage'))
const CashSessionsPage = lazy(
  () => import('@/salesManagement/CashSessionsPage'),
)
const CashSessionDetailPage = lazy(
  () => import('@/salesManagement/CashSessionDetailPage'),
)
const PeoplePage = lazy(() => import('@/people/PeoplePage'))
const PersonDetailPage = lazy(() => import('@/people/PersonDetailPage'))
const PurchaseOrderEditor = lazy(
  () => import('@/purchasing/PurchaseOrderEditor'),
)
const PurchaseOrderDetailPage = lazy(
  () => import('@/purchasing/PurchaseOrderDetailPage'),
)
const FiscalConfigPage = lazy(() => import('@/fiscal/FiscalConfigPage'))
const FiscalDocumentsPage = lazy(() => import('@/fiscal/FiscalDocumentsPage'))
const FiscalDocumentDetailPage = lazy(
  () => import('@/fiscal/FiscalDocumentDetailPage'),
)
const PurchaseFiscalReconciliationPage = lazy(
  () => import('@/fiscal/PurchaseFiscalReconciliationPage'),
)
const ProductConfigPage = lazy(() => import('@/fiscal/ProductConfigPage'))
const ProviderConfigPage = lazy(() => import('@/payments/ProviderConfigPage'))
const TransactionsPage = lazy(() => import('@/payments/TransactionsPage'))
const ReconciliationBatchesPage = lazy(
  () => import('@/payments/ReconciliationBatchesPage'),
)
const ReconciliationBatchDetailPage = lazy(
  () => import('@/payments/ReconciliationBatchDetailPage'),
)
const OperationsPage = lazy(() => import('@/monitoring/OperationsPage'))

export function AppRouteFallback(): ReactNode {
  return (
    <div role="status" aria-label="Carregando aplicação" aria-live="polite">
      Carregando aplicação…
    </div>
  )
}

function NotFoundPage(): ReactNode {
  return <ErrorState status={404} />
}

function AdminOnly({ children }: { children: ReactNode }): ReactNode {
  const { selectedTenant } = useTenant()
  if (selectedTenant?.role !== 'admin') {
    return <ErrorState status={403} />
  }
  return children
}

function AdminRoutes(): ReactNode {
  return (
    <AuthProvider>
      <TenantProvider>
        <OrganizationProvider>
          <AppErrorBoundary>
            <Routes>
              <Route
                path="/app"
                element={
                  <Suspense fallback={<AppRouteFallback />}>
                    <ProtectedRoute>
                      <AppShell />
                    </ProtectedRoute>
                  </Suspense>
                }
              >
                <Route index element={<DashboardPage />} />
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="favorites" element={<FavoritesPage />} />
                <Route path="catalog" element={<CatalogHomePage />} />
                <Route path="catalog/products" element={<ProductsPage />} />
                <Route
                  path="catalog/products/new"
                  element={<ProductEditorPage />}
                />
                <Route
                  path="catalog/products/:productId/edit"
                  element={<ProductEditorPage />}
                />
                <Route
                  path="catalog/products/:productId/prices"
                  element={<SprintR4Page />}
                />
                <Route path="catalog/services" element={<ServicesPage />} />
                <Route
                  path="catalog/services/new"
                  element={<ServiceEditorPage />}
                />
                <Route
                  path="catalog/services/:id/edit"
                  element={<ServiceEditorPage />}
                />
                <Route path="catalog/categories" element={<CategoriesPage />} />
                <Route path="catalog/units" element={<UnitsPage />} />
                <Route path="catalog/brands" element={<BrandsPage />} />
                <Route path="catalog/combos" element={<CombosPage />} />
                <Route
                  path="catalog/combos/new"
                  element={<ComboEditorPage />}
                />
                <Route
                  path="catalog/combos/:comboId/edit"
                  element={<ComboEditorPage />}
                />
                <Route path="catalog/labels" element={<LabelsPage />} />
                <Route path="inventory" element={<BalancesPage />} />
                <Route path="inventory/balances" element={<BalancesPage />} />
                <Route path="inventory/movements" element={<MovementsPage />} />
                <Route path="inventory/lots" element={<LotsPage />} />
                <Route path="sales" element={<SalesPage />} />
                <Route path="sales/:id" element={<SaleDetailPage />} />
                <Route path="financial" element={<p>Financeiro</p>} />
                <Route
                  path="financial/receivables"
                  element={<ReceivablesPage />}
                />
                <Route path="financial/payables" element={<PayablesPage />} />
                <Route path="financial/cashflow" element={<CashflowPage />} />
                <Route
                  path="financial/bank-reconciliations"
                  element={<BankReconciliationPage />}
                />
                <Route
                  path="financial/statement"
                  element={<FinancialStatementPage />}
                />
                <Route path="financial/reports" element={<ReportsPage />} />
                <Route
                  path="financial/cash-sessions"
                  element={<CashSessionsPage />}
                />
                <Route
                  path="financial/cash-sessions/:id"
                  element={<CashSessionDetailPage />}
                />
                <Route path="people" element={<PeoplePage />} />
                <Route path="people/:id" element={<PersonDetailPage />} />
                <Route path="settings" element={<p>Configurações</p>} />
                <Route
                  path="organization/companies"
                  element={<CompaniesPage />}
                />
                <Route
                  path="organization/branches"
                  element={<BranchesPage />}
                />
                <Route path="access/members" element={<MembersPage />} />
                <Route
                  path="access/invitations"
                  element={<InvitationsPage />}
                />
                <Route path="security/mfa" element={<MfaPolicyPage />} />
                <Route path="devices" element={<DevicesPage />} />
                <Route
                  path="purchasing/suppliers"
                  element={<SuppliersPage />}
                />
                <Route
                  path="purchasing/orders"
                  element={<PurchaseOrdersPage />}
                />
                <Route
                  path="purchasing/orders/new"
                  element={<PurchaseOrderEditor />}
                />
                <Route
                  path="purchasing/orders/:id"
                  element={<PurchaseOrderDetailPage />}
                />
                <Route
                  path="purchasing/orders/:id/edit"
                  element={<PurchaseOrderEditor />}
                />
                <Route
                  path="fiscal/emitters"
                  element={
                    <AdminOnly>
                      <FiscalConfigPage />
                    </AdminOnly>
                  }
                />
                <Route
                  path="fiscal/documents"
                  element={<FiscalDocumentsPage />}
                />
                <Route
                  path="fiscal/documents/:id"
                  element={<FiscalDocumentDetailPage />}
                />
                <Route
                  path="fiscal/reconciliation"
                  element={<PurchaseFiscalReconciliationPage />}
                />
                <Route
                  path="fiscal/product-configs"
                  element={<ProductConfigPage />}
                />
                <Route
                  path="payments/provider-configs"
                  element={<ProviderConfigPage />}
                />
                <Route
                  path="payments/transactions"
                  element={<TransactionsPage />}
                />
                <Route
                  path="payments/reconciliation-batches"
                  element={<ReconciliationBatchesPage />}
                />
                <Route
                  path="payments/reconciliation-batches/:id"
                  element={<ReconciliationBatchDetailPage />}
                />
                <Route
                  path="monitoring/operations"
                  element={<OperationsPage />}
                />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </AppErrorBoundary>
        </OrganizationProvider>
      </TenantProvider>
    </AuthProvider>
  )
}

export default function App(): ReactNode {
  const { pathname } = useLocation()

  if (pathname === '/login' || pathname === '/mfa') {
    return (
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/mfa" element={<MfaPage />} />
        </Routes>
      </AuthProvider>
    )
  }

  if (pathname === '/app' || pathname.startsWith('/app/')) {
    return <AdminRoutes />
  }

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
