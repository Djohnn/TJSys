import type { ReactNode } from 'react'
import { Routes, Route } from 'react-router-dom'

import { AuthProvider } from '@/auth/AuthProvider'
import LoginPage from '@/auth/LoginPage'
import RegisterPage from '@/auth/RegisterPage'
import ConfirmEmailPage from '@/auth/ConfirmEmailPage'
import MfaPage from '@/auth/MfaPage'
import ProtectedRoute from '@/auth/ProtectedRoute'
import { TenantProvider } from '@/tenant/TenantProvider'
import { OrganizationProvider } from '@/organization/OrganizationProvider'
import AppShell from '@/layout/AppShell'
import ErrorState from '@/errors/ErrorState'
import DashboardPage from '@/dashboard/DashboardPage'
import FavoritesPage from '@/favorites/FavoritesPage'
import CompaniesPage from '@/organization/CompaniesPage'
import BranchesPage from '@/organization/BranchesPage'
import MembersPage from '@/access/MembersPage'
import InvitationsPage from '@/access/InvitationsPage'
import MfaPolicyPage from '@/security/MfaPolicyPage'
import DevicesPage from '@/devices/DevicesPage'
import ProductsPage from '@/catalog/ProductsPage'
import CatalogHomePage from '@/catalog/CatalogHomePage'
import ProductEditorPage from '@/catalog/ProductEditorPage'
import { SprintR4Page } from '@/catalog/ProductPricesStep'
import ServicesPage from '@/catalog/ServicesPage'
import ServiceEditorPage from '@/catalog/ServiceEditorPage'
import CategoriesPage from '@/catalog/CategoriesPage'
import UnitsPage from '@/catalog/UnitsPage'
import BrandsPage from '@/catalog/BrandsPage'
import CombosPage from '@/catalog/CombosPage'
import ComboEditorPage from '@/catalog/ComboEditorPage'
import LabelsPage from '@/catalog/LabelsPage'
import BalancesPage from '@/inventory/BalancesPage'
import MovementsPage from '@/inventory/MovementsPage'
import LotsPage from '@/inventory/LotsPage'
import SuppliersPage from '@/purchasing/SuppliersPage'
import PurchaseOrdersPage from '@/purchasing/PurchaseOrdersPage'
import ReceivablesPage from '@/financial/ReceivablesPage'
import PayablesPage from '@/financial/PayablesPage'
import CashflowPage from '@/financial/CashflowPage'
import ReportsPage from '@/financial/ReportsPage'
import BankReconciliationPage from '@/financial/BankReconciliationPage'
import FinancialStatementPage from '@/financial/FinancialStatementPage'
import SalesPage from '@/salesManagement/SalesPage'
import SaleDetailPage from '@/salesManagement/SaleDetailPage'
import CashSessionsPage from '@/salesManagement/CashSessionsPage'
import CashSessionDetailPage from '@/salesManagement/CashSessionDetailPage'
import PeoplePage from '@/people/PeoplePage'
import PersonDetailPage from '@/people/PersonDetailPage'
import PurchaseOrderEditor from '@/purchasing/PurchaseOrderEditor'
import PurchaseOrderDetailPage from '@/purchasing/PurchaseOrderDetailPage'
import FiscalConfigPage from '@/fiscal/FiscalConfigPage'
import FiscalDocumentsPage from '@/fiscal/FiscalDocumentsPage'
import FiscalDocumentDetailPage from '@/fiscal/FiscalDocumentDetailPage'
import PurchaseFiscalReconciliationPage from '@/fiscal/PurchaseFiscalReconciliationPage'
import ProductConfigPage from '@/fiscal/ProductConfigPage'
import ProviderConfigPage from '@/payments/ProviderConfigPage'
import TransactionsPage from '@/payments/TransactionsPage'
import ReconciliationBatchesPage from '@/payments/ReconciliationBatchesPage'
import ReconciliationBatchDetailPage from '@/payments/ReconciliationBatchDetailPage'
import OperationsPage from '@/monitoring/OperationsPage'
import { useTenant } from '@/tenant/TenantProvider'

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

export default function App(): ReactNode {
  return (
    <AuthProvider>
      <TenantProvider>
        <OrganizationProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/confirm-email" element={<ConfirmEmailPage />} />
            <Route path="/mfa" element={<MfaPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="favorites" element={<FavoritesPage />} />
              <Route path="catalog" element={<CatalogHomePage />} />
              <Route path="catalog/products" element={<ProductsPage />} />
              <Route path="catalog/products/new" element={<ProductEditorPage />} />
              <Route path="catalog/products/:productId/edit" element={<ProductEditorPage />} />
              <Route path="catalog/products/:productId/prices" element={<SprintR4Page />} />
              <Route path="catalog/services" element={<ServicesPage />} />
              <Route path="catalog/services/new" element={<ServiceEditorPage />} />
              <Route path="catalog/services/:id/edit" element={<ServiceEditorPage />} />
              <Route path="catalog/categories" element={<CategoriesPage />} />
              <Route path="catalog/units" element={<UnitsPage />} />
              <Route path="catalog/brands" element={<BrandsPage />} />
              <Route path="catalog/combos" element={<CombosPage />} />
              <Route path="catalog/combos/new" element={<ComboEditorPage />} />
              <Route path="catalog/combos/:comboId/edit" element={<ComboEditorPage />} />
              <Route path="catalog/labels" element={<LabelsPage />} />
              <Route path="inventory" element={<BalancesPage />} />
              <Route path="inventory/balances" element={<BalancesPage />} />
              <Route path="inventory/movements" element={<MovementsPage />} />
              <Route path="inventory/lots" element={<LotsPage />} />
              <Route path="sales" element={<SalesPage />} />
              <Route path="sales/:id" element={<SaleDetailPage />} />
              <Route path="financial" element={<p>Financeiro</p>} />
              <Route path="financial/receivables" element={<ReceivablesPage />} />
              <Route path="financial/payables" element={<PayablesPage />} />
              <Route path="financial/cashflow" element={<CashflowPage />} />
              <Route path="financial/bank-reconciliations" element={<BankReconciliationPage />} />
              <Route path="financial/statement" element={<FinancialStatementPage />} />
              <Route path="financial/reports" element={<ReportsPage />} />
              <Route path="financial/cash-sessions" element={<CashSessionsPage />} />
              <Route path="financial/cash-sessions/:id" element={<CashSessionDetailPage />} />
              <Route path="people" element={<PeoplePage />} />
              <Route path="people/:id" element={<PersonDetailPage />} />
              <Route path="settings" element={<p>Configurações</p>} />
              <Route path="organization/companies" element={<CompaniesPage />} />
              <Route path="organization/branches" element={<BranchesPage />} />
              <Route path="access/members" element={<MembersPage />} />
              <Route path="access/invitations" element={<InvitationsPage />} />
              <Route path="security/mfa" element={<MfaPolicyPage />} />
              <Route path="devices" element={<DevicesPage />} />
              <Route path="purchasing/suppliers" element={<SuppliersPage />} />
              <Route path="purchasing/orders" element={<PurchaseOrdersPage />} />
              <Route path="purchasing/orders/new" element={<PurchaseOrderEditor />} />
              <Route path="purchasing/orders/:id" element={<PurchaseOrderDetailPage />} />
              <Route path="purchasing/orders/:id/edit" element={<PurchaseOrderEditor />} />
              <Route
                path="fiscal/emitters"
                element={<AdminOnly><FiscalConfigPage /></AdminOnly>}
              />
              <Route path="fiscal/documents" element={<FiscalDocumentsPage />} />
              <Route path="fiscal/documents/:id" element={<FiscalDocumentDetailPage />} />
              <Route path="fiscal/reconciliation" element={<PurchaseFiscalReconciliationPage />} />
              <Route path="fiscal/product-configs" element={<ProductConfigPage />} />
              <Route path="payments/provider-configs" element={<ProviderConfigPage />} />
              <Route path="payments/transactions" element={<TransactionsPage />} />
              <Route path="payments/reconciliation-batches" element={<ReconciliationBatchesPage />} />
              <Route path="payments/reconciliation-batches/:id" element={<ReconciliationBatchDetailPage />} />
              <Route path="monitoring/operations" element={<OperationsPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </OrganizationProvider>
      </TenantProvider>
    </AuthProvider>
  )
}
