import type { ReactNode } from 'react'
import { Routes, Route } from 'react-router-dom'

import { AuthProvider } from '@/auth/AuthProvider'
import LoginPage from '@/auth/LoginPage'
import MfaPage from '@/auth/MfaPage'
import ProtectedRoute from '@/auth/ProtectedRoute'
import { TenantProvider } from '@/tenant/TenantProvider'
import AppShell from '@/layout/AppShell'
import ErrorState from '@/errors/ErrorState'

function NotFoundPage(): ReactNode {
  return <ErrorState status={404} />
}

export default function App(): ReactNode {
  return (
    <AuthProvider>
      <TenantProvider>
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
            <Route index element={<p>Bem-vindo ao Zyrp ERP.</p>} />
            <Route path="catalog" element={<p>Catálogo</p>} />
            <Route path="inventory" element={<p>Estoque</p>} />
            <Route path="sales" element={<p>Vendas</p>} />
            <Route path="financial" element={<p>Financeiro</p>} />
            <Route path="people" element={<p>Pessoas</p>} />
            <Route path="settings" element={<p>Configurações</p>} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </TenantProvider>
    </AuthProvider>
  )
}
