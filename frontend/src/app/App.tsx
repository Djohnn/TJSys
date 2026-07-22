import type { ReactNode } from 'react'
import { Routes, Route } from 'react-router-dom'

import { AuthProvider } from '@/auth/AuthProvider'
import LoginPage from '@/auth/LoginPage'
import MfaPage from '@/auth/MfaPage'
import ProtectedRoute from '@/auth/ProtectedRoute'
import { TenantProvider } from '@/tenant/TenantProvider'
import TenantSelector from '@/tenant/TenantSelector'

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
                <Shell />
              </ProtectedRoute>
            }
          />
        </Routes>
      </TenantProvider>
    </AuthProvider>
  )
}

function Shell() {
  return (
    <>
      <header>
        <h1>Zyrp ERP</h1>
      </header>
      <nav>
        <TenantSelector />
      </nav>
      <main>
        <p>Bem-vindo ao Zyrp ERP.</p>
      </main>
    </>
  )
}
