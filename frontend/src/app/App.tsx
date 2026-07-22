import type { ReactNode } from 'react'
import { Routes, Route } from 'react-router-dom'

import { AuthProvider } from '@/auth/AuthProvider'
import LoginPage from '@/auth/LoginPage'
import MfaPage from '@/auth/MfaPage'
import ProtectedRoute from '@/auth/ProtectedRoute'
import { TenantProvider } from '@/tenant/TenantProvider'
import { OrganizationProvider } from '@/organization/OrganizationProvider'
import AppShell from '@/layout/AppShell'
import ErrorState from '@/errors/ErrorState'
import DashboardPage from '@/dashboard/DashboardPage'
import CompaniesPage from '@/organization/CompaniesPage'
import BranchesPage from '@/organization/BranchesPage'
import MembersPage from '@/access/MembersPage'
import InvitationsPage from '@/access/InvitationsPage'
import MfaPolicyPage from '@/security/MfaPolicyPage'
import DevicesPage from '@/devices/DevicesPage'
import SuppliersPage from '@/purchasing/SuppliersPage'
import PurchaseOrdersPage from '@/purchasing/PurchaseOrdersPage'
import PurchaseOrderEditor from '@/purchasing/PurchaseOrderEditor'
import PurchaseOrderDetailPage from '@/purchasing/PurchaseOrderDetailPage'

function NotFoundPage(): ReactNode {
  return <ErrorState status={404} />
}

export default function App(): ReactNode {
  return (
    <AuthProvider>
      <TenantProvider>
        <OrganizationProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
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
              <Route path="catalog" element={<p>Catálogo</p>} />
              <Route path="inventory" element={<p>Estoque</p>} />
              <Route path="sales" element={<p>Vendas</p>} />
              <Route path="financial" element={<p>Financeiro</p>} />
              <Route path="people" element={<p>Pessoas</p>} />
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
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </OrganizationProvider>
      </TenantProvider>
    </AuthProvider>
  )
}
